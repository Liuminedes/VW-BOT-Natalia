// src/flows/messages.js
// Mensajes del bot con la personalidad de Natalia Escobar — Motorwagen Cali
// Tono: profesional, cálido, conocedora del producto VW

import { config }          from '../config/env.js';
import { CatalogService }  from '../services/catalog.service.js';

const fp = (n) => {
  if (!n) return 'Consultar';
  const m = n / 1_000_000;
  return `$${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}M`;
};

const firstName = (name) => name?.split(' ')[0] || name || '';

export const MSG = {

  // ── Bienvenida ──────────────────────────────────────────────────────────────
  welcome: () =>
    `👋 ¡Hola! Soy el asistente virtual de *${config.advisor.name}*,\n` +
    `${config.advisor.cargo} en *${config.advisor.concesionario}*.\n\n` +
    `🕐 ${config.advisor.schedule}\n\n` +
    `¿En qué te puedo ayudar hoy?`,

  menu: () =>
    `*1️⃣* 🚗 Ver catálogo Volkswagen 2026\n` +
    `*2️⃣* 💰 Solicitar cotización\n` +
    `*3️⃣* 💳 Opciones de financiación\n` +
    `*4️⃣* 💬 Hablar directamente con ${config.advisor.firstName}`,

  // ── Catálogo ────────────────────────────────────────────────────────────────
  catalogIntro: () => {
    const cats   = CatalogService.getCategories();
    const total  = CatalogService.getAll().length;
    const catList = cats.map((c, i) => `*${i + 2}️⃣* ${c.name} (${c.count})`).join('\n');
    return (
      `🏆 Catálogo *Volkswagen 2026* — ${total} modelos disponibles en Motorwagen\n\n` +
      `Filtra por tipo:\n\n` +
      `*1️⃣* 🔍 Ver todos los modelos\n` +
      `${catList}\n\n` +
      `_Todos con garantía de *3 años o 100.000 km* 🛡️_`
    );
  },

  vehicleList: (vehicles) => {
    if (vehicles.length === 0) return `😔 No encontré vehículos en esa categoría. Escribe *"menu"* para volver.`;
    const lines = vehicles.map((v, i) =>
      `*${i + 1}.* ${v.emoji} *${v.modelo}* — desde ${v.precioDesdeStr}${v.bonoStr ? ` _(bono hasta ${v.bonoStr})_` : ''}`
    );
    return lines.join('\n') + `\n\n_Escribe el número del modelo que te interesa 👇_`;
  },

  vehicleDetail: (v) => {
    const specsStr = Object.entries(v.specs)
      .map(([k, val]) => `• *${k}:* ${val}`)
      .join('\n');

    const trimsStr = v.trims.map(t => {
      const bonos = [];
      if (t.bono > 0)        bonos.push(`Bono: ${fp(t.bono)}`);
      if (t.bonoAliados > 0) bonos.push(`+${fp(t.bonoAliados)} financiando`);
      if (t.bonoExtra > 0)   bonos.push(`+${fp(t.bonoExtra)} especial`);
      const bonoLine = bonos.length ? `\n  💚 ${bonos.join(' | ')}` : '';
      return `▸ ${t.version}\n  💰 *${fp(t.precio)}*${bonoLine}`;
    }).join('\n\n');

    return (
      `${v.emoji} *${v.modelo} ${v.trims[0]?.year || 2026}*\n` +
      `${v.description}\n\n` +
      `📋 *Especificaciones:*\n${specsStr}\n\n` +
      `💵 *Versiones y precios:*\n${trimsStr}`
    );
  },

  vehicleOptions: () =>
    `\n\n¿Qué te gustaría hacer?\n\n` +
    `*1️⃣* Cotizar este vehículo 💰\n` +
    `*2️⃣* Ver otros modelos 🔙\n` +
    `*3️⃣* Hablar con ${config.advisor.firstName} 💬`,

  portfolioLink: () =>
    config.advisor.portfolioUrl
      ? `🌐 Mira el catálogo completo con fotos en:\n*${config.advisor.portfolioUrl}*`
      : '',

  // ── Cotización ──────────────────────────────────────────────────────────────
  askInterest: (name) =>
    `¡Perfecto${name ? `, *${firstName(name)}*` : ''}! 🙌\n\n` +
    `¿Tienes algún modelo VW en mente, o prefieres que te cuente sobre el catálogo completo?\n\n` +
    `_(Escribe el nombre del modelo o "catalogo" para verlos todos)_`,

  askBudget: () =>
    `Para orientarte con la mejor opción, ¿en qué rango de inversión estás pensando? 💵\n\n` +
    `*1️⃣* Hasta $80M\n` +
    `*2️⃣* $80M – $110M\n` +
    `*3️⃣* $110M – $150M\n` +
    `*4️⃣* $150M – $200M\n` +
    `*5️⃣* Más de $200M\n\n` +
    `_Tenemos excelentes opciones de financiación con Motorwagen 😉_`,

  askEmployment: () =>
    `Para estructurarte la mejor alternativa de financiación 🤝\n\n` +
    `¿Cuál es tu actividad laboral?\n\n` +
    `*1️⃣* Empleado\n*2️⃣* Independiente\n*3️⃣* Pensionado`,

  invalidEmployment: () => `Respóndeme con *1*, *2* o *3* 👇`,

  askIncome: () =>
    `¿Y cuánto son tus ingresos mensuales aproximadamente?\n` +
    `_(Escribe el valor, ej: $3.500.000)_ 💵`,

  invalidIncome: () =>
    `Por favor escríbeme el valor, ej: *$3.500.000* 💵`,

  askCreditCheck: () =>
    `Última pregunta para completar tu perfil financiero 💚\n\n` +
    `¿Cómo estás en centrales de riesgo? _(Datacrédito / TransUnion)_\n\n` +
    `*1️⃣* ✅ Sin reportes\n*2️⃣* ⚠️ Con reportes\n*3️⃣* 🤷 No estoy seguro/a`,

  // ── Financiación ────────────────────────────────────────────────────────────
  financingInfo: () =>
    `💳 *Opciones de financiación en Motorwagen*\n\n` +
    `Trabajamos con los principales aliados financieros del país:\n\n` +
    `🏦 *Banco de Bogotá* · *Bancolombia* · *Davivienda*\n` +
    `🏦 *BBVA* · *Banco de Occidente* · *Fincomercio*\n\n` +
    `✅ Plazos hasta *84 meses*\n` +
    `✅ Financiación hasta el *90%* del valor\n` +
    `✅ *Bonos adicionales* para clientes que financian con aliados\n` +
    `✅ Proceso *100% digital* y ágil\n\n` +
    `¿Quieres que ${config.advisor.firstName} te asesore sobre la mejor opción para tu perfil?`,

  financingOptions: () =>
    `*1️⃣* Sí, quiero asesoría personalizada 🙋\n` +
    `*2️⃣* Quiero ver el catálogo primero 🚗\n` +
    `*3️⃣* Volver al menú principal 🔙`,

  // ── Captura lead ────────────────────────────────────────────────────────────
  askLeadName: () =>
    `¡Casi terminamos! 🎉\n\n` +
    `Para que ${config.advisor.firstName} pueda contactarte personalmente,\n` +
    `¿me dices tu nombre completo?`,

  invalidLeadName: () => `Por favor escríbeme tu nombre completo 😊`,

  askLeadPhone: (name) =>
    `Un placer, *${firstName(name)}* 🤝\n\n` +
    `¿A qué número te puede contactar ${config.advisor.firstName}?\n` +
    `_(Ej: 3001234567)_ 📱`,

  invalidLeadPhone: () =>
    `Por favor escríbeme un número válido, ej: *3001234567* 📱`,

  // ── Cierre ──────────────────────────────────────────────────────────────────
  creditClean:    () => `¡Excelente, eso simplifica mucho el proceso! 🎉`,
  creditReported: () => `No te preocupes, tenemos alternativas para cada situación 💪`,
  creditUnknown:  () => `Perfecto, eso lo revisamos durante el proceso sin ningún problema 👍`,

  handoff: (name) =>
    `¡Todo listo, *${firstName(name)}*! 🏆\n\n` +
    `${config.advisor.firstName} va a preparar tu cotización personalizada con las mejores condiciones disponibles en Motorwagen.\n\n` +
    `En poco tiempo te contactamos. ¡Gracias por tu interés en *Volkswagen*! 🚗💙`,

  handoffAdvisor: (lead) => {
    const fmt = (v) => v || '—';
    const credStr =
      lead.creditStatus === 'clean'    ? 'Sin reportes ✅' :
      lead.creditStatus === 'reported' ? 'Con reportes ⚠️' : 'Por verificar 🔍';
    return (
      `🔔 *NUEVO LEAD — VW Bot*\n` +
      `━━━━━━━━━━━━━━━━\n` +
      `👤 *${fmt(lead.name)}* | 📱 ${fmt(lead.phone)}\n` +
      `🚗 ${fmt(lead.interest)}\n` +
      `💰 ${fmt(lead.budget)}\n` +
      `💼 ${fmt(lead.employment)} | 💵 ${fmt(lead.income)}\n` +
      `📊 ${credStr}\n` +
      `━━━━━━━━━━━━━━━━\n` +
      `_Bot pausado. Cliente listo para contactar._`
    );
  },

  handoffDirect: () =>
    `¡Claro! 💬 ${config.advisor.firstName} estará contigo en un momento.\n\n` +
    `Le voy a avisar ahora mismo que quieres hablar con ella 🤝`,

  handoffAdvisorDirect: (lead) =>
    `🔔 *CONTACTO DIRECTO — VW Bot*\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `👤 *${lead.name || 'Cliente nuevo'}* | 📱 ${lead.phone || '—'}\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `_El cliente solicitó hablar directamente con ${config.advisor.firstName}._`,

  advisorTookOver: () =>
    `${config.advisor.firstName} ya está al tanto y te atenderá pronto 💙\n` +
    `Si necesitas algo más, escribe *"menu"* para volver al asistente.`,

  fallback: () =>
    `Mmm, no entendí bien 😅\n\n` +
    `Escribe el *número* de la opción que quieres, o *"menu"* para ver todas las opciones.`,
};
