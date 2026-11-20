// BE-32: assinatura do SaaS na AbacatePay (checkout, troca de plano, cancelamento, portal).
// Regra de ouro: a assinatura só é ATIVADA por webhook (BE-33) — nunca pelo retorno do navegador.
const { Plan, User } = require('../../models');
const audit = () => require('../audit/auditService');
const { assertCanManageBarbershop } = require('../../shared/authz');
const { normalizeTaxId } = require('../../shared/taxId');
const subscriptionService = require('../subscription/subscriptionService');
const { getClient, AbacatePayError } = require('../../integrations/abacatepay/client');
const { AppError, ValidationError, ConflictError, NotFoundError, CODES } = require('../../utils/errorHandler');

const appUrl = () => (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '');
const productExternalId = (planCode) => `barberos-plan-${planCode}`;
const checkoutExternalId = (barbershopId) => `barbershop-${barbershopId}`;
const METHODS = () =>
  String(process.env.ABACATEPAY_METHODS || 'CARD')
    .split(',')
    .map((method) => method.trim().toUpperCase())
    .filter((method) => ['CARD', 'PIX'].includes(method));

const client = () => {
  const instance = getClient();
  if (!instance.configured) {
    throw new AppError('Cobrança indisponível no momento. Tente novamente mais tarde.', 503, CODES.BILLING_UNAVAILABLE);
  }
  return instance;
};

/** Erro da AbacatePay vira 502 sem vazar detalhes internos do provedor ao cliente. */
const provider = async (fn) => {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AbacatePayError) {
      throw new AppError('Falha ao comunicar com o provedor de pagamento. Tente novamente.', 502, CODES.PAYMENT_PROVIDER_ERROR);
    }
    throw error;
  }
};

const loadContext = async (barbershopId, user) => {
  const barbershop = await assertCanManageBarbershop(user, barbershopId, { access: 'read' });
  const subscription = await subscriptionService.findByBarbershop(barbershop.id);
  if (!subscription) throw new NotFoundError('Assinatura não encontrada');
  return { barbershop, subscription };
};

const loadPlan = async (planCode) => {
  const plan = await Plan.findOne({ where: { code: planCode, active: true } });
  if (!plan) throw new ValidationError('Plano inválido');
  if (!plan.abacatepay_product_id) {
    throw new AppError('Plano ainda não disponível para assinatura', 503, CODES.BILLING_UNAVAILABLE);
  }
  return plan;
};

const isPaying = (subscription) => ['active', 'past_due'].includes(subscription.status) && Boolean(subscription.abacatepay_subscription_id);

const summary = (subscription) => ({
  barbershop_id: subscription.barbershop_id,
  plan_code: subscription.plan_code,
  pending_plan_code: subscription.pending_plan_code || null,
  status: subscription.status,
  trial_ends_at: subscription.trial_ends_at,
  current_period_end: subscription.current_period_end,
  cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
});

/** Uso atual cabe no plano? Senão 409 PLAN_LIMIT_EXCEEDED com o detalhe por recurso. */
const assertUsageFits = async (barbershopId, plan) => {
  const used = await subscriptionService.usage(barbershopId);
  const exceeded = Object.entries(plan.limits)
    .filter(([resource, max]) => max !== null && used[resource] !== undefined && used[resource] > max)
    .map(([resource, max]) => ({ resource, limit: max, used: used[resource] }));
  if (exceeded.length) {
    throw new ConflictError('O uso atual excede os limites do plano escolhido', CODES.PLAN_LIMIT_EXCEEDED, { exceeded });
  }
};

/** POST /api/billing/checkout — cria/reusa o customer e gera o checkout da assinatura. */
const checkout = async ({ barbershop_id: barbershopId, plan_code: planCode, tax_id: taxIdInput, cellphone }, user) => {
  const { barbershop, subscription } = await loadContext(barbershopId, user);
  const taxId = normalizeTaxId(taxIdInput);
  if (!taxId) throw new ValidationError('CPF ou CNPJ inválido', undefined, CODES.INVALID_TAX_ID);
  if (isPaying(subscription) && !subscription.cancel_at_period_end) {
    throw new ConflictError('A barbearia já tem uma assinatura ativa. Use a troca de plano.', CODES.SUBSCRIPTION_ALREADY_ACTIVE);
  }
  const plan = await loadPlan(planCode);
  await assertUsageFits(barbershop.id, plan);
  const api = client();
  const owner = await User.findByPk(barbershop.owner_id, { attributes: ['id', 'name', 'email', 'phone'] });

  const customer = await provider(() =>
    api.createCustomer({
      email: owner.email,
      name: owner.name,
      taxId,
      ...(cellphone || owner.phone ? { cellphone: String(cellphone || owner.phone).replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '') } : {}),
      metadata: { barbershop_id: String(barbershop.id) },
    })
  );

  const billing = await provider(() =>
    api.createSubscriptionCheckout({
      items: [{ id: plan.abacatepay_product_id, quantity: 1 }],
      customerId: customer.id,
      externalId: checkoutExternalId(barbershop.id),
      methods: METHODS().length ? METHODS() : ['CARD'],
      returnUrl: `${appUrl()}/dashboard/assinatura?status=cancelado`,
      completionUrl: `${appUrl()}/dashboard/assinatura?status=processando`,
      metadata: { barbershop_id: String(barbershop.id), plan_code: plan.code },
    })
  );

  const from = subscription.status;
  const updates = {
    abacatepay_customer_id: customer.id,
    abacatepay_checkout_id: billing.id,
    billing_tax_id: taxId,
    pending_plan_code: plan.code,
  };
  // Trial continua valendo até o webhook confirmar; assinatura encerrada fica aguardando pagamento.
  if (['expired', 'canceled'].includes(subscription.status)) updates.status = 'pending';
  await subscription.update(updates);
  await subscriptionService.recordEvent(subscription, 'checkout.created', {
    from,
    to: subscription.status,
    payload: { plan_code: plan.code, checkout_id: billing.id },
  });
  await audit().record({ action: 'subscription.checkout', entity: 'subscription', entityId: subscription.id, barbershopId: barbershop.id, after: { plan_code: plan.code } });
  return { checkout_url: billing.url, checkout_id: billing.id, subscription: summary(subscription) };
};

/** POST /api/billing/change-plan — vale a partir do próximo ciclo (regra da AbacatePay). */
const changePlan = async ({ barbershop_id: barbershopId, plan_code: planCode }, user) => {
  const { barbershop, subscription } = await loadContext(barbershopId, user);
  if (!isPaying(subscription)) {
    throw new ConflictError('Não há assinatura paga ativa para trocar de plano', CODES.NO_ACTIVE_SUBSCRIPTION);
  }
  if (planCode === subscription.plan_code && !subscription.pending_plan_code) {
    throw new ConflictError('A barbearia já está neste plano', CODES.SAME_PLAN);
  }
  const plan = await loadPlan(planCode);
  await assertUsageFits(barbershop.id, plan);
  await provider(() => client().changePlan(subscription.abacatepay_subscription_id, plan.abacatepay_product_id));
  const pending = planCode === subscription.plan_code ? null : plan.code;
  await subscription.update({ pending_plan_code: pending });
  await subscriptionService.recordEvent(subscription, 'plan_change.requested', { payload: { plan_code: plan.code } });
  await audit().record({ action: 'subscription.plan_change', entity: 'subscription', entityId: subscription.id, barbershopId: barbershop.id, before: { plan_code: subscription.plan_code }, after: { plan_code: plan.code } });
  return { subscription: summary(subscription), effective_at: subscription.current_period_end };
};

/**
 * POST /api/billing/cancel — marca cancel_at_period_end. A AbacatePay cancela na hora, então a
 * chamada à API acontece no fim do período, pelo job diário (BE-33). Trial: só marca.
 */
const cancel = async ({ barbershop_id: barbershopId }, user, now = new Date()) => {
  const { subscription } = await loadContext(barbershopId, user);
  if (!['trialing', 'active', 'past_due', 'pending'].includes(subscription.status)) {
    throw new ConflictError('Assinatura já encerrada', CODES.NO_ACTIVE_SUBSCRIPTION);
  }
  if (!subscription.cancel_at_period_end) {
    await subscription.update({ cancel_at_period_end: true, cancel_requested_at: now });
    await subscriptionService.recordEvent(subscription, 'cancel.requested', { payload: { at_period_end: subscription.current_period_end } });
    await audit().record({ action: 'subscription.cancel_requested', entity: 'subscription', entityId: subscription.id, barbershopId: subscription.barbershop_id });
  }
  return { subscription: summary(subscription) };
};

/** POST /api/billing/resume — desfaz o cancelamento agendado (antes do fim do período). */
const resume = async ({ barbershop_id: barbershopId }, user) => {
  const { subscription } = await loadContext(barbershopId, user);
  if (!subscription.cancel_at_period_end) return { subscription: summary(subscription) };
  if (!['trialing', 'active', 'past_due', 'pending'].includes(subscription.status)) {
    throw new ConflictError('Assinatura já encerrada; faça um novo checkout', CODES.NO_ACTIVE_SUBSCRIPTION);
  }
  await subscription.update({ cancel_at_period_end: false, cancel_requested_at: null });
  await subscriptionService.recordEvent(subscription, 'cancel.reverted');
  return { subscription: summary(subscription) };
};

/** POST /api/billing/portal — link do portal do cliente (cartão, recibos). */
const portal = async ({ barbershop_id: barbershopId }, user) => {
  const { subscription } = await loadContext(barbershopId, user);
  if (!subscription.abacatepay_customer_id || !subscription.abacatepay_checkout_id) {
    throw new ConflictError('Ainda não há assinatura paga para gerenciar', CODES.NO_ACTIVE_SUBSCRIPTION);
  }
  const result = await provider(() =>
    client().createCustomerPortal(subscription.abacatepay_customer_id, subscription.abacatepay_checkout_id)
  );
  return { portal_url: result.url };
};

/**
 * Cria/atualiza os produtos (um por plano, cobrança mensal) e grava abacatepay_product_id.
 * Usado por `npm run billing:sync-products`. Idempotente pelo externalId.
 */
const syncProducts = async ({ api = getClient(), log = () => {} } = {}) => {
  if (!api.configured) throw new Error('Defina ABACATEPAY_API_KEY para sincronizar os produtos');
  const plans = await Plan.findAll({ where: { active: true }, order: [['sort_order', 'ASC']] });
  let existing = null;
  const results = [];
  for (const plan of plans) {
    if (plan.abacatepay_product_id) {
      results.push({ code: plan.code, product_id: plan.abacatepay_product_id, action: 'kept' });
      continue;
    }
    const externalId = productExternalId(plan.code);
    let product;
    try {
      product = await api.createProduct({
        externalId,
        name: `BarberOS ${plan.name}`,
        description: `Assinatura mensal do plano ${plan.name}`,
        price: plan.price_cents,
        currency: 'BRL',
        cycle: 'MONTHLY',
      });
    } catch (error) {
      if (!(error instanceof AbacatePayError) || !/already exists/i.test(error.message)) throw error;
      if (!existing) existing = (await api.listProducts({ limit: 100 })) || [];
      product = existing.find((item) => item.externalId === externalId);
      if (!product) throw error;
    }
    if (product.price !== plan.price_cents) {
      log(`Atenção: produto ${externalId} tem preço ${product.price} ≠ ${plan.price_cents} do plano`);
    }
    await plan.update({ abacatepay_product_id: product.id });
    results.push({ code: plan.code, product_id: product.id, action: 'linked' });
  }
  return results;
};

module.exports = {
  checkout,
  changePlan,
  cancel,
  resume,
  portal,
  syncProducts,
  productExternalId,
  checkoutExternalId,
  summary,
  isPaying,
};
