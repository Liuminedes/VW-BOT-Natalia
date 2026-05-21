// src/index.js
import express            from 'express';
import { config }         from './config/env.js';
import { logger }         from './config/logger.js';
import { getRedisClient } from './config/redis.js';
import { CatalogService } from './services/catalog.service.js';
import { initWhatsApp }   from './services/whatsapp.service.js';
import { handleMessage, handleAdvisorMessage } from './flows/conversation.flow.js';
import adminRouter        from './routes/admin.routes.js';

const app = express();
app.use(express.json());
app.use(express.static('public'));

// ── Health check ───────────────────────────────────────────────────────────────
app.get('/health', async (req, res) => {
  const redis = getRedisClient();
  let redisOk = false;
  try { await redis.ping(); redisOk = true; } catch {}
  res.json({
    status:     'ok',
    advisor:    config.advisor.name,
    redis:      redisOk,
    catalog:    CatalogService.getStatus(),
    timestamp:  new Date().toISOString(),
  });
});

// ── Admin panel ────────────────────────────────────────────────────────────────
app.use('/admin', adminRouter);

// ─────────────────────────────────────────────────────────────────────────────
// INICIO
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  // 1. Verificar Redis
  const redis = getRedisClient();
  await redis.ping();
  logger.info('[Server] Redis OK');

  // 2. Cargar catálogo desde Supabase
  logger.info('[Server] Cargando catálogo desde Supabase...');
  await CatalogService.init();

  // 3. Inicializar WhatsApp
  logger.info('[Server] Iniciando WhatsApp con Baileys...');
  await initWhatsApp(
    async ({ userId, text, pushName }) => {
      try {
        await handleMessage({ userId, text, pushName });
      } catch (err) {
        logger.error(`[Flow] ✗ Error en handleMessage: ${err.message}\n${err.stack}`);
      }
    },
    async ({ clientUserId }) => {
      try {
        await handleAdvisorMessage({ clientUserId });
      } catch (err) {
        logger.error(`[Flow] ✗ Error en handleAdvisorMessage: ${err.message}\n${err.stack}`);
      }
    }
  );

  // 4. Arrancar servidor
  app.listen(config.port, () => {
    logger.info(`[Server] VW Bot — ${config.advisor.name} · puerto ${config.port} (${config.nodeEnv})`);
    logger.info(`[Server] Admin panel: GET /admin?token=${config.admin.token}`);
    logger.info(`[Server] Health check: GET /health`);
    logger.info(`[Server] Catálogo: ${CatalogService.getAll().length} vehículos cargados`);
  });
}

main().catch(err => {
  logger.error(`[Server] Error fatal: ${err.message}\n${err.stack}`);
  process.exit(1);
});
