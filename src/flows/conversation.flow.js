// src/flows/conversation.flow.js
import { config }          from '../config/env.js';
import { logger }          from '../config/logger.js';
import { SessionService }  from '../services/session.service.js';
import { CatalogService }  from '../services/catalog.service.js';
import { WhatsAppService } from '../services/whatsapp.service.js';
import { MSG }             from './messages.js';
import {
  STEPS, RESET_KEYWORDS, HANDOFF_KEYWORDS,
  BUDGETS, EMPLOYMENTS,
} from './steps.js';

const delay = (ms) => new Promise(r => setTimeout(r, ms));

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

async function send(userId, text) {
  if (!text) return;
  await WhatsAppService.sendText(userId, text);
}

async function notifyAdvisor(text) {
  if (!config.advisor.phone) return;
  await WhatsAppService.sendText(`${config.advisor.phone}@s.whatsapp.net`, text);
}

function inputNum(input) {
  return input.replace(/[^\d]/g, '');
}

// ─────────────────────────────────────────────────────────────────────────────
// HANDLERS DE CADA STEP
// ─────────────────────────────────────────────────────────────────────────────

async function handleWelcome(userId, session, pushName) {
  if (pushName && !session.pushName) session.pushName = pushName;
  session.step = STEPS.MENU;
  await SessionService.save(session);

  await send(userId, MSG.welcome());
  await delay(500);
  await send(userId, MSG.menu());
}

async function handleMenu(userId, session, input) {
  const n = inputNum(input);

  if (n === '1') {
    // Ver catálogo
    session.step = STEPS.CATALOG_CATEGORY;
    session.catalog = { category: null, vehicleIndex: null };
    await SessionService.save(session);
    logger.info(`[Flow] → Catálogo para ${userId}`);
    return send(userId, MSG.catalogIntro());
  }

  if (n === '2') {
    // Cotizar
    session.step = STEPS.CAPTURE_INTEREST;
    await SessionService.save(session);
    return send(userId, MSG.askInterest(session.pushName));
  }

  if (n === '3') {
    // Financiación
    session.step = STEPS.FINANCING_OPTIONS;
    await SessionService.save(session);
    await send(userId, MSG.financingInfo());
    await delay(400);
    return send(userId, MSG.financingOptions());
  }

  if (n === '4' || HANDOFF_KEYWORDS.some(k => input.includes(k))) {
    return triggerHandoffDirect(userId, session);
  }

  return send(userId, MSG.fallback());
}

// ── Catálogo ────────────────────────────────────────────────────────────────

async function handleCatalogCategory(userId, session, input) {
  const n   = inputNum(input);
  const cats = CatalogService.getCategories();

  let vehicles;

  if (n === '1' || input.includes('todo')) {
    vehicles = CatalogService.getAll();
    session.catalog.category = 'Todos';
  } else {
    const idx = parseInt(n) - 2; // opción 2 = cats[0], etc.
    if (idx >= 0 && idx < cats.length) {
      session.catalog.category = cats[idx].name;
      vehicles = CatalogService.getByCategory(cats[idx].name);
    } else {
      return send(userId, MSG.fallback());
    }
  }

  session.step = STEPS.CATALOG_LIST;
  session.catalog.vehicleList = vehicles.map(v => v.modelo); // guardar lista actual
  await SessionService.save(session);

  logger.info(`[Flow] Catálogo ${session.catalog.category}: ${vehicles.length} modelos`);
  await send(userId, MSG.vehicleList(vehicles));
}

async function handleCatalogList(userId, session, input) {
  const n        = parseInt(inputNum(input));
  const vehicles = (session.catalog.vehicleList || [])
    .map(name => CatalogService.getByName(name))
    .filter(Boolean);

  if (!n || n < 1 || n > vehicles.length) {
    return send(userId, `Elige un número del 1 al ${vehicles.length} 👇`);
  }

  const vehicle = vehicles[n - 1];
  session.step              = STEPS.VEHICLE_DETAIL;
  session.catalog.vehicleIndex = n - 1;
  session.lead.interest        = vehicle.modelo;
  await SessionService.save(session);

  logger.info(`[Flow] Vehículo seleccionado: ${vehicle.modelo}`);
  await send(userId, MSG.vehicleDetail(vehicle));
  await delay(400);
  const portfolioMsg = MSG.portfolioLink();
  if (portfolioMsg) await send(userId, portfolioMsg);
  await delay(300);
  await send(userId, MSG.vehicleOptions());
}

async function handleVehicleDetail(userId, session, input) {
  const n = inputNum(input);

  if (n === '1') {
    // Cotizar este vehículo → saltar al presupuesto (el interés ya está)
    session.step = STEPS.CAPTURE_BUDGET;
    await SessionService.save(session);
    return send(userId, MSG.askBudget());
  }

  if (n === '2') {
    // Ver otros modelos → volver a la lista
    session.step = STEPS.CATALOG_CATEGORY;
    await SessionService.save(session);
    return send(userId, MSG.catalogIntro());
  }

  if (n === '3') {
    return triggerHandoffDirect(userId, session);
  }

  return send(userId, MSG.fallback());
}

// ── Cotización ───────────────────────────────────────────────────────────────

async function handleCaptureInterest(userId, session, input) {
  if (input === 'catalogo' || input === 'catálogo') {
    session.step = STEPS.CATALOG_CATEGORY;
    await SessionService.save(session);
    return send(userId, MSG.catalogIntro());
  }

  // Buscar si el texto coincide con algún modelo
  const vehicle = CatalogService.getByName(input);
  session.lead.interest = vehicle ? vehicle.modelo : input;
  session.step = STEPS.CAPTURE_BUDGET;
  await SessionService.save(session);
  return send(userId, MSG.askBudget());
}

async function handleCaptureBudget(userId, session, input) {
  const n = parseInt(inputNum(input));
  if (!n || n < 1 || n > BUDGETS.length) return send(userId, MSG.fallback());

  session.lead.budget = BUDGETS[n - 1];
  session.step = STEPS.CAPTURE_EMPLOYMENT;
  await SessionService.save(session);
  return send(userId, MSG.askEmployment());
}

async function handleCaptureEmployment(userId, session, input) {
  const n = parseInt(inputNum(input));
  if (!n || n < 1 || n > EMPLOYMENTS.length) return send(userId, MSG.invalidEmployment());

  session.lead.employment = EMPLOYMENTS[n - 1];
  session.step = STEPS.CAPTURE_INCOME;
  await SessionService.save(session);
  return send(userId, MSG.askIncome());
}

async function handleCaptureIncome(userId, session, input) {
  if (input.length < 4) return send(userId, MSG.invalidIncome());

  session.lead.income = input;
  session.step = STEPS.CREDIT_CHECK;
  await SessionService.save(session);
  return send(userId, MSG.askCreditCheck());
}

async function handleCreditCheck(userId, session, input) {
  const n = inputNum(input);
  const map = { '1': 'clean', '2': 'reported', '3': 'unknown' };
  const status = map[n];

  if (!status) return send(userId, MSG.fallback());

  session.lead.creditStatus = status;
  session.step = STEPS.ASK_LEAD_NAME;
  await SessionService.save(session);

  const msg =
    status === 'clean'    ? MSG.creditClean() :
    status === 'reported' ? MSG.creditReported() : MSG.creditUnknown();

  await send(userId, msg);
  await delay(400);
  return send(userId, MSG.askLeadName());
}

async function handleAskLeadName(userId, session, input) {
  if (input.length < 3 || /^\d+$/.test(input)) return send(userId, MSG.invalidLeadName());

  session.lead.name = input;
  session.step = STEPS.ASK_LEAD_PHONE;
  await SessionService.save(session);
  return send(userId, MSG.askLeadPhone(input));
}

async function handleAskLeadPhone(userId, session, input) {
  const digits = inputNum(input);
  if (digits.length < 7) return send(userId, MSG.invalidLeadPhone());

  session.lead.phone = digits;
  session.step       = STEPS.DONE;
  session.advisorTook = true;
  session.handoffMode = true;
  await SessionService.save(session);

  await send(userId, MSG.handoff(session.lead.name));
  await notifyAdvisor(MSG.handoffAdvisor(session.lead));

  logger.info(`[Flow] ✅ Lead completado: ${session.lead.name} (${digits})`);
}

// ── Financiación ─────────────────────────────────────────────────────────────

async function handleFinancingOptions(userId, session, input) {
  const n = inputNum(input);

  if (n === '1') return triggerHandoffDirect(userId, session);

  if (n === '2') {
    session.step = STEPS.CATALOG_CATEGORY;
    await SessionService.save(session);
    return send(userId, MSG.catalogIntro());
  }

  if (n === '3') {
    session.step = STEPS.MENU;
    await SessionService.save(session);
    await send(userId, MSG.welcome());
    await delay(400);
    return send(userId, MSG.menu());
  }

  return send(userId, MSG.fallback());
}

// ── Handoff directo ──────────────────────────────────────────────────────────

async function triggerHandoffDirect(userId, session) {
  session.advisorTook = true;
  session.step        = STEPS.DONE;
  await SessionService.save(session);

  await send(userId, MSG.handoffDirect());
  await notifyAdvisor(MSG.handoffAdvisorDirect(session.lead));

  logger.info(`[Flow] 💬 Handoff directo para ${userId}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// ENTRADA PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

export async function handleMessage({ userId, text, pushName }) {
  logger.info(`[Flow] ▶ ${userId} (${pushName}): "${text?.substring(0, 60)}"`);

  if (await SessionService.isGloballyPaused()) return;
  if (await SessionService.isExcluded(userId)) return;

  const session = await SessionService.get(userId);
  const input   = (text || '').trim().toLowerCase();

  if (pushName && !session.pushName) session.pushName = pushName;

  // Asesora atendiendo — bot silencioso
  if (session.advisorTook || session.handoffMode) {
    // Permite reset manual si el cliente escribe "menu"
    if (RESET_KEYWORDS.includes(input)) {
      session.advisorTook = false;
      session.handoffMode = false;
      session.step        = STEPS.WELCOME;
      await SessionService.save(session);
      return handleWelcome(userId, session, pushName);
    }
    logger.info(`[Flow] ⏸ Asesora atiende — bot silencioso para ${userId}`);
    return;
  }

  // Keywords globales de reset
  if (RESET_KEYWORDS.includes(input)) {
    session.step        = STEPS.WELCOME;
    session.advisorTook = false;
    session.handoffMode = false;
    await SessionService.save(session);
    return handleWelcome(userId, session, pushName);
  }

  // Handoff keywords en cualquier punto del flujo
  if (HANDOFF_KEYWORDS.some(k => input.includes(k)) && session.step !== STEPS.MENU) {
    return triggerHandoffDirect(userId, session);
  }

  logger.info(`[Flow] step=${session.step}`);

  switch (session.step) {
    case STEPS.WELCOME:           return handleWelcome(userId, session, pushName);
    case STEPS.MENU:              return handleMenu(userId, session, input);
    case STEPS.CATALOG_CATEGORY:  return handleCatalogCategory(userId, session, input);
    case STEPS.CATALOG_LIST:      return handleCatalogList(userId, session, input);
    case STEPS.VEHICLE_DETAIL:    return handleVehicleDetail(userId, session, input);
    case STEPS.CAPTURE_INTEREST:  return handleCaptureInterest(userId, session, input);
    case STEPS.CAPTURE_BUDGET:    return handleCaptureBudget(userId, session, input);
    case STEPS.CAPTURE_EMPLOYMENT:return handleCaptureEmployment(userId, session, input);
    case STEPS.CAPTURE_INCOME:    return handleCaptureIncome(userId, session, input);
    case STEPS.CREDIT_CHECK:      return handleCreditCheck(userId, session, input);
    case STEPS.ASK_LEAD_NAME:     return handleAskLeadName(userId, session, input);
    case STEPS.ASK_LEAD_PHONE:    return handleAskLeadPhone(userId, session, input);
    case STEPS.FINANCING_OPTIONS: return handleFinancingOptions(userId, session, input);
    case STEPS.DONE:
      session.step = STEPS.MENU;
      await SessionService.save(session);
      return send(userId, MSG.menu());
    default:
      return handleWelcome(userId, session, pushName);
  }
}

// Cuando la asesora escribe a un cliente
export async function handleAdvisorMessage({ clientUserId }) {
  logger.info(`[Flow] ▶ Natalia escribió a ${clientUserId}`);

  const session = await SessionService.get(clientUserId);
  if (session.advisorTook) {
    // Refrescar timestamp para no activar reawaken prematuro
    await SessionService.save(session);
    return;
  }

  session.advisorTook = true;
  await SessionService.save(session);
  logger.info(`[Flow] ⏸ Natalia tomó la conversación con ${clientUserId}`);
}
