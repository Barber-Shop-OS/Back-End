// BE-31: planos públicos e assinatura da barbearia.
const { app, request, resetDatabase, createTenant, loginAs, bearer, sequelize } = require('../../helpers/factories');
const { Subscription, SubscriptionEvent } = require('../../../models');

describe('BE-31 — planos e assinatura', () => {
  let tenant;
  let ownerToken;

  beforeEach(async () => {
    await resetDatabase();
    tenant = await createTenant();
    ownerToken = await loginAs(tenant.owner);
  });

  afterAll(() => sequelize.close());

  it('GET /api/plans é público e serve os 3 preços do banco', async () => {
    const res = await request(app).get('/api/plans');
    expect(res.status).toBe(200);
    expect(res.body.items.map((p) => [p.code, p.price_cents, p.price])).toEqual([
      ['essencial', 9900, '99.00'],
      ['profissional', 19900, '199.00'],
      ['rede', 39900, '399.00'],
    ]);
    expect(res.body.items[0].limits).toEqual({ branches: 1, barbers: 3 });
  });

  it('nova barbearia nasce em trial de 14 dias com evento registrado', async () => {
    const res = await request(app).post('/api/barbershop').set(bearer(ownerToken)).send({ name: 'Segunda Casa' });
    const sub = await Subscription.findOne({ where: { barbershop_id: res.body.barbershop.id } });
    expect(sub.status).toBe('trialing');
    const days = (new Date(sub.trial_ends_at) - Date.now()) / 86400000;
    expect(days).toBeGreaterThan(13.9);
    expect(days).toBeLessThanOrEqual(14);
    expect(await SubscriptionEvent.count({ where: { subscription_id: sub.id, type: 'trial.started' } })).toBe(1);
  });

  it('GET /barbershop/:id/subscription mostra plano efetivo, limites e uso', async () => {
    const res = await request(app).get(`/api/barbershop/${tenant.barbershop.id}/subscription`).set(bearer(ownerToken));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'trialing',
      effective_plan_code: 'profissional',
      limits: { branches: 3, barbers: 10 },
      usage: { branches: 1, barbers: 1 },
    });
  });

  it('owner de outra barbearia → 403; cliente → 403; sem login → 401', async () => {
    const other = await createTenant();
    const url = `/api/barbershop/${tenant.barbershop.id}/subscription`;
    expect((await request(app).get(url).set(bearer(await loginAs(other.owner)))).status).toBe(403);
    expect((await request(app).get(url).set(bearer(await loginAs(other.barberUser)))).status).toBe(403);
    expect((await request(app).get(url)).status).toBe(401);
  });
});
