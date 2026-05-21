// src/config/env.js
import 'dotenv/config';

function require(key) {
  if (!process.env[key]) throw new Error(`[Config] Variable requerida: ${key}`);
  return process.env[key];
}

export const config = {
  port:    parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  redis: {
    url: require('REDIS_URL'),
  },

  supabase: {
    url:    require('SUPABASE_URL'),
    key:    require('SUPABASE_KEY'),
    // Nombre del asesor en la tabla precios (para filtrar precios por asesor)
    asesor: process.env.SUPABASE_ASESOR || 'natalia',
  },

  advisor: {
    name:         process.env.ADVISOR_NAME         || 'Natalia Escobar',
    firstName:    process.env.ADVISOR_FIRST_NAME   || 'Natalia',
    phone:        process.env.ADVISOR_PHONE        || '',
    concesionario: process.env.ADVISOR_CONCESIONARIO || 'Motorwagen · Cali',
    cargo:        process.env.ADVISOR_CARGO        || 'Asesora Certificada Volkswagen',
    schedule:     process.env.ADVISOR_SCHEDULE     || 'L-V 8am–6:30pm | S 8am–3pm',
    portfolioUrl: process.env.ADVISOR_PORTFOLIO_URL || '',
  },

  admin: {
    token: require('ADMIN_TOKEN'),
  },

  auth: {
    dataPath: process.env.AUTH_DATA_PATH || './auth',
  },

  // Cache del catálogo: cuántas horas antes de refrescar desde Supabase
  catalogCacheTTL: parseInt(process.env.CATALOG_CACHE_TTL_HOURS || '6', 10) * 60 * 60 * 1000,
};
