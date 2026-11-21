// SEC-20 (minimização): barbeiro vê só os clientes dos próprios atendimentos; dono vê todos.
jest.setTimeout(120000);

const { app, request, resetDatabase, createTenant, createUser, createAppointment, loginAs, bearer, sequelize } = require('../../helpers/factories');
const { Barber, BarbershopClient } = require('../../../models');

describe('SEC-20 — barbeiro só vê os próprios clientes', () => {
  let tenant;
  let mine;
  let other;
  let tokens;
  const base = () => `/api/barbershop/${tenant.barbershop.id}/clients`;

  beforeAll(async () => {
    await resetDatabase();
    tenant = await createTenant({ subscription: { status: 'active', plan_code: 'profissional' } });
    const colleagueUser = await createUser({ role: 'barbeiro' });
    const colleague = await Barber.create({ user_id: colleagueUser.id, branch_id: tenant.branch.id, bio: 'x' });
    mine = await BarbershopClient.create({ barbershop_id: tenant.barbershop.id, name: 'Meu Cliente', phone: '+5511911112222' });
    other = await BarbershopClient.create({ barbershop_id: tenant.barbershop.id, name: 'Cliente do Colega', phone: '+5511933334444' });
    const someone = await createUser();
    await createAppointment({ tenant, client: someone, client_id: mine.id, notes: 'meu' });
    await createAppointment({ tenant, client: someone, client_id: other.id, barber: colleague, notes: 'do colega' });
    await createAppointment({ tenant, client: someone, client_id: mine.id, barber: colleague, notes: 'do colega com meu cliente' });
    tokens = { barber: await loginAs(tenant.barberUser), owner: await loginAs(tenant.owner) };
  });

  afterAll(() => sequelize.close());

  it('lista do barbeiro só traz quem ele atendeu; a do dono traz todos', async () => {
    const asBarber = await request(app).get(base()).set(bearer(tokens.barber));
    expect(asBarber.status).toBe(200);
    expect(asBarber.body.items.map((c) => c.name)).toEqual(['Meu Cliente']);
    const asOwner = await request(app).get(base()).set(bearer(tokens.owner));
    expect(asOwner.body.items.map((c) => c.name).sort()).toEqual(['Cliente do Colega', 'Meu Cliente']);
  });

  it('barbeiro acha outro cliente só pelo telefone completo (para agendar no balcão)', async () => {
    const partial = await request(app).get(base()).query({ search: '3333' }).set(bearer(tokens.barber));
    expect(partial.body.items).toHaveLength(0);
    const full = await request(app).get(base()).query({ search: '(11) 93333-4444' }).set(bearer(tokens.barber));
    expect(full.body.items.map((c) => c.name)).toEqual(['Cliente do Colega']);
  });

  it('detalhe: cliente de outro barbeiro → 404; histórico só com os próprios atendimentos', async () => {
    expect((await request(app).get(`${base()}/${other.id}`).set(bearer(tokens.barber))).status).toBe(404);
    expect((await request(app).patch(`${base()}/${other.id}`).set(bearer(tokens.barber)).send({ notes: 'x' })).status).toBe(404);
    const detail = await request(app).get(`${base()}/${mine.id}`).set(bearer(tokens.barber));
    expect(detail.status).toBe(200);
    expect(detail.body.history.map((h) => h.notes)).toEqual(['meu']);
    const asOwner = await request(app).get(`${base()}/${mine.id}`).set(bearer(tokens.owner));
    expect(asOwner.body.history).toHaveLength(2);
  });
});
