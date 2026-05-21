// src/services/session.service.js
import { getRedisClient } from '../config/redis.js';
import { logger }         from '../config/logger.js';

const PREFIX  = 'vw:natalia:session:';
const PAUSED  = 'vw:natalia:paused:';
const EXCL    = 'vw:natalia:excluded';
const TTL     = 45 * 24 * 60 * 60; // 45 días en segundos

function defaultSession(userId) {
  return {
    userId,
    step:         'WELCOME',
    advisorTook:  false,
    handoffMode:  false,
    pushName:     null,
    lead: {
      name:        null,
      phone:       null,
      interest:    null,     // modelo de interés
      budget:      null,
      employment:  null,
      income:      null,
      creditStatus: null,
    },
    // Contexto del catálogo durante la sesión
    catalog: {
      category:     null,    // categoría seleccionada en el filtro
      vehicleIndex: null,    // índice del vehículo viendo en detalle
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export const SessionService = {

  async get(userId) {
    const redis = getRedisClient();
    try {
      const raw = await redis.get(`${PREFIX}${userId}`);
      if (!raw) return defaultSession(userId);
      const session = JSON.parse(raw);
      // Migración: agregar campos nuevos si no existen
      if (!session.catalog) session.catalog = { category: null, vehicleIndex: null };
      return session;
    } catch {
      return defaultSession(userId);
    }
  },

  async save(session) {
    const redis = getRedisClient();
    session.updatedAt = Date.now();
    await redis.setex(`${PREFIX}${session.userId}`, TTL, JSON.stringify(session));
  },

  async exists(userId) {
    const redis = getRedisClient();
    return (await redis.exists(`${PREFIX}${userId}`)) === 1;
  },

  async delete(userId) {
    const redis = getRedisClient();
    await redis.del(`${PREFIX}${userId}`);
    logger.info(`[Session] Reset: ${userId}`);
  },

  // Pausa global del bot
  async setGlobalPause(paused) {
    const redis = getRedisClient();
    await redis.set(`${PAUSED}global`, paused ? '1' : '0');
  },

  async isGloballyPaused() {
    const redis = getRedisClient();
    return (await redis.get(`${PAUSED}global`)) === '1';
  },

  // Números excluidos
  async getExcluded() {
    const redis = getRedisClient();
    const raw = await redis.get(EXCL);
    return raw ? JSON.parse(raw) : [];
  },

  async isExcluded(userId) {
    const list = await this.getExcluded();
    const phone = userId.replace(/[@:][^\s]*/g, '').replace(/\D/g, '');
    return list.some(n => n.replace(/\D/g, '') === phone);
  },

  async addExcluded(phone) {
    const redis = getRedisClient();
    const list  = await this.getExcluded();
    const clean = phone.replace(/\D/g, '');
    if (!list.includes(clean)) {
      list.push(clean);
      await redis.set(EXCL, JSON.stringify(list));
    }
  },

  async removeExcluded(phone) {
    const redis = getRedisClient();
    const list  = await this.getExcluded();
    const clean = phone.replace(/\D/g, '');
    const upd   = list.filter(n => n !== clean);
    await redis.set(EXCL, JSON.stringify(upd));
  },

  // Listar todas las sesiones activas
  async listAll() {
    const redis = getRedisClient();
    const keys  = await redis.keys(`${PREFIX}*`);
    const sessions = [];
    for (const key of keys) {
      try {
        const raw = await redis.get(key);
        if (raw) sessions.push(JSON.parse(raw));
      } catch {}
    }
    return sessions.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  },
};
