// BE-31: planos públicos e assinatura da barbearia.
const { Op } = require('sequelize');
const { Plan, Subscription, SubscriptionEvent, Branch, Barber } = require('../../models');
const { assertCanManageBarbershop } = require('../../shared/authz');
const { TRIAL_DAYS, TRIAL_PLAN_CODE } = require('../../shared/plans');
const entitlements = require('../../shared/entitlements');
const { NotFoundError } = require('../../utils/errorHandler');

const serializePlan = (plan) => ({
  code: plan.code,
  name: plan.name,
  price_cents: plan.price_cents,
  price: (plan.price_cents / 100).toFixed(2),
  currency: 'BRL',
  interval: plan.interval,
  limits: plan.limits,
  features: plan.features,
});

/** GET /api/plans — preços vêm do banco (o front não tem preço fixo). */
const listPlans = async () => {
  const plans = await Plan.findAll({ where: { active: true }, order: [['sort_order', 'ASC']] });
  return plans.map(serializePlan);
};

const recordEvent = (subscription, type, { from, to, payload } = {}, options = {}) =>
  SubscriptionEvent.create(
    { subscription_id: subscription.id, type, from_status: from || null, to_status: to || null, payload: payload || null },
    options
  );

/** Cria a assinatura em trial (14 dias, recursos do Profissional). Idempotente por barbearia. */
const startTrial = async (barbershopId, { planCode, now = new Date(), transaction } = {}) => {
  const existing = await Subscription.findOne({ where: { barbershop_id: barbershopId }, transaction });
  if (existing) return existing;
  const subscription = await Subscription.create(
    {
      barbershop_id: barbershopId,
      plan_code: planCode || TRIAL_PLAN_CODE,
      status: 'trialing',
      trial_ends_at: new Date(now.getTime() + TRIAL_DAYS * 86400000),
    },
    { transaction }
  );
  await recordEvent(subscription, 'trial.started', { to: 'trialing', payload: { plan_code: subscription.plan_code } }, { transaction });
  return subscription;
};

const findByBarbershop = (barbershopId, options = {}) =>
  Subscription.findOne({ where: { barbershop_id: barbershopId }, ...options });

/** Uso atual dos recursos limitados. */
const usage = async (barbershopId) => {
  const branches = await Branch.findAll({ where: { barbershop_id: barbershopId, active: true }, attributes: ['id'] });
  const barbers = branches.length
    ? await Barber.count({ where: { active: true, branch_id: { [Op.in]: branches.map((branch) => branch.id) } } })
    : 0;
  return { branches: branches.length, barbers };
};

/** GET /api/barbershop/:id/subscription (dono). */
const getForBarbershop = async (barbershopId, currentUser) => {
  await assertCanManageBarbershop(currentUser, barbershopId);
  const subscription = await findByBarbershop(barbershopId);
  if (!subscription) throw new NotFoundError('Assinatura não encontrada');
  const plan = entitlements.effectivePlan(subscription);
  return {
    barbershop_id: subscription.barbershop_id,
    plan_code: subscription.plan_code,
    effective_plan_code: plan ? plan.code : null,
    status: subscription.status,
    trial_ends_at: subscription.trial_ends_at,
    current_period_start: subscription.current_period_start,
    current_period_end: subscription.current_period_end,
    cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
    limits: plan ? plan.limits : {},
    features: plan ? plan.features : [],
    usage: await usage(barbershopId),
  };
};

module.exports = { listPlans, startTrial, findByBarbershop, recordEvent, usage, getForBarbershop, serializePlan };
