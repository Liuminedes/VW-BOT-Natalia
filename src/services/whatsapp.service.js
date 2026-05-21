// src/services/whatsapp.service.js
import baileys from '@whiskeysockets/baileys';
import { existsSync, mkdirSync } from 'fs';
import { config }  from '../config/env.js';
import { logger }  from '../config/logger.js';

// Baileys puede exportar bajo .default (ESM) o directamente (CJS)
const baileysModule = baileys.default ?? baileys;
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  makeCacheableSignalKeyStore,
} = baileysModule;

// ─── Estado interno ────────────────────────────────────────────────────────────
let sock         = null;
let qrCode       = null;
let isReady      = false;
let reconnecting = false;

// Cache de mensajes enviados por el bot (para distinguirlos de los de Natalia)
const botSentTexts = new Set();
const BOT_TEXT_TTL = 15_000; // 15 segundos

// Mapa LID → JID real (fix para @lid en Multi-Device)
const lidToJidMap = new Map();

// ─── Helpers ───────────────────────────────────────────────────────────────────

function normalizeJid(jid) {
  if (!jid) return '';
  return jid.replace(/:[0-9]+@/, '@');
}

function extractIdentity(jid) {
  if (!jid) return '';
  return normalizeJid(jid).replace(/@.*$/, '');
}

function isAdvisorJid(jid) {
  if (!config.advisor.phone || !jid) return false;
  return extractIdentity(jid) === config.advisor.phone.replace(/\D/g, '');
}

function extractText(msg) {
  return (
    msg?.conversation ||
    msg?.extendedTextMessage?.text ||
    msg?.imageMessage?.caption ||
    msg?.videoMessage?.caption ||
    msg?.buttonsResponseMessage?.selectedDisplayText ||
    msg?.listResponseMessage?.title ||
    ''
  );
}

// ─── Inicialización ────────────────────────────────────────────────────────────

export async function initWhatsApp(onMessage, onAdvisorMessage) {
  if (!existsSync(config.auth.dataPath)) {
    mkdirSync(config.auth.dataPath, { recursive: true });
    logger.info(`[WA] Carpeta auth creada: ${config.auth.dataPath}`);
  }

  const { state, saveCreds } = await useMultiFileAuthState(config.auth.dataPath);
  const { version }          = await fetchLatestBaileysVersion();

  logger.info(`[WA] Baileys WA Web version: ${version.join('.')} (latest: true)`);

  function connect() {
    sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys:  makeCacheableSignalKeyStore(state.keys, {
          level: 'silent', child: () => ({ level: 'silent' })
        }),
      },
      printQRInTerminal:    false,
      syncFullHistory:      false,
      markOnlineOnConnect:  false,
      logger: { level: 'silent', child: () => ({ level: 'silent' }) },
    });

    // ── QR ───────────────────────────────────────────────────────────────────
    sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        qrCode  = qr;
        isReady = false;
        logger.info('[WA] QR generado — escanea en /admin');
      }

      if (connection === 'close') {
        isReady = false;
        qrCode  = null;
        const code = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = code !== DisconnectReason.loggedOut;
        logger.warn(`[WA] Desconectado (code=${code}) — reconectar=${shouldReconnect}`);
        if (shouldReconnect && !reconnecting) {
          reconnecting = true;
          setTimeout(() => { reconnecting = false; connect(); }, 3000);
        }
      }

      if (connection === 'open') {
        isReady = true;
        qrCode  = null;
        logger.info('[WA] ✅ WhatsApp conectado y listo');
      }
    });

    // ── Guardar credenciales ─────────────────────────────────────────────────
    sock.ev.on('creds.update', saveCreds);

    // ── Mensajes ─────────────────────────────────────────────────────────────
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const msg of messages) {
        try {
          await handleIncomingMessage(msg, onMessage, onAdvisorMessage);
        } catch (err) {
          logger.error(`[WA] Error procesando mensaje: ${err.message}\n${err.stack}`);
        }
      }
    });
  }

  connect();
}

// ─── Procesamiento de mensajes ─────────────────────────────────────────────────

async function handleIncomingMessage(msg, onMessage, onAdvisorMessage) {
  if (!msg.message) return;

  const jid = msg.key.remoteJid || '';

  // Filtros: grupos, newsletters, canales, broadcasts, status
  if (
    jid.endsWith('@g.us')        ||
    jid.endsWith('@newsletter')  ||
    jid.endsWith('@broadcast')   ||
    jid === 'status@broadcast'
  ) return;

  if (msg.message.protocolMessage) return;

  const text = extractText(msg.message);
  if (!text) return;

  const pushName = msg.pushName || '';

  // ── Construir mapa LID → JID real ─────────────────────────────────────────
  if (jid.endsWith('@lid')) {
    const realJid = msg.key.senderPn || msg.key.participantPn;
    if (realJid?.endsWith('@s.whatsapp.net') && lidToJidMap.get(jid) !== realJid) {
      lidToJidMap.set(jid, realJid);
      logger.info(`[WA] 🔗 Mapeado ${jid} → ${realJid}`);
    }
  }

  if (msg.key.fromMe) {
    // ── Saliente: bot o Natalia escribió ─────────────────────────────────────
    const clientJid      = normalizeJid(jid);
    const clientIdentity = extractIdentity(clientJid);

    if (isAdvisorJid(clientJid)) return; // Natalia se escribió a sí misma

    const key = `${clientIdentity}|${text.substring(0, 80)}`;
    if (botSentTexts.has(key)) {
      botSentTexts.delete(key);
      return; // era el bot
    }

    // No era el bot → Natalia escribió manualmente
    logger.info(`[WA] → Natalia escribió a ${clientJid}: "${text.substring(0, 60)}"`);
    await onAdvisorMessage({ clientUserId: clientJid });

  } else {
    // ── Entrante: cliente escribió ────────────────────────────────────────────
    const userId = normalizeJid(jid);
    if (isAdvisorJid(userId)) return;

    logger.info(`[WA] ← ${userId} (${pushName}): "${text.substring(0, 60)}"`);
    await onMessage({ userId, text, pushName });
  }
}

// ─── API pública ───────────────────────────────────────────────────────────────

export const WhatsAppService = {

  async sendText(to, text) {
    if (!isReady || !sock) {
      logger.warn(`[WA] ⚠ No listo — no se envió a ${to}`);
      return;
    }
    try {
      let jid = to.includes('@') ? to : `${to}@s.whatsapp.net`;

      // Resolver @lid → JID real si tenemos el mapping
      if (jid.endsWith('@lid') && lidToJidMap.has(jid)) {
        const resolved = lidToJidMap.get(jid);
        logger.info(`[WA] 🔗 Resolviendo ${jid} → ${resolved}`);
        jid = resolved;
      } else if (jid.endsWith('@lid')) {
        logger.warn(`[WA] ⚠ Enviando a ${jid} sin mapping LID→PN`);
      }

      const identity = extractIdentity(jid);
      const key      = `${identity}|${text.substring(0, 80)}`;
      botSentTexts.add(key);
      setTimeout(() => botSentTexts.delete(key), BOT_TEXT_TTL);

      const result = await sock.sendMessage(jid, { text });
      logger.info(`[WA] ✓ Enviado a ${jid}: "${text.substring(0, 50)}" (${result?.key?.id || '?'})`);
    } catch (err) {
      logger.error(`[WA] ✗ Error enviando a ${to}: ${err.message}`);
    }
  },

  getQR()     { return qrCode; },
  isConnected() { return isReady; },

  async logout() {
    isReady = false;
    qrCode  = null;
    if (sock) {
      try { await sock.logout(); } catch {}
      sock = null;
    }
  },
};
