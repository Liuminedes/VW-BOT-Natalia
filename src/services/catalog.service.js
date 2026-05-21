// src/services/catalog.service.js
// Trae el catálogo VW desde Supabase (vehiculos + precios) y lo cachea en memoria.
// Se refresca automáticamente cada CATALOG_CACHE_TTL_HOURS horas.
// Si Supabase falla, usa el catálogo en memoria del último fetch exitoso.

import { config } from '../config/env.js';
import { logger } from '../config/logger.js';

// ─── Estado interno ────────────────────────────────────────────────────────────
let cachedCatalog   = [];   // array de vehiculos enriquecidos con sus trims
let lastFetchedAt   = 0;
let isFetching      = false;
let fetchRetryTimer = null;

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatPrice(n) {
  if (!n) return 'Consultar';
  const m = n / 1_000_000;
  return `$${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}M`;
}

function sbHeaders() {
  return {
    'apikey':        config.supabase.key,
    'Authorization': `Bearer ${config.supabase.key}`,
    'Content-Type':  'application/json',
  };
}

async function sbGet(path) {
  const url = `${config.supabase.url}/rest/v1/${path}`;
  const res  = await fetch(url, { headers: sbHeaders() });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase error ${res.status}: ${err}`);
  }
  return res.json();
}

// ─── Fetch y construcción del catálogo ────────────────────────────────────────

async function fetchFromSupabase() {
  logger.info('[Catalog] Fetching desde Supabase...');

  // 1. Traer vehiculos activos ordenados
  const vehiculos = await sbGet(
    `vehiculos?active=eq.true&order=sort_order.asc&select=*`
  );

  // 2. Traer precios del asesor configurado
  const precios = await sbGet(
    `precios?asesor=eq.${config.supabase.asesor}&order=precio.asc&select=*`
  );

  // 3. Cruzar vehiculos con sus precios
  const catalog = vehiculos
    .map(v => {
      const trims = precios.filter(p => p.modelo === v.modelo);
      if (trims.length === 0) return null; // vehículo sin precios → no mostrar

      const precioDesde = Math.min(...trims.map(t => t.precio));
      const bonoMax     = Math.max(...trims.map(t => (t.bono || 0)));

      return {
        // Datos del vehículo
        modelo:      v.modelo,
        category:    v.category,
        tag:         v.tag,
        emoji:       v.emoji || '🚗',
        img:         v.img,
        description: v.description,
        specs:       v.specs || {},

        // Trims con precios reales desde Supabase
        trims: trims.map(t => ({
          version:     t.version,
          precio:      t.precio,
          bono:        t.bono        || 0,
          bonoAliados: t.bono_aliados || 0,
          bonoExtra:   t.bono_extra  || 0,
          nota:        t.nota,
          year:        t.year        || 2026,
        })),

        // Helpers precalculados para el bot
        precioDesde,
        bonoMax,
        precioDesdeStr: formatPrice(precioDesde),
        bonoStr:        bonoMax > 0 ? formatPrice(bonoMax) : null,
      };
    })
    .filter(Boolean);

  logger.info(`[Catalog] ✅ ${catalog.length} vehículos cargados desde Supabase`);
  return catalog;
}

// ─── API pública ───────────────────────────────────────────────────────────────

export const CatalogService = {

  // Inicializa el catálogo al arrancar el bot
  async init() {
    try {
      cachedCatalog = await fetchFromSupabase();
      lastFetchedAt = Date.now();
      // Refrescar periódicamente
      setInterval(() => CatalogService.refresh(), config.catalogCacheTTL);
    } catch (err) {
      logger.error(`[Catalog] ❌ Error al inicializar: ${err.message}`);
      logger.warn('[Catalog] ⚠ Bot arrancará sin catálogo — reintentando en 60s');
      fetchRetryTimer = setTimeout(() => CatalogService.init(), 60_000);
    }
  },

  // Refresca el catálogo manualmente (desde el panel admin)
  async refresh() {
    if (isFetching) return;
    isFetching = true;
    try {
      const fresh = await fetchFromSupabase();
      cachedCatalog = fresh;
      lastFetchedAt = Date.now();
      logger.info('[Catalog] 🔄 Catálogo refrescado');
    } catch (err) {
      logger.error(`[Catalog] Error refrescando: ${err.message}`);
    } finally {
      isFetching = false;
    }
  },

  // Todos los vehículos activos
  getAll() {
    return cachedCatalog;
  },

  // Filtrar por categoría
  getByCategory(category) {
    if (!category || category === 'Todos') return cachedCatalog;
    return cachedCatalog.filter(v => v.category === category);
  },

  // Obtener un vehículo por nombre (case-insensitive)
  getByName(name) {
    const q = name.trim().toLowerCase();
    return cachedCatalog.find(v => v.modelo.toLowerCase() === q) || null;
  },

  // Obtener por índice en la lista actual
  getByIndex(idx) {
    return cachedCatalog[idx] || null;
  },

  // Categorías disponibles (con cantidad de modelos)
  getCategories() {
    const map = {};
    for (const v of cachedCatalog) {
      map[v.category] = (map[v.category] || 0) + 1;
    }
    return Object.entries(map).map(([name, count]) => ({ name, count }));
  },

  // Estado del cache (para el panel admin)
  getStatus() {
    return {
      count:        cachedCatalog.length,
      lastFetchedAt,
      ageMinutes:   Math.floor((Date.now() - lastFetchedAt) / 60_000),
      isFetching,
    };
  },

  // Formatear precio
  formatPrice,
};
