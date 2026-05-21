// src/routes/admin.routes.js
import { Router }          from 'express';
import QRCode              from 'qrcode';
import { config }          from '../config/env.js';
import { logger }          from '../config/logger.js';
import { SessionService }  from '../services/session.service.js';
import { CatalogService }  from '../services/catalog.service.js';
import { WhatsAppService } from '../services/whatsapp.service.js';
import { readFileSync }    from 'fs';
import { join, dirname }   from 'path';
import { fileURLToPath }   from 'url';

const __dir    = dirname(fileURLToPath(import.meta.url));
const router   = Router();

// ── Auth middleware ────────────────────────────────────────────────────────────
function auth(req, res, next) {
  const token = req.query.token || req.headers['x-admin-token'];
  if (token !== config.admin.token) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// ── Panel HTML ────────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const token = req.query.token || '';
  if (token !== config.admin.token) {
    return res.send(`<!DOCTYPE html><html><body style="font-family:sans-serif;padding:40px">
      <h2>🔒 VW Bot Admin</h2>
      <form method="get"><input name="token" placeholder="Admin token" style="padding:8px;width:300px"/>
      <button type="submit" style="padding:8px 16px;margin-left:8px">Entrar</button></form>
    </body></html>`);
  }
  try {
    const html = readFileSync(join(__dir, '../admin/panel.html'), 'utf8');
    res.send(html);
  } catch {
    res.send('<h2>Panel HTML no encontrado. Coloca src/admin/panel.html</h2>');
  }
});

// ── Estado del bot ────────────────────────────────────────────────────────────
router.get('/api/status', auth, async (req, res) => {
  const paused  = await SessionService.isGloballyPaused();
  const catalog = CatalogService.getStatus();
  res.json({
    connected:   WhatsAppService.isConnected(),
    globalPause: paused,
    advisor:     config.advisor.name,
    catalog,
    hasQR:       !!WhatsAppService.getQR(),
  });
});

// ── QR ────────────────────────────────────────────────────────────────────────
router.get('/api/qr', auth, async (req, res) => {
  const qr = WhatsAppService.getQR();
  if (!qr) return res.json({ qr: null });
  try {
    const dataUrl = await QRCode.toDataURL(qr, { width: 300 });
    res.json({ qr: dataUrl });
  } catch {
    res.json({ qr: null });
  }
});

// ── Sesiones ───────────────────────────────────────────────────────────────────
router.get('/api/sessions', auth, async (req, res) => {
  const sessions = await SessionService.listAll();
  res.json(sessions);
});

router.post('/api/sessions/:userId/reset', auth, async (req, res) => {
  await SessionService.delete(decodeURIComponent(req.params.userId));
  res.json({ success: true });
});

router.post('/api/sessions/:userId/pause', auth, async (req, res) => {
  const session = await SessionService.get(decodeURIComponent(req.params.userId));
  session.advisorTook = true;
  await SessionService.save(session);
  res.json({ success: true });
});

router.post('/api/sessions/:userId/resume', auth, async (req, res) => {
  const session = await SessionService.get(decodeURIComponent(req.params.userId));
  session.advisorTook = false;
  session.handoffMode = false;
  await SessionService.save(session);
  res.json({ success: true });
});

// ── Pausa global ───────────────────────────────────────────────────────────────
router.post('/api/pause-global', auth, async (req, res) => {
  const { paused } = req.body;
  await SessionService.setGlobalPause(!!paused);
  logger.info(`[Admin] Bot ${paused ? 'pausado' : 'activado'} globalmente`);
  res.json({ success: true, paused: !!paused });
});

// ── Exclusiones ────────────────────────────────────────────────────────────────
router.get('/api/excluded', auth, async (req, res) => {
  res.json(await SessionService.getExcluded());
});

router.post('/api/excluded', auth, async (req, res) => {
  await SessionService.addExcluded(req.body.phone);
  res.json({ success: true });
});

router.delete('/api/excluded/:phone', auth, async (req, res) => {
  await SessionService.removeExcluded(req.params.phone);
  res.json({ success: true });
});

// ── Catálogo (nuevo) ───────────────────────────────────────────────────────────
router.get('/api/catalog', auth, (req, res) => {
  res.json({
    status:   CatalogService.getStatus(),
    vehicles: CatalogService.getAll(),
  });
});

router.post('/api/catalog/refresh', auth, async (req, res) => {
  logger.info('[Admin] Refresh manual del catálogo desde Supabase');
  await CatalogService.refresh();
  res.json({ success: true, status: CatalogService.getStatus() });
});

// ── Relogin ────────────────────────────────────────────────────────────────────
router.post('/api/relogin', auth, async (req, res) => {
  logger.warn('[Admin] Relogin forzado — reiniciando en 2s');
  res.json({ success: true, message: 'Reiniciando, escanea el nuevo QR en breve.' });
  setTimeout(() => process.exit(1), 2000);
});

export default router;
