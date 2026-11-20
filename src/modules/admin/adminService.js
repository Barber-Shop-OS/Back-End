// BE-41: operação da plataforma (somente role admin — garantido na rota).
const { Op } = require('sequelize');
const { Barbershop, Subscription, User, Branch, Plan, SubscriptionEvent } = require('../../models');
const subscriptionService = require('../subscription/subscriptionService');
const audit = require('../audit/auditService');
const entitlements = require('../../shared/entitlements');
const { parsePagination, likeMatch } = require('../../shared/query');
const { sanitizeUser } = require('../../shared/sanitizeUser');
const { NotFoundError, ValidationError } = require('../../utils/errorHandler');

const DAY = 86400000;

/** GET /api/admin/barbershops?q&status&subscription_status */
const listBarbershops = async (query = {}) => {
  const { page, pageSize, offset, limit } = parsePagination(query);
  const where = {};
  if (query.status) where.status = query.status;
  if (query.q) where[Op.or] = [likeMatch('Barbershop.name', query.q), likeMatch('Barbershop.slug', query.q)];
  const subscriptionWhere = query.subscription_status ? { status: query.subscription_status } : undefined;
  const { rows, count } = await Barbershop.findAndCountAll({
    where,
    include: [
      { model: Subscription, required: Boolean(subscriptionWhere), where: subscriptionWhere },
      { model: User, as: 'owner', attributes: ['id', 'name', 'email', 'email_verified_at'] },
    ],
    order: [['id', 'DESC']],
    offset,
    limit,
    distinct: true,
  });
  const items = rows.map((shop) => {
    const sub = shop.Subscription;
    return {
      id: shop.id,
      name: shop.name,
      slug: shop.slug,
      status: shop.status,
      created_at: shop.created_at,
      owner: shop.owner,
      subscription: sub
        ? {
            plan_code: sub.plan_code,
            status: sub.status,
            access: entitlements.accessLevel(sub),
            trial_ends_at: sub.trial_ends_at,
            current_period_end: sub.current_period_end,
            cancel_at_period_end: Boolean(sub.cancel_at_period_end),
          }
        : null,
    };
  });
  return { items, page, pageSize, total: count, totalPages: Math.ceil(count / pageSize) };
};

/** GET /api/admin/barbershops/:id — detalhe com uso e histórico da assinatura. */
const getBarbershop = async (id) => {
  const shop = await Barbershop.findByPk(id, {
    paranoid: false,
    include: [{ model: User, as: 'owner', attributes: ['id', 'name', 'email', 'phone', 'email_verified_at'], paranoid: false }, { model: Branch }],
  });
  if (!shop) throw new NotFoundError('Barbearia não encontrada');
  const subscription = await Subscription.findOne({ where: { barbershop_id: shop.id } });
  const events = subscription
    ? await SubscriptionEvent.findAll({ where: { subscription_id: subscription.id }, order: [['id', 'DESC']], limit: 50 })
    : [];
  return { ...shop.toJSON(), subscription, usage: await subscriptionService.usage(shop.id), subscription_events: events };
};

/** POST /api/admin/barbershops/:id/suspend | /reactivate — fora do ar (página, busca, agendamento). */
const setStatus = async (id, status, reason) => {
  const shop = await Barbershop.findByPk(id);
  if (!shop) throw new NotFoundError('Barbearia não encontrada');
  const before = shop.status;
  await shop.update({ status });
  await audit.record({ action: `barbershop.${status === 'suspended' ? 'suspended' : 'reactivated'}`, entity: 'barbershop', entityId: id, barbershopId: shop.id, before: { status: before }, after: { status, reason: reason || null } });
  return { id: shop.id, status: shop.status };
};

/** POST /api/admin/barbershops/:id/extend-trial {days} */
const extendTrial = async (id, days, now = new Date()) => {
  const subscription = await Subscription.findOne({ where: { barbershop_id: id } });
  if (!subscription) throw new NotFoundError('Assinatura não encontrada');
  if (!['trialing', 'expired'].includes(subscription.status)) {
    throw new ValidationError('Só é possível estender trial (ativo ou expirado)');
  }
  const base = subscription.trial_ends_at && new Date(subscription.trial_ends_at) > now ? new Date(subscription.trial_ends_at) : now;
  const before = { status: subscription.status, trial_ends_at: subscription.trial_ends_at };
  await subscription.update({ status: 'trialing', trial_ends_at: new Date(base.getTime() + days * DAY) });
  await subscriptionService.recordEvent(subscription, 'trial.extended', { from: before.status, to: 'trialing', payload: { days } });
  await audit.record({ action: 'subscription.trial_extended', entity: 'subscription', entityId: subscription.id, barbershopId: Number(id), before, after: { trial_ends_at: subscription.trial_ends_at, days } });
  return { barbershop_id: Number(id), status: subscription.status, trial_ends_at: subscription.trial_ends_at };
};

/** GET /api/admin/users?q&role */
const listUsers = async (query = {}) => {
  const { page, pageSize, offset, limit } = parsePagination(query);
  const where = {};
  if (query.role) where.role = query.role;
  if (query.q) where[Op.or] = [likeMatch('User.name', query.q), likeMatch('User.email', query.q)];
  const { rows, count } = await User.findAndCountAll({ where, order: [['id', 'DESC']], offset, limit });
  return { items: rows.map(sanitizeUser), page, pageSize, total: count, totalPages: Math.ceil(count / pageSize) };
};

/**
 * GET /api/admin/metrics — MRR (assinaturas ativas e em atraso pelo preço do plano), contagens por
 * status, trials, novas barbearias e churn dos últimos 30 dias.
 */
const metrics = async (now = new Date()) => {
  const [subs, plans] = await Promise.all([Subscription.findAll(), Plan.findAll()]);
  const price = new Map(plans.map((plan) => [plan.code, plan.price_cents]));
  const byStatus = {};
  const byPlan = {};
  let mrrCents = 0;
  for (const sub of subs) {
    byStatus[sub.status] = (byStatus[sub.status] || 0) + 1;
    if (['active', 'past_due'].includes(sub.status)) {
      mrrCents += price.get(sub.plan_code) || 0;
      byPlan[sub.plan_code] = (byPlan[sub.plan_code] || 0) + 1;
    }
  }
  const since = new Date(now.getTime() - 30 * DAY);
  const [newBarbershops, canceledLast30] = await Promise.all([
    Barbershop.count({ where: { created_at: { [Op.gte]: since } } }),
    SubscriptionEvent.count({
      where: { created_at: { [Op.gte]: since }, to_status: { [Op.in]: ['canceled', 'expired'] } },
    }),
  ]);
  const paying = (byStatus.active || 0) + (byStatus.past_due || 0);
  return {
    mrr: (mrrCents / 100).toFixed(2),
    mrr_cents: mrrCents,
    subscriptions_by_status: byStatus,
    paying_by_plan: byPlan,
    paying,
    trials: byStatus.trialing || 0,
    new_barbershops_30d: newBarbershops,
    churned_30d: canceledLast30,
    churn_rate_30d: paying + canceledLast30 ? Math.round((canceledLast30 / (paying + canceledLast30)) * 10000) / 10000 : 0,
  };
};

module.exports = { listBarbershops, getBarbershop, setStatus, extendTrial, listUsers, metrics };
