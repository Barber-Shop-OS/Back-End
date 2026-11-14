// BE-31: catálogo de planos (decisão de 2026-11-07; limites e trial aprovados em 2026-11-14).
// Fonte única: a migration semeia a tabela `plans` a partir daqui e a API serve os preços do banco.
// Limite `null` = ilimitado.
const FEATURES = Object.freeze({
  AGENDA: 'agenda',
  PUBLIC_PAGE: 'public_page',
  ONLINE_BOOKING: 'online_booking',
  EMAIL_REMINDERS: 'email_reminders',
  IN_PERSON_PAYMENTS: 'in_person_payments',
  FINANCIAL_REPORTS: 'financial_reports',
  CLIENTS_CRM: 'clients_crm',
  CSV_EXPORT: 'csv_export',
  NETWORK_DASHBOARD: 'network_dashboard',
  BRANCH_MANAGERS: 'branch_managers',
  PRIORITY_SUPPORT: 'priority_support',
});

const ESSENTIAL_FEATURES = [
  FEATURES.AGENDA,
  FEATURES.PUBLIC_PAGE,
  FEATURES.ONLINE_BOOKING,
  FEATURES.EMAIL_REMINDERS,
  FEATURES.IN_PERSON_PAYMENTS,
];
const PRO_FEATURES = [...ESSENTIAL_FEATURES, FEATURES.FINANCIAL_REPORTS, FEATURES.CLIENTS_CRM, FEATURES.CSV_EXPORT];
const NETWORK_FEATURES = [...PRO_FEATURES, FEATURES.NETWORK_DASHBOARD, FEATURES.BRANCH_MANAGERS, FEATURES.PRIORITY_SUPPORT];

const PLANS = Object.freeze([
  {
    code: 'essencial',
    name: 'Essencial',
    price_cents: 9900,
    interval: 'MONTHLY',
    limits: { branches: 1, barbers: 3 },
    features: ESSENTIAL_FEATURES,
    sort_order: 1,
  },
  {
    code: 'profissional',
    name: 'Profissional',
    price_cents: 19900,
    interval: 'MONTHLY',
    limits: { branches: 3, barbers: 10 },
    features: PRO_FEATURES,
    sort_order: 2,
  },
  {
    // "Ilimitadas" com fair use de 15 filiais.
    code: 'rede',
    name: 'Rede',
    price_cents: 39900,
    interval: 'MONTHLY',
    limits: { branches: 15, barbers: null },
    features: NETWORK_FEATURES,
    sort_order: 3,
  },
]);

const TRIAL_DAYS = 14;
// Trial sem cartão com todos os recursos do Profissional.
const TRIAL_PLAN_CODE = 'profissional';
const PLAN_CODES = PLANS.map((plan) => plan.code);

module.exports = { FEATURES, PLANS, PLAN_CODES, TRIAL_DAYS, TRIAL_PLAN_CODE };
