// BE-19: serviços executados por barbeiro.
const {
  app,
  request,
  resetDatabase,
  createUser,
  createTenant,
  loginAs,
  bearer,
  sequelize,
} = require('../../helpers/factories');
const { Service, BarberService } = require('../../../models');

describe('BE-19 — serviços por barbeiro', () => {
  let tenant;
  let other;
  let ownerToken;
  let barba;

  beforeEach(async () => {
    await resetDatabase();
    tenant = await createTenant();
    other = await createTenant();
    ownerToken = await loginAs(tenant.owner);
    barba = await Service.create({ name: 'Barba', description: 'x', price: 30, duration: 20, barbershop_id: tenant.barbershop.id });
  });

  afterAll(() => sequelize.close());

  const put = (barber, service_ids, token = ownerToken) =>
    request(app).put(`/api/barber/${barber.id}/services`).set(bearer(token)).send({ service_ids });

  it('dono define os serviços; DTO público lista só id e nome', async () => {
    const res = await put(tenant.barber, [barba.id]);
    expect(res.status).toBe(200);
    expect(res.body.barber.services).toEqual([{ id: barba.id, name: 'Barba' }]);
    const pub = await request(app).get(`/api/barber/${tenant.barber.id}`);
    expect(pub.body.services).toEqual([{ id: barba.id, name: 'Barba' }]);
  });

  it('serviço de outra barbearia ou inexistente → 400 e nada muda', async () => {
    expect((await put(tenant.barber, [other.service.id])).status).toBe(400);
    expect((await put(tenant.barber, [999999])).status).toBe(400);
    expect(await BarberService.count({ where: { barber_id: tenant.barber.id } })).toBe(1);
  });

  it('owner A não altera serviços de barbeiro de B (403); barbeiro também não (403)', async () => {
    expect((await put(other.barber, [])).status).toBe(403);
    expect((await put(tenant.barber, [], await loginAs(tenant.barberUser))).status).toBe(403);
  });

  it('GET /api/barber?branch_id&service_id filtra', async () => {
    await put(tenant.barber, [barba.id]);
    const withCorte = await request(app).get(`/api/barber?branch_id=${tenant.branch.id}&service_id=${tenant.service.id}`);
    const withBarba = await request(app).get(`/api/barber?branch_id=${tenant.branch.id}&service_id=${barba.id}`);
    expect(withCorte.body.total).toBe(0);
    expect(withBarba.body.items.map((item) => item.id)).toEqual([tenant.barber.id]);
  });

  it('barbeiro novo executa todos os serviços ativos; serviço novo vai para todos os barbeiros', async () => {
    await Service.create({ name: 'Inativo', description: 'x', price: 1, duration: 10, barbershop_id: tenant.barbershop.id, active: false });
    const person = await createUser();
    const created = await request(app)
      .post(`/api/branch/${tenant.branch.id}/barbers`)
      .set(bearer(ownerToken))
      .send({ user_id: person.id });
    expect(created.body.barber.services.map((s) => s.name).sort()).toEqual(['Barba', 'Corte']);

    const svc = await request(app)
      .post('/api/services')
      .set(bearer(ownerToken))
      .send({ name: 'Sobrancelha', description: 'x', price: 15, duration: 10, barbershop_id: tenant.barbershop.id });
    expect(await BarberService.count({ where: { service_id: svc.body.service.id } })).toBe(2);
  });

  it('agendar serviço que o barbeiro não executa → 400', async () => {
    const client = await loginAs(await createUser());
    const res = await request(app)
      .post('/api/appointment')
      .set(bearer(client))
      .send({
        barber_id: tenant.barber.id,
        service_id: barba.id,
        branch_id: tenant.branch.id,
        start_at: new Date(Date.now() + 86400000).toISOString(),
      });
    expect(res.status).toBe(400);
  });
});
