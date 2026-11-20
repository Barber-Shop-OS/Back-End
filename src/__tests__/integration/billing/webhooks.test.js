// BE-33 / SEC-13: webhooks AbacatePay — segredo, assinatura, idempotência, transições e reconciliação.
// Payloads no formato da doc v2 (envelope { id, event, apiVersion, devMode, data }).
jest.setTimeout(120000);

const crypto = require('crypto');
const { app, request, resetDatabase, createTenant, sequelize } = require('../../helpers/factories');
const { Plan, Subscription, SubscriptionEvent, WebhookEvent, Job } = require('../../../models');
const worker = require('../../../jobs/worker');
const service = require('../../../modules/billing/billingWebhookService');
const abacate = require('../../../integrations/abacatepay/client');

const SECRET = 'whsec_test_0123456789abcdefghijklmnopqrstuvwxyz';
const PUBLIC_KEY = 'abacatepay-public-key-for-tests';
let seq = 0;

const event = (type, data) => {
  seq += 1;
  return { id: `log_test_${seq}`, event: type, apiVersion: 2, devMode: true, data };
};

const subscriptionData = (barbershopId, { amount = 9900, product = 'prod_essencial', subsId = 'subs_1', status = 'ACTIVE' } = {}) => ({
  subscription: { id: subsId, amount, currency: 'BRL', method: 'CARD', status, frequency: 'MONTHLY' },
  customer: { id: 'cust_1', name: 'Dono', email: 'dono@x.com', taxId: '111.***.777-**' },
  checkout: {
    id: 'bill_1',
    externalId: `barbershop-${barbershopId}`,
    amount,
    paidAmount: amount,
    frequency: 'SUBSCRIPTION',
    items: [{ id: product, quantity: 1 }],
    status: 'PAID',
    customerId: 'cust_1',
    metadata: null,
  },
  payment: { id: 'card_1', externalId: `barbershop-${barbershopId}`, amount, paidAmount: amount, status: 'APPROVED', metadata: {} },
});

const sign = (raw) => crypto.createHmac('sha256', PUBLIC_KEY).update(raw).digest('base64');

const send = (payload, { secret = SECRET, signature, via = 'query' } = {}) => {
  const raw = JSON.stringify(payload);
  const req = request(app).post(`/api/webhooks/abacatepay${via === 'query' && secret ? `?webhookSecret=${secret}` : ''}`);
  if (via === 'header' && secret) req.set('X-Webhook-Secret', secret);
  req.set('X-Webhook-Signature', signature === undefined ? sign(raw) : signature);
  return req.set('Content-Type', 'application/json').send(raw);
};

const drain = () => worker.runOnce({ limit: 50 });
const subOf = (tenant) => Subscription.findOne({ where: { barbershop_id: tenant.barbershop.id } });

describe('BE-33 — webhooks AbacatePay', () => {
  let tenant;

  beforeAll(async () => {
    process.env.ABACATEPAY_WEBHOOK_SECRET = SECRET;
    process.env.ABACATEPAY_WEBHOOK_PUBLIC_KEY = PUBLIC_KEY;
    await resetDatabase();
    await Promise.all(['essencial', 'profissional', 'rede'].map((code) => Plan.update({ abacatepay_product_id: `prod_${code}` }, { where: { code } })));
    tenant = await createTenant({ subscription: { abacatepay_customer_id: 'cust_1', abacatepay_checkout_id: 'bill_1', pending_plan_code: 'essencial' } });
  });

  afterAll(async () => {
    delete process.env.ABACATEPAY_WEBHOOK_SECRET;
    delete process.env.ABACATEPAY_WEBHOOK_PUBLIC_KEY;
    abacate.setClient(null);
    await sequelize.close();
  });

  describe('autenticação', () => {
    it('segredo errado ou ausente → 401 sem efeito', async () => {
      const payload = event('subscription.completed', subscriptionData(tenant.barbershop.id));
      expect((await send(payload, { secret: 'errado' })).status).toBe(401);
      expect((await send(payload, { secret: null })).status).toBe(401);
      expect(await WebhookEvent.count()).toBe(0);
    });

    it('assinatura inválida (corpo adulterado) → 401 sem efeito', async () => {
      const payload = event('subscription.completed', subscriptionData(tenant.barbershop.id));
      const res = await send(payload, { signature: sign(JSON.stringify({ ...payload, id: 'outro' })) });
      expect(res.status).toBe(401);
      expect(await WebhookEvent.count()).toBe(0);
      expect((await subOf(tenant)).status).toBe('trialing');
    });

    it('sem segredo configurado → 503 (AbacatePay tenta de novo), nunca 410', async () => {
      delete process.env.ABACATEPAY_WEBHOOK_SECRET;
      const res = await send(event('subscription.renewed', {}));
      expect(res.status).toBe(503);
      process.env.ABACATEPAY_WEBHOOK_SECRET = SECRET;
    });

    it('corpo sem id/event → 400', async () => {
      expect((await send({ foo: 1 })).status).toBe(400);
    });
  });

  describe('transições', () => {
    it('subscription.completed ativa (só via webhook), define plano e período; replay não reprocessa', async () => {
      const payload = event('subscription.completed', subscriptionData(tenant.barbershop.id));
      const first = await send(payload, { via: 'header' });
      expect(first.status).toBe(200);
      expect(first.body).toEqual({ received: true, duplicate: false });
      // Ainda não processado: só enfileirado (resposta rápida).
      expect((await subOf(tenant)).status).toBe('trialing');
      await drain();
      const sub = await subOf(tenant);
      expect(sub).toMatchObject({ status: 'active', plan_code: 'essencial', pending_plan_code: null, abacatepay_subscription_id: 'subs_1' });
      const days = (new Date(sub.current_period_end) - new Date(sub.current_period_start)) / 86400000;
      expect(days).toBeGreaterThanOrEqual(28);
      expect(days).toBeLessThanOrEqual(31);

      const replay = await send(payload);
      expect(replay.status).toBe(200);
      expect(replay.body.duplicate).toBe(true);
      await drain();
      expect(await SubscriptionEvent.count({ where: { subscription_id: sub.id, type: 'webhook.subscription.completed' } })).toBe(1);
      expect(await WebhookEvent.count({ where: { event_id: payload.id } })).toBe(1);
    });

    it('subscription.renewed estende o período a partir do fim anterior', async () => {
      const before = await subOf(tenant);
      await send(event('subscription.renewed', subscriptionData(tenant.barbershop.id)));
      await drain();
      const after = await subOf(tenant);
      expect(new Date(after.current_period_start).getTime()).toBe(new Date(before.current_period_end).getTime());
      expect(new Date(after.current_period_end) > new Date(before.current_period_end)).toBe(true);
    });

    it('payment_failed → past_due e e-mail ao dono; renewed volta a active', async () => {
      await send(event('subscription.payment_failed', { ...subscriptionData(tenant.barbershop.id), retryNumber: 1 }));
      await drain();
      const failed = await subOf(tenant);
      expect(failed.status).toBe('past_due');
      expect(failed.past_due_since).toBeTruthy();
      const emails = await Job.findAll({ where: { type: 'email.send' } });
      expect(emails.some((job) => JSON.stringify(job.payload).includes(tenant.owner.email))).toBe(true);

      await send(event('subscription.renewed', subscriptionData(tenant.barbershop.id)));
      await drain();
      const recovered = await subOf(tenant);
      expect(recovered.status).toBe('active');
      expect(recovered.past_due_since).toBeNull();
    });

    it('plan_changed: pedido (PENDING) não muda; aplicado troca o plano; renewed aplica troca pendente', async () => {
      await send(event('subscription.plan_changed', { ...subscriptionData(tenant.barbershop.id), status: 'PENDING', pendingUpdateId: 'subu_1', items: [{ productId: 'prod_rede', quantity: 1 }] }));
      await drain();
      expect((await subOf(tenant)).plan_code).toBe('essencial');

      await send(event('subscription.plan_changed', { ...subscriptionData(tenant.barbershop.id, { amount: 39900, product: 'prod_rede' }) }));
      await drain();
      expect((await subOf(tenant)).plan_code).toBe('rede');

      await Subscription.update({ pending_plan_code: 'profissional' }, { where: { barbershop_id: tenant.barbershop.id } });
      await send(event('subscription.renewed', subscriptionData(tenant.barbershop.id, { amount: 19900, product: 'prod_rede' })));
      await drain();
      expect(await subOf(tenant)).toMatchObject({ plan_code: 'profissional', pending_plan_code: null });
    });

    it('subscription.cancelled → canceled', async () => {
      await send(event('subscription.cancelled', subscriptionData(tenant.barbershop.id, { status: 'CANCELLED' })));
      await drain();
      expect((await subOf(tenant)).status).toBe('canceled');
    });

    it('valor divergente do plano → não ativa, evento rejected', async () => {
      const other = await createTenant({ subscription: { status: 'pending' } });
      const payload = event('subscription.completed', subscriptionData(other.barbershop.id, { amount: 100, subsId: 'subs_fraude' }));
      await send(payload);
      await drain();
      expect((await subOf(other)).status).toBe('pending');
      expect((await WebhookEvent.findOne({ where: { event_id: payload.id } })).status).toBe('rejected');
      expect(await SubscriptionEvent.count({ where: { type: 'webhook.divergence' } })).toBe(1);
    });

    it('evento desconhecido → 200 e ignorado; sem assinatura correspondente → ignorado', async () => {
      const unknown = event('payout.completed', { amount: 1 });
      expect((await send(unknown)).status).toBe(200);
      const orphan = event('subscription.completed', subscriptionData(999999, { subsId: 'subs_x' }));
      await send(orphan);
      await drain();
      expect((await WebhookEvent.findOne({ where: { event_id: unknown.id } })).status).toBe('ignored');
      expect((await WebhookEvent.findOne({ where: { event_id: orphan.id } })).status).toBe('ignored');
    });
  });

  describe('job diário', () => {
    it('reconcilia pending que ficou ACTIVE na AbacatePay e cancela no fim do período', async () => {
      const lost = await createTenant({ subscription: { status: 'pending', abacatepay_customer_id: 'cust_9', pending_plan_code: 'profissional' } });
      const ending = await createTenant({
        subscription: { status: 'active', abacatepay_subscription_id: 'subs_end', cancel_at_period_end: true, current_period_end: new Date(Date.now() - 60000) },
      });
      const calls = [];
      const api = {
        configured: true,
        getSubscription: async (query) => {
          calls.push(['get', query]);
          return { id: 'subs_lost', status: 'ACTIVE', amount: 19900 };
        },
        cancelSubscription: async (id) => {
          calls.push(['cancel', id]);
          return { id, status: 'CANCELLED' };
        },
      };
      const stats = await service.reconcile(new Date(), api);
      expect(stats).toMatchObject({ reconciled: 1, canceled: 1 });
      expect(await subOf(lost)).toMatchObject({ status: 'active', plan_code: 'profissional', abacatepay_subscription_id: 'subs_lost' });
      expect((await subOf(ending)).status).toBe('canceled');
      expect(calls).toContainEqual(['get', { externalId: `barbershop-${lost.barbershop.id}` }]);
      expect(calls).toContainEqual(['cancel', 'subs_end']);
    });

    it('scheduleDaily enfileira um job por dia', async () => {
      const day = new Date('2026-12-01T10:00:00Z');
      expect(await service.scheduleDaily(day)).toBe(true);
      expect(await service.scheduleDaily(day)).toBe(false);
      expect(await Job.count({ where: { reference: 'billing.daily:2026-12-01' } })).toBe(1);
    });

    it('addMonths respeita o fim do mês', () => {
      expect(service.addMonths(new Date('2026-01-31T12:00:00Z'), 1).toISOString()).toBe('2026-02-28T12:00:00.000Z');
      expect(service.addMonths(new Date('2026-03-15T00:00:00Z'), 1).toISOString()).toBe('2026-04-15T00:00:00.000Z');
    });
  });
});
