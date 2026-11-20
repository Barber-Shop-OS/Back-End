// BE-33 / SEC-13: webhooks da AbacatePay (v2) e máquina de estados da assinatura.
//
// Recebimento (rota): segredo (query ?webhookSecret= ou header X-Webhook-Secret, comparação em tempo
// constante) prova a origem; X-Webhook-Signature = base64(HMAC-SHA256(corpo cru, chave pública da
// AbacatePay)) prova a integridade quando ABACATEPAY_WEBHOOK_PUBLIC_KEY está configurada.
// Idempotência por `id` do evento (webhook_events). Resposta 200 rápida; processamento no worker.
// Nunca responder 410 (desativa o webhook na AbacatePay).
//
// Transições:
//   subscription.completed       → active (período de 1 mês, plano conferido pelo valor/produto)
//   subscription.renewed         → active, estende current_period_end, aplica troca pendente
//   subscription.payment_failed  → past_due (+ e-mail ao dono)
//   subscription.plan_changed    → (aplicada) plan_code novo
//   subscription.cancelled       → canceled
//   checkout.completed           → só vincula o checkout (a ativação vem do subscription.*)
//   desconhecido                 → registrado e ignorado
const crypto = require('crypto');
const { Op } = require('sequelize');
const { WebhookEvent, Subscription, Plan, Barbershop, User } = require('../../models');
const queue = require('../../jobs/queue');
const worker = require('../../jobs/worker');
const subscriptionService = require('../subscription/subscriptionService');
const { getClient } = require('../../integrations/abacatepay/client');
const logger = require('../../utils/logger');
const { AppError, UnauthorizedError, ValidationError, CODES } = require('../../utils/errorHandler');

const PROVIDER = 'abacatepay';
const JOB_TYPE = 'billing.webhook';
const DAILY_JOB_TYPE = 'billing.daily';
const appUrl = () => (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '');

const safeEqual = (a, b) => {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && left.length > 0 && crypto.timingSafeEqual(left, right);
};

/** Valida segredo e assinatura. Lança 401 (sem efeito) ou 503 se não configurado. */
const verify = ({ rawBody, secret, signature }) => {
  const expected = process.env.ABACATEPAY_WEBHOOK_SECRET;
  // 503 faz a AbacatePay tentar de novo depois que o segredo for configurado (4xx não é retentado).
  if (!expected) throw new AppError('Webhook não configurado', 503, CODES.BILLING_UNAVAILABLE);
  if (!safeEqual(secret, expected)) throw new UnauthorizedError('Webhook não autorizado');
  const publicKey = process.env.ABACATEPAY_WEBHOOK_PUBLIC_KEY;
  if (publicKey) {
    const digest = crypto.createHmac('sha256', publicKey).update(rawBody || Buffer.alloc(0)).digest('base64');
    if (!safeEqual(signature, digest)) throw new UnauthorizedError('Assinatura do webhook inválida');
  }
};

/** Recebe o webhook: valida, deduplica, enfileira. Retorna { duplicate }. */
const receive = async ({ rawBody, secret, signature }) => {
  verify({ rawBody, secret, signature });
  let event;
  try {
    event = JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody || ''));
  } catch {
    throw new ValidationError('Corpo do webhook inválido');
  }
  if (!event || typeof event.id !== 'string' || typeof event.event !== 'string') {
    throw new ValidationError('Evento sem id/event');
  }
  const existing = await WebhookEvent.findOne({ where: { provider: PROVIDER, event_id: event.id } });
  if (existing) return { duplicate: true };
  try {
    const row = await WebhookEvent.create({ provider: PROVIDER, event_id: event.id.slice(0, 100), type: event.event.slice(0, 60), payload: event });
    await queue.enqueue(JOB_TYPE, { webhook_event_id: row.id }, { reference: `webhook:${row.id}` });
  } catch (error) {
    // Entrega simultânea do mesmo id: o índice único segura; trata como duplicado.
    if (error.name === 'SequelizeUniqueConstraintError') return { duplicate: true };
    throw error;
  }
  return { duplicate: false };
};

// ---------------------------------------------------------------------------------------------
// Processamento
// ---------------------------------------------------------------------------------------------

const addMonths = (date, months) => {
  const next = new Date(date);
  const day = next.getUTCDate();
  next.setUTCMonth(next.getUTCMonth() + months);
  // 31/01 + 1 mês → último dia de fevereiro (não 03/03).
  if (next.getUTCDate() < day) next.setUTCDate(0);
  return next;
};

const barbershopIdFrom = (data) => {
  const candidates = [
    data.checkout && data.checkout.externalId,
    data.payment && data.payment.externalId,
    data.checkout && data.checkout.metadata && data.checkout.metadata.barbershop_id,
    data.payment && data.payment.metadata && data.payment.metadata.barbershop_id,
  ];
  for (const value of candidates) {
    const match = /^(?:barbershop-)?(\d+)$/.exec(String(value || ''));
    if (match) return Number(match[1]);
  }
  return null;
};

/**
 * Assinatura local do evento. O externalId/metadata (barbershop-<id>) é autoritativo: se aponta para
 * uma barbearia, só a assinatura dela serve (nada de cair em outra pelo checkout/customer).
 * Sem externalId: pelo id da assinatura, do checkout ou do customer na AbacatePay.
 */
const findSubscription = async (data) => {
  const barbershopId = barbershopIdFrom(data);
  const subsId = data.subscription && data.subscription.id;
  if (barbershopId) {
    const byShop = await Subscription.findOne({ where: { barbershop_id: barbershopId } });
    if (byShop && subsId && byShop.abacatepay_subscription_id && byShop.abacatepay_subscription_id !== subsId) {
      logger.warn('[billing] webhook com assinatura diferente da registrada', { barbershop_id: barbershopId });
    }
    return byShop;
  }
  if (subsId) {
    const bySubs = await Subscription.findOne({ where: { abacatepay_subscription_id: subsId } });
    if (bySubs) return bySubs;
  }
  const checkoutId = data.checkout && data.checkout.id;
  if (checkoutId) {
    const byCheckout = await Subscription.findOne({ where: { abacatepay_checkout_id: checkoutId } });
    if (byCheckout) return byCheckout;
  }
  const customerId = (data.customer && data.customer.id) || (data.checkout && data.checkout.customerId);
  if (customerId) return Subscription.findOne({ where: { abacatepay_customer_id: customerId } });
  return null;
};

/** Plano pelo produto do checkout (ou itens da troca) e conferência do valor cobrado. */
const resolvePlan = async (data) => {
  const productIds = [
    ...((data.checkout && data.checkout.items) || []).map((item) => item.id),
    ...((data.items || []).map((item) => item.productId)),
    data.productId,
  ].filter(Boolean);
  if (productIds.length) {
    const plan = await Plan.findOne({ where: { abacatepay_product_id: { [Op.in]: productIds } } });
    if (plan) return plan;
  }
  return null;
};

const chargedAmount = (data) =>
  (data.subscription && data.subscription.amount) ||
  (data.payment && (data.payment.paidAmount || data.payment.amount)) ||
  (data.checkout && (data.checkout.paidAmount || data.checkout.amount)) ||
  null;

class Divergence extends Error {}

const transition = async (subscription, type, updates, payload) => {
  const from = subscription.status;
  await subscription.update(updates);
  await subscriptionService.recordEvent(subscription, `webhook.${type}`, { from, to: subscription.status, payload });
};

const notifyOwner = async (subscription, { title, message }) => {
  const shop = await Barbershop.findByPk(subscription.barbershop_id, { include: [{ model: User, as: 'owner', attributes: ['name', 'email'] }] });
  if (!shop || !shop.owner) return;
  await queue.enqueue('email.send', {
    template: 'billing',
    to: shop.owner.email,
    data: {
      title,
      message,
      first_name: shop.owner.name.split(' ')[0],
      barbershop_name: shop.name,
      billing_url: `${appUrl()}/dashboard/assinatura`,
    },
  });
};

const HANDLERS = {
  'subscription.completed': async (subscription, data, now) => {
    const plan = await resolvePlan(data);
    const amount = chargedAmount(data);
    if (!plan) throw new Divergence('Produto do checkout não corresponde a nenhum plano');
    if (amount !== null && Number(amount) !== plan.price_cents) {
      throw new Divergence(`Valor cobrado ${amount} diferente do plano ${plan.code} (${plan.price_cents})`);
    }
    await transition(
      subscription,
      'subscription.completed',
      {
        status: 'active',
        plan_code: plan.code,
        pending_plan_code: null,
        abacatepay_subscription_id: (data.subscription && data.subscription.id) || subscription.abacatepay_subscription_id,
        abacatepay_customer_id: (data.customer && data.customer.id) || subscription.abacatepay_customer_id,
        abacatepay_checkout_id: (data.checkout && data.checkout.id) || subscription.abacatepay_checkout_id,
        current_period_start: now,
        current_period_end: addMonths(now, 1),
        past_due_since: null,
        trial_ends_at: subscription.trial_ends_at,
      },
      { plan_code: plan.code, amount }
    );
  },

  'subscription.renewed': async (subscription, data, now) => {
    const previousEnd = subscription.current_period_end ? new Date(subscription.current_period_end) : null;
    const start = previousEnd && previousEnd > now ? previousEnd : now;
    const updates = {
      status: 'active',
      current_period_start: start,
      current_period_end: addMonths(start, 1),
      past_due_since: null,
    };
    if (data.subscription && data.subscription.id) updates.abacatepay_subscription_id = data.subscription.id;
    // Troca agendada (change-plan) passa a valer no ciclo novo quando o valor bate com o plano novo.
    if (subscription.pending_plan_code) {
      const pending = await Plan.findOne({ where: { code: subscription.pending_plan_code } });
      if (pending && Number(chargedAmount(data)) === pending.price_cents) {
        updates.plan_code = pending.code;
        updates.pending_plan_code = null;
      }
    }
    await transition(subscription, 'subscription.renewed', updates, { amount: chargedAmount(data) });
  },

  'subscription.payment_failed': async (subscription, data, now) => {
    await transition(
      subscription,
      'subscription.payment_failed',
      { status: 'past_due', past_due_since: subscription.past_due_since || now },
      { retry: data.retryNumber || null, reject_code: data.rejectCode || null }
    );
    await notifyOwner(subscription, {
      title: 'Não conseguimos cobrar sua assinatura',
      message:
        'A cobrança da assinatura do BarberOS falhou. Atualize a forma de pagamento para não perder o acesso — você tem 7 dias de carência.',
    });
  },

  'subscription.plan_changed': async (subscription, data) => {
    if (data.status === 'PENDING' || data.pendingUpdateId) {
      await subscriptionService.recordEvent(subscription, 'webhook.subscription.plan_change_scheduled', { payload: { status: data.status || null } });
      return;
    }
    const plan = await resolvePlan(data);
    if (!plan) throw new Divergence('Plano novo não identificado');
    await transition(subscription, 'subscription.plan_changed', { plan_code: plan.code, pending_plan_code: null }, { plan_code: plan.code });
  },

  'subscription.cancelled': async (subscription, data, now) => {
    await transition(
      subscription,
      'subscription.cancelled',
      { status: 'canceled', cancel_at_period_end: false, current_period_end: subscription.current_period_end || now },
      { reason: (data.subscription && data.subscription.cancelledDueTo) || null }
    );
  },

  'checkout.completed': async (subscription, data) => {
    if (data.checkout && data.checkout.id && !subscription.abacatepay_checkout_id) {
      await subscription.update({ abacatepay_checkout_id: data.checkout.id });
    }
    await subscriptionService.recordEvent(subscription, 'webhook.checkout.completed', { payload: { checkout_id: data.checkout && data.checkout.id } });
  },
};

/** Job: processa um webhook_event. Divergência → status rejected (sem ativar) e alerta no log. */
const processEvent = async ({ webhook_event_id: id }, now = new Date()) => {
  const row = await WebhookEvent.findByPk(id);
  if (!row || row.processed_at) return;
  const event = row.payload;
  const data = event.data || {};
  const handler = HANDLERS[event.event];
  const finish = (status, error = null) => row.update({ status, error: error ? String(error).slice(0, 500) : null, processed_at: new Date() });

  if (!handler) {
    logger.info('[billing] evento de webhook ignorado', { type: event.event, id: event.id });
    return finish('ignored');
  }
  const subscription = await findSubscription(data);
  if (!subscription) {
    logger.warn('[billing] webhook sem assinatura correspondente', { type: event.event, id: event.id });
    return finish('ignored', 'Assinatura não encontrada');
  }
  try {
    await handler(subscription, data, now);
    return finish('processed');
  } catch (error) {
    if (error instanceof Divergence) {
      logger.error('[billing] ALERTA: divergência no webhook — assinatura não alterada', {
        type: event.event,
        id: event.id,
        barbershop_id: subscription.barbershop_id,
        reason: error.message,
      });
      await subscriptionService.recordEvent(subscription, 'webhook.divergence', { payload: { type: event.event, reason: error.message } });
      return finish('rejected', error.message);
    }
    throw error;
  }
};

// ---------------------------------------------------------------------------------------------
// Job diário: reconciliação (webhook perdido) e cancelamento no fim do período
// ---------------------------------------------------------------------------------------------

const reconcile = async (now = new Date(), api = getClient()) => {
  const stats = { reconciled: 0, canceled: 0, errors: 0 };
  if (!api.configured) return stats;

  // 1) Cancelamentos agendados cujo período acabou: cancela na AbacatePay e encerra.
  const due = await Subscription.findAll({
    where: { cancel_at_period_end: true, status: { [Op.in]: ['active', 'past_due', 'trialing', 'pending'] } },
  });
  for (const subscription of due) {
    const end = subscription.current_period_end || subscription.trial_ends_at;
    if (!end || new Date(end) > now) continue;
    try {
      if (subscription.abacatepay_subscription_id) await api.cancelSubscription(subscription.abacatepay_subscription_id);
      await transition(subscription, 'cancel.applied', { status: 'canceled', cancel_at_period_end: false }, { at: now.toISOString() });
      stats.canceled += 1;
    } catch (error) {
      stats.errors += 1;
      logger.warn('[billing] falha ao cancelar no fim do período', { barbershop_id: subscription.barbershop_id, message: error.message });
    }
  }

  // 2) pending/past_due: confere o estado na AbacatePay (cobre webhook perdido).
  const open = await Subscription.findAll({
    where: { status: { [Op.in]: ['pending', 'past_due'] }, abacatepay_customer_id: { [Op.ne]: null } },
  });
  for (const subscription of open) {
    try {
      const query = subscription.abacatepay_subscription_id
        ? { id: subscription.abacatepay_subscription_id }
        : { externalId: `barbershop-${subscription.barbershop_id}` };
      const remote = await api.getSubscription(query);
      if (!remote) continue;
      if (remote.status === 'ACTIVE' && subscription.status === 'pending') {
        const plan = subscription.pending_plan_code ? await Plan.findOne({ where: { code: subscription.pending_plan_code } }) : null;
        if (!plan || Number(remote.amount) !== plan.price_cents) {
          logger.error('[billing] ALERTA: reconciliação com valor divergente', { barbershop_id: subscription.barbershop_id });
          continue;
        }
        await transition(
          subscription,
          'reconciled.active',
          {
            status: 'active',
            plan_code: plan.code,
            pending_plan_code: null,
            abacatepay_subscription_id: remote.id,
            current_period_start: now,
            current_period_end: addMonths(now, 1),
          },
          { remote_status: remote.status }
        );
        stats.reconciled += 1;
      } else if (remote.status === 'CANCELLED') {
        await transition(subscription, 'reconciled.canceled', { status: 'canceled', cancel_at_period_end: false }, { remote_status: remote.status });
        stats.reconciled += 1;
      }
    } catch (error) {
      stats.errors += 1;
      logger.warn('[billing] falha na reconciliação', { barbershop_id: subscription.barbershop_id, message: error.message });
    }
  }
  return stats;
};

const todayKey = (now) => now.toISOString().slice(0, 10);

/** Manutenção do worker: garante um job billing.daily por dia (único entre instâncias pela referência). */
const scheduleDaily = async (now = new Date()) => {
  const { Job } = require('../../models');
  const reference = `${DAILY_JOB_TYPE}:${todayKey(now)}`;
  if (await Job.count({ where: { reference } })) return false;
  await queue.enqueue(DAILY_JOB_TYPE, { date: todayKey(now) }, { reference, maxAttempts: 3 });
  return true;
};

const dailyHooks = [];
/** Outras tarefas diárias de cobrança (ex.: BE-35 trials vencidos). */
const onDaily = (fn) => dailyHooks.push(fn);

const runDaily = async (now = new Date()) => {
  const stats = await reconcile(now);
  for (const hook of dailyHooks) await hook(now);
  return stats;
};

let registered = false;
const register = () => {
  if (registered) return;
  registered = true;
  worker.register(JOB_TYPE, (payload) => processEvent(payload));
  worker.register(DAILY_JOB_TYPE, () => runDaily());
  worker.addMaintenance(scheduleDaily);
};

module.exports = {
  verify,
  receive,
  processEvent,
  reconcile,
  runDaily,
  onDaily,
  scheduleDaily,
  register,
  addMonths,
  JOB_TYPE,
  DAILY_JOB_TYPE,
};
