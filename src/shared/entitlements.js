// BE-31: o que uma barbearia pode fazer de acordo com a assinatura. Funções puras: recebem a
// assinatura e o catálogo (por padrão src/shared/plans.js) e não tocam no banco.
//   can(subscription, 'financial_reports')        → boolean (recurso)
//   limit(subscription, 'barbers')                → número ou null (ilimitado)
//   checkLimit(subscription, 'branches', used)    → { allowed, limit, used, upgrade_to }
// Regras de bloqueio por inadimplência (carência, modo leitura) entram em BE-35.
const { PLANS, TRIAL_PLAN_CODE } = require('./plans');

const findPlan = (code, catalog = PLANS) => catalog.find((plan) => plan.code === code) || null;

/** Plano cujos recursos valem agora. Trial usa o plano de trial (Profissional). */
const effectivePlan = (subscription, catalog = PLANS) => {
  if (!subscription) return null;
  const code = subscription.status === 'trialing' ? TRIAL_PLAN_CODE : subscription.plan_code;
  return findPlan(code, catalog);
};

const can = (subscription, feature, catalog) => {
  const plan = effectivePlan(subscription, catalog);
  return Boolean(plan && plan.features.includes(feature));
};

const limit = (subscription, resource, catalog) => {
  const plan = effectivePlan(subscription, catalog);
  if (!plan) return 0;
  const value = plan.limits[resource];
  return value === undefined ? 0 : value;
};

/** Menor plano (por preço) que comporta `needed` unidades do recurso. */
const upgradeFor = (resource, needed, catalog = PLANS) => {
  const candidates = [...catalog]
    .sort((a, b) => a.price_cents - b.price_cents)
    .filter((plan) => plan.limits[resource] === null || plan.limits[resource] >= needed);
  return candidates.length ? candidates[0].code : null;
};

const checkLimit = (subscription, resource, used, catalog) => {
  const max = limit(subscription, resource, catalog);
  const allowed = max === null || used < max;
  return { allowed, limit: max, used, upgrade_to: allowed ? null : upgradeFor(resource, used + 1, catalog) };
};

module.exports = { findPlan, effectivePlan, can, limit, checkLimit, upgradeFor };
