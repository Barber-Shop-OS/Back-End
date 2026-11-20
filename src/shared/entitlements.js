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

// BE-35: carência após falha de cobrança.
const GRACE_DAYS = 7;
const DAY_MS = 86400000;

/** Fim da carência de uma assinatura em atraso (past_due_since + 7 dias). */
const graceEndsAt = (subscription) => {
  if (!subscription || subscription.status !== 'past_due') return null;
  const since = subscription.past_due_since ? new Date(subscription.past_due_since) : null;
  return since ? new Date(since.getTime() + GRACE_DAYS * DAY_MS) : null;
};

/**
 * Nível de acesso da barbearia (BE-35):
 *   'full'      → trial válido ou ativa (inclusive com cancelamento agendado);
 *   'grace'     → em atraso dentro dos 7 dias de carência (tudo funciona, com aviso);
 *   'read_only' → trial vencido, carência esgotada, pendente de pagamento, cancelada ou expirada:
 *                 painel só leitura, agendamento público desligado, dados preservados.
 */
const accessLevel = (subscription, now = new Date()) => {
  if (!subscription) return 'read_only';
  switch (subscription.status) {
    case 'active':
      return 'full';
    case 'trialing':
      return subscription.trial_ends_at && new Date(subscription.trial_ends_at) > now ? 'full' : 'read_only';
    case 'past_due': {
      const ends = graceEndsAt(subscription);
      // Sem data de início do atraso: concede a carência (não bloqueia por dado ausente).
      return !ends || ends > now ? 'grace' : 'read_only';
    }
    default:
      return 'read_only';
  }
};

/** Barbearia visível ao público (busca, página, agendamento): tudo menos read_only. */
const isPubliclyVisible = (subscription, now = new Date()) => accessLevel(subscription, now) !== 'read_only';

module.exports = {
  findPlan,
  effectivePlan,
  can,
  limit,
  checkLimit,
  upgradeFor,
  isPubliclyVisible,
  accessLevel,
  graceEndsAt,
  GRACE_DAYS,
};
