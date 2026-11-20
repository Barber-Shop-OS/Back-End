// BE-32: checkout, troca de plano, cancelamento e portal com a AbacatePay simulada (fetch falso).
// Contrato dos payloads conferido com a doc v2 (docs.abacatepay.com, 2026-11).
jest.setTimeout(120000);

const { app, request, resetDatabase, createTenant, loginAs, bearer, sequelize } = require('../../helpers/factories');
const { Plan, Subscription, SubscriptionEvent, Branch, Address } = require('../../../models');
const abacate = require('../../../integrations/abacatepay/client');
const billingService = require('../../../modules/billing/billingService');
const { normalizeTaxId } = require('../../../shared/taxId');

const VALID_CPF = '111.444.777-35';
const VALID_CNPJ = '11.222.333/0001-81';

/** fetch falso: responde por rota e registra as chamadas. */
const fakeApi = (routes = {}) => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const { pathname, searchParams } = new URL(url);
    const path = pathname.replace(/^\/v2/, '');
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method: init.method, path, body, query: Object.fromEntries(searchParams), headers: init.headers });
    const handler = routes[`${init.method} ${path}`];
    const [status, payload] = handler ? handler(body) : [404, { data: null, success: false, error: 'Not found' }];
    return { ok: status < 400, status, text: async () => JSON.stringify(payload) };
  };
  return { calls, client: abacate.createClient({ apiKey: 'abc_dev_test', fetchImpl, retryDelayMs: 1 }) };
};

const ok = (data) => [200, { data, success: true, error: null }];
const happyRoutes = {
  'POST /customers/create': (body) => ok({ id: 'cust_1', email: body.email, taxId: body.taxId }),
  'POST /subscriptions/create': () => ok({ id: 'bill_1', url: 'https://app.abacatepay.com/pay/bill_1', status: 'PENDING' }),
  'POST /subscriptions/change-plan': () => ok({ id: 'subu_1', status: 'PENDING' }),
  'POST /customer-portal/create': () => ok({ id: 'cpl_1', url: 'https://portal.abacatepay.com/x' }),
};

describe('BE-32 — cobrança AbacatePay', () => {
  let tenant;
  let ownerToken;
  let api;

  const post = (path, body, token = ownerToken) => request(app).post(`/api/billing${path}`).set(bearer(token)).send(body);

  beforeAll(async () => {
    await resetDatabase();
    await Promise.all(
      ['essencial', 'profissional', 'rede'].map((code) => Plan.update({ abacatepay_product_id: `prod_${code}` }, { where: { code } }))
    );
    tenant = await createTenant({ name: 'Cobrança' });
    await tenant.owner.update({ phone: '+5511999998888' });
    ownerToken = await loginAs(tenant.owner);
  });

  beforeEach(() => {
    api = fakeApi(happyRoutes);
    abacate.setClient(api.client);
  });

  afterAll(async () => {
    abacate.setClient(null);
    await sequelize.close();
  });

  describe('POST /checkout', () => {
    it('cria customer e checkout com o contrato v2 e devolve a URL; trial continua', async () => {
      const res = await post('/checkout', { barbershop_id: tenant.barbershop.id, plan_code: 'essencial', tax_id: VALID_CPF });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ checkout_url: 'https://app.abacatepay.com/pay/bill_1', checkout_id: 'bill_1' });
      expect(res.body.subscription).toMatchObject({ status: 'trialing', pending_plan_code: 'essencial' });

      const [customerCall, checkoutCall] = api.calls;
      expect(customerCall).toMatchObject({ method: 'POST', path: '/customers/create' });
      expect(customerCall.headers.Authorization).toBe('Bearer abc_dev_test');
      expect(customerCall.body).toEqual({
        email: tenant.owner.email,
        name: tenant.owner.name,
        taxId: '11144477735',
        cellphone: '11999998888',
        metadata: { barbershop_id: String(tenant.barbershop.id) },
      });
      expect(checkoutCall.body).toEqual({
        items: [{ id: 'prod_essencial', quantity: 1 }],
        customerId: 'cust_1',
        externalId: `barbershop-${tenant.barbershop.id}`,
        methods: ['CARD'],
        returnUrl: expect.stringMatching(/\/dashboard\/assinatura\?status=cancelado$/),
        completionUrl: expect.stringMatching(/\/dashboard\/assinatura\?status=processando$/),
        metadata: { barbershop_id: String(tenant.barbershop.id), plan_code: 'essencial' },
      });

      const sub = await Subscription.findOne({ where: { barbershop_id: tenant.barbershop.id } });
      expect(sub).toMatchObject({ status: 'trialing', abacatepay_customer_id: 'cust_1', abacatepay_checkout_id: 'bill_1', billing_tax_id: '11144477735' });
      expect(await SubscriptionEvent.count({ where: { subscription_id: sub.id, type: 'checkout.created' } })).toBe(1);
    });

    it('CPF/CNPJ inválido → 400 INVALID_TAX_ID sem chamar a AbacatePay', async () => {
      const res = await post('/checkout', { barbershop_id: tenant.barbershop.id, plan_code: 'rede', tax_id: '123.456.789-00' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_TAX_ID');
      expect(api.calls).toHaveLength(0);
    });

    it('assinatura encerrada vira pending no checkout', async () => {
      const other = await createTenant({ subscription: { status: 'expired' } });
      const res = await post('/checkout', { barbershop_id: other.barbershop.id, plan_code: 'rede', tax_id: VALID_CNPJ }, await loginAs(other.owner));
      expect(res.status).toBe(201);
      expect(res.body.subscription.status).toBe('pending');
    });

    it('já paga e ativa → 409 SUBSCRIPTION_ALREADY_ACTIVE', async () => {
      const paying = await createTenant({ subscription: { status: 'active', abacatepay_subscription_id: 'subs_9' } });
      const res = await post('/checkout', { barbershop_id: paying.barbershop.id, plan_code: 'rede', tax_id: VALID_CPF }, await loginAs(paying.owner));
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('SUBSCRIPTION_ALREADY_ACTIVE');
    });

    it('uso acima do plano escolhido → 409 PLAN_LIMIT_EXCEEDED com detalhes', async () => {
      const big = await createTenant();
      const address = await Address.create({ cep: '01001-000', number: 1, city: 'SP', state: 'SP' });
      await Branch.create({ name: 'Segunda', barbershop_id: big.barbershop.id, address_id: address.id });
      const res = await post('/checkout', { barbershop_id: big.barbershop.id, plan_code: 'essencial', tax_id: VALID_CPF }, await loginAs(big.owner));
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('PLAN_LIMIT_EXCEEDED');
      expect(res.body.details.exceeded).toEqual([{ resource: 'branches', limit: 1, used: 2 }]);
    });

    it('erro da AbacatePay → 502 sem vazar a mensagem do provedor', async () => {
      abacate.setClient(fakeApi({ ...happyRoutes, 'POST /subscriptions/create': () => [400, { data: null, success: false, error: 'Subscription is not available for this store' }] }).client);
      const res = await post('/checkout', { barbershop_id: tenant.barbershop.id, plan_code: 'essencial', tax_id: VALID_CPF });
      expect(res.status).toBe(502);
      expect(res.body.code).toBe('PAYMENT_PROVIDER_ERROR');
      expect(JSON.stringify(res.body)).not.toMatch(/not available/);
    });

    it('sem chave configurada → 503 BILLING_UNAVAILABLE', async () => {
      abacate.setClient(abacate.createClient({ apiKey: '' }));
      const res = await post('/checkout', { barbershop_id: tenant.barbershop.id, plan_code: 'essencial', tax_id: VALID_CPF });
      expect(res.status).toBe(503);
      expect(res.body.code).toBe('BILLING_UNAVAILABLE');
    });

    it('outro dono → 403; barbeiro/cliente → 403; plano inválido → 400', async () => {
      const intruder = await createTenant();
      expect((await post('/checkout', { barbershop_id: tenant.barbershop.id, plan_code: 'rede', tax_id: VALID_CPF }, await loginAs(intruder.owner))).status).toBe(403);
      expect((await post('/checkout', { barbershop_id: tenant.barbershop.id, plan_code: 'rede', tax_id: VALID_CPF }, await loginAs(tenant.barberUser))).status).toBe(403);
      expect((await post('/checkout', { barbershop_id: tenant.barbershop.id, plan_code: 'ouro', tax_id: VALID_CPF })).status).toBe(400);
      expect(api.calls).toHaveLength(0);
    });
  });

  describe('POST /change-plan', () => {
    let paying;
    let token;

    beforeAll(async () => {
      paying = await createTenant({
        subscription: { status: 'active', plan_code: 'profissional', abacatepay_subscription_id: 'subs_1', current_period_end: new Date('2026-12-20T00:00:00Z') },
      });
      token = await loginAs(paying.owner);
    });

    it('agenda a troca para o próximo ciclo', async () => {
      const res = await post('/change-plan', { barbershop_id: paying.barbershop.id, plan_code: 'rede' }, token);
      expect(res.status).toBe(200);
      expect(res.body.subscription).toMatchObject({ plan_code: 'profissional', pending_plan_code: 'rede' });
      expect(res.body.effective_at).toBe('2026-12-20T00:00:00.000Z');
      expect(api.calls[0].body).toEqual({ id: 'subs_1', items: [{ productId: 'prod_rede', quantity: 1 }] });
    });

    it('downgrade bloqueado pelo uso; mesmo plano → 409; sem assinatura paga → 409', async () => {
      const address = await Address.create({ cep: '01001-000', number: 2, city: 'SP', state: 'SP' });
      await Branch.create({ name: 'Extra', barbershop_id: paying.barbershop.id, address_id: address.id });
      const down = await post('/change-plan', { barbershop_id: paying.barbershop.id, plan_code: 'essencial' }, token);
      expect(down.status).toBe(409);
      expect(down.body.code).toBe('PLAN_LIMIT_EXCEEDED');

      await Subscription.update({ pending_plan_code: null }, { where: { barbershop_id: paying.barbershop.id } });
      const same = await post('/change-plan', { barbershop_id: paying.barbershop.id, plan_code: 'profissional' }, token);
      expect(same.body.code).toBe('SAME_PLAN');

      const trial = await post('/change-plan', { barbershop_id: tenant.barbershop.id, plan_code: 'rede' });
      expect(trial.status).toBe(409);
      expect(trial.body.code).toBe('NO_ACTIVE_SUBSCRIPTION');
    });
  });

  describe('cancelar, retomar e portal', () => {
    it('cancel marca cancel_at_period_end sem chamar a AbacatePay; resume desfaz', async () => {
      const paying = await createTenant({ subscription: { status: 'active', abacatepay_subscription_id: 'subs_2' } });
      const token = await loginAs(paying.owner);
      const res = await post('/cancel', { barbershop_id: paying.barbershop.id }, token);
      expect(res.status).toBe(200);
      expect(res.body.subscription.cancel_at_period_end).toBe(true);
      expect(api.calls).toHaveLength(0);
      const sub = await Subscription.findOne({ where: { barbershop_id: paying.barbershop.id } });
      expect(sub.cancel_requested_at).toBeTruthy();

      const resumed = await post('/resume', { barbershop_id: paying.barbershop.id }, token);
      expect(resumed.body.subscription.cancel_at_period_end).toBe(false);
    });

    it('cancelar assinatura já encerrada → 409', async () => {
      const ended = await createTenant({ subscription: { status: 'canceled' } });
      const res = await post('/cancel', { barbershop_id: ended.barbershop.id }, await loginAs(ended.owner));
      expect(res.status).toBe(409);
    });

    it('portal devolve a URL; sem checkout → 409', async () => {
      const res = await post('/portal', { barbershop_id: tenant.barbershop.id });
      expect(res.status).toBe(200);
      expect(res.body.portal_url).toBe('https://portal.abacatepay.com/x');
      expect(api.calls[0].body).toEqual({ customerId: 'cust_1', checkoutId: 'bill_1' });
      const fresh = await createTenant();
      expect((await post('/portal', { barbershop_id: fresh.barbershop.id }, await loginAs(fresh.owner))).status).toBe(409);
    });
  });

  describe('syncProducts', () => {
    it('cria produtos mensais e reaproveita o que já existe pelo externalId', async () => {
      await Plan.update({ abacatepay_product_id: null }, { where: {} });
      const fake = fakeApi({
        'POST /products/create': (body) =>
          body.externalId === 'barberos-plan-rede'
            ? [400, { data: null, success: false, error: 'Product with externalId already exists' }]
            : ok({ id: `prod_new_${body.externalId}`, price: body.price, externalId: body.externalId }),
        'GET /products/list': () => ok([{ id: 'prod_old_rede', externalId: 'barberos-plan-rede', price: 39900 }]),
      });
      const results = await billingService.syncProducts({ api: fake.client });
      expect(results.map((row) => row.product_id)).toEqual([
        'prod_new_barberos-plan-essencial',
        'prod_new_barberos-plan-profissional',
        'prod_old_rede',
      ]);
      expect(fake.calls[0].body).toEqual({
        externalId: 'barberos-plan-essencial',
        name: 'BarberOS Essencial',
        description: 'Assinatura mensal do plano Essencial',
        price: 9900,
        currency: 'BRL',
        cycle: 'MONTHLY',
      });
      expect((await Plan.findOne({ where: { code: 'rede' } })).abacatepay_product_id).toBe('prod_old_rede');
      // Segunda execução não chama a API de novo.
      const again = fakeApi({});
      await billingService.syncProducts({ api: again.client });
      expect(again.calls).toHaveLength(0);
    });
  });

  describe('cliente HTTP (unitário)', () => {
    it('GET com 5xx tenta de novo; POST com 4xx não', async () => {
      let attempts = 0;
      const flaky = fakeApi({
        'GET /subscriptions/get': () => {
          attempts += 1;
          return attempts < 3 ? [503, { error: 'unavailable' }] : ok({ id: 'subs_x', status: 'ACTIVE' });
        },
        'POST /customers/create': () => [422, { data: null, success: false, error: 'Invalid taxId' }],
      });
      await expect(flaky.client.getSubscription({ externalId: 'barbershop-1' })).resolves.toMatchObject({ id: 'subs_x' });
      expect(attempts).toBe(3);
      await expect(flaky.client.createCustomer({ email: 'a@b.com' })).rejects.toMatchObject({ name: 'AbacatePayError', status: 422 });
      expect(flaky.calls.filter((call) => call.path === '/customers/create')).toHaveLength(1);
    });

    it('timeout vira AbacatePayError', async () => {
      const hanging = abacate.createClient({
        apiKey: 'abc_dev_x',
        timeoutMs: 20,
        retryDelayMs: 1,
        fetchImpl: (url, init) =>
          new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))),
      });
      await expect(hanging.cancelSubscription('subs_1')).rejects.toMatchObject({ message: 'Timeout na AbacatePay' });
    });
  });

  it('normalizeTaxId valida CPF e CNPJ', () => {
    expect(normalizeTaxId(VALID_CPF)).toBe('11144477735');
    expect(normalizeTaxId(VALID_CNPJ)).toBe('11222333000181');
    expect(normalizeTaxId('111.111.111-11')).toBeNull();
    expect(normalizeTaxId('11.222.333/0001-82')).toBeNull();
    expect(normalizeTaxId('123')).toBeNull();
  });
});
