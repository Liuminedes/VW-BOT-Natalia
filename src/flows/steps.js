// src/flows/steps.js

export const STEPS = {
  WELCOME:          'WELCOME',
  MENU:             'MENU',

  // Catálogo
  CATALOG_CATEGORY: 'CATALOG_CATEGORY',   // eligiendo categoría
  CATALOG_LIST:     'CATALOG_LIST',       // viendo lista de vehículos
  VEHICLE_DETAIL:   'VEHICLE_DETAIL',     // viendo detalle de un vehículo

  // Cotización
  CAPTURE_INTEREST:    'CAPTURE_INTEREST',
  CAPTURE_BUDGET:      'CAPTURE_BUDGET',
  CAPTURE_EMPLOYMENT:  'CAPTURE_EMPLOYMENT',
  CAPTURE_INCOME:      'CAPTURE_INCOME',
  CREDIT_CHECK:        'CREDIT_CHECK',
  ASK_LEAD_NAME:       'ASK_LEAD_NAME',
  ASK_LEAD_PHONE:      'ASK_LEAD_PHONE',

  // Financiación
  FINANCING_OPTIONS:   'FINANCING_OPTIONS',

  // Cierre
  DONE:             'DONE',
};

export const RESET_KEYWORDS  = ['menu', 'menú', 'inicio', 'reiniciar', 'hola'];
export const HANDOFF_KEYWORDS = ['asesor', 'hablar', 'agente', 'persona', 'natalia'];

export const BUDGETS = [
  'Hasta $80M',
  '$80M – $110M',
  '$110M – $150M',
  '$150M – $200M',
  'Más de $200M',
];

export const EMPLOYMENTS = ['Empleado', 'Independiente', 'Pensionado'];
