// BE-41: API administrativa — barbearias, suspensão, trial, usuários e métricas.
jest.setTimeout(120000);

const { app, request, resetDatabase, createTenant, createUser, loginAs, bearer, sequelize } = require('../../helpers/factories');
const { Subscription, AuditLog } = require('../../../models');

describe('BE-41 — API administrativa', () => {
  let admin;
  let active;
  let trial;
  let expired;

  beforeAll(async () => {
    await resetDatabase();
    admin = await loginAs(await createUser({ role: 'admin' }));
    active = await createTenant({ name: 'Ativa Rede', subscription: { status: 'active', plan_code: 'rede' } });
    await createTenant({ name: 'Ativa Pro', subscription: { status: 'active', plan_code: 'profissional' } });
    await createTenant({ name: 'Atrasada', subscription: { status: 'past_due', plan_code: 'essencial' } });
    trial = await createTenant({ name: 'Em Trial' });
    expired = await createTenant({ name: 'Expirada', subscription: { status: 'expired' } });
  });
  afterAll(() => sequelize.close());

  const get = (path, token = admin) => request(app).get(`/api/admin${path}`).set(bearer(token));
  const post = (path, body = {}, token = admin) => request(app).post(`/api/admin${path}`).set(bearer(token)).send(body);

  it('owner recebe 403 em todo /api/admin/*', async () => {
    const owner = await loginAs(active.owner);
    expect((await get('/barbershops', owner)).status).toBe(403);
    expect((await get('/metrics', owner)).status).toBe(403);
    expect((await post(`/barbershops/${active.barbershop.id}/suspend`, {}, owner)).status).toBe(403);
  });

  it('lista e busca barbearias com status da assinatura', async () => {
    const all = await get('/barbershops');
    expect(all.status).toBe(200);
    expect(all.body.total).toBe(5);
    const search = await get('/barbershops?q=Ativa');
    expect(search.body.items.map((item) => item.name).sort()).toEqual(['Ativa Pro', 'Ativa Rede']);
    const pastDue = await get('/barbershops?subscription_status=past_due');
    expect(pastDue.body.items).toHaveLength(1);
    expect(pastDue.body.items[0].subscription).toMatchObject({ status: 'past_due', access: 'grace' });
    expect(all.body.items[0].owner.email).toBeTruthy();
  });

  it('detalhe com uso e eventos', async () => {
    const res = await get(`/barbershops/${active.barbershop.id}`);
    expect(res.status).toBe(200);
    expect(res.body.usage).toEqual({ branches: 1, barbers: 1 });
    expect(res.body.subscription.plan_code).toBe('rede');
  });

  it('suspender tira a página do ar; reativar devolve; ambos auditados', async () => {
    const shop = await active.barbershop.reload();
    expect((await post(`/barbershops/${shop.id}/suspend`, { reason: 'Fraude' })).body.status).toBe('suspended');
    expect((await request(app).get(`/api/barbershop/slug/${shop.slug}`)).status).toBe(404);
    expect((await post(`/barbershops/${shop.id}/reactivate`)).body.status).toBe('active');
    expect((await request(app).get(`/api/barbershop/slug/${shop.slug}`)).status).toBe(200);
    expect(await AuditLog.count({ where: { entity: 'barbershop', entity_id: String(shop.id) } })).toBe(2);
  });

  it('estende trial (inclusive expirado); assinatura paga → 400', async () => {
    const res = await post(`/barbershops/${expired.barbershop.id}/extend-trial`, { days: 7 });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('trialing');
    const sub = await Subscription.findOne({ where: { barbershop_id: expired.barbershop.id } });
    expect(new Date(sub.trial_ends_at).getTime()).toBeGreaterThan(Date.now() + 6 * 86400000);
    const before = new Date((await Subscription.findOne({ where: { barbershop_id: trial.barbershop.id } })).trial_ends_at).getTime();
    await post(`/barbershops/${trial.barbershop.id}/extend-trial`, { days: 3 });
    const after = new Date((await Subscription.findOne({ where: { barbershop_id: trial.barbershop.id } })).trial_ends_at).getTime();
    expect(after - before).toBe(3 * 86400000);
    expect((await post(`/barbershops/${active.barbershop.id}/extend-trial`, { days: 3 })).status).toBe(400);
    expect((await post(`/barbershops/${trial.barbershop.id}/extend-trial`, { days: 500 })).status).toBe(400);
  });

  it('usuários: busca e filtro por papel, sem senha', async () => {
    const res = await get('/users?role=owner');
    expect(res.status).toBe(200);
    expect(res.body.items.every((user) => user.role === 'owner')).toBe(true);
    expect(res.body.items[0].password).toBeUndefined();
  });

  it('métricas: MRR, pagantes por plano, trials', async () => {
    const res = await get('/metrics');
    expect(res.status).toBe(200);
    // rede 399 + profissional 199 + essencial (em atraso) 99
    expect(res.body.mrr).toBe('697.00');
    expect(res.body.paying).toBe(3);
    expect(res.body.paying_by_plan).toEqual({ rede: 1, profissional: 1, essencial: 1 });
    expect(res.body.trials).toBeGreaterThanOrEqual(1);
    expect(res.body.new_barbershops_30d).toBe(5);
  });
});
