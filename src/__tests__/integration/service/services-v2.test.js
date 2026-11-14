// BE-06: posse, dinheiro correto, ativação e soft delete de serviços.
const {
  app,
  request,
  resetDatabase,
  createUser,
  createTenant,
  createAppointment,
  loginAs,
  bearer,
  sequelize,
} = require('../../helpers/factories');
const { Service } = require('../../../models');

const base = (barbershopId, extra = {}) => ({
  name: 'Pigmentação',
  description: 'Barba pigmentada',
  price: 29.9,
  duration: 45,
  barbershop_id: barbershopId,
  ...extra,
});

describe('BE-06 — serviços', () => {
  let tenant;
  let other;
  let ownerToken;

  beforeEach(async () => {
    await resetDatabase();
    tenant = await createTenant();
    other = await createTenant();
    ownerToken = await loginAs(tenant.owner);
  });

  afterAll(() => sequelize.close());

  it('preço 29.9 persiste e retorna "29.90"', async () => {
    const res = await request(app).post('/api/services').set(bearer(ownerToken)).send(base(tenant.barbershop.id));
    expect(res.status).toBe(201);
    expect(res.body.service.price).toBe('29.90');
    const detail = await request(app).get(`/api/services/${res.body.service.id}`);
    expect(detail.body.price).toBe('29.90');
  });

  it('serviço gratuito (0) é aceito; mais de 2 casas decimais → 400', async () => {
    const free = await request(app).post('/api/services').set(bearer(ownerToken)).send(base(tenant.barbershop.id, { price: 0 }));
    expect(free.status).toBe(201);
    expect(free.body.service.price).toBe('0.00');
    const tooPrecise = await request(app)
      .post('/api/services')
      .set(bearer(ownerToken))
      .send(base(tenant.barbershop.id, { price: 29.999 }));
    expect(tooPrecise.status).toBe(400);
  });

  it.each([[3], [7], [485], [0]])('duração %s → 400 (múltiplo de 5 entre 5 e 480)', async (duration) => {
    const res = await request(app).post('/api/services').set(bearer(ownerToken)).send(base(tenant.barbershop.id, { duration }));
    expect(res.status).toBe(400);
  });

  it('listagem pública exige barbershop_id e só traz ativos', async () => {
    expect((await request(app).get('/api/services')).status).toBe(400);
    await Service.create({ ...base(tenant.barbershop.id), name: 'Inativo', active: false });
    const list = await request(app).get(`/api/services?barbershop_id=${tenant.barbershop.id}`);
    expect(list.status).toBe(200);
    expect(list.body.items.map((item) => item.name)).toEqual(['Corte']);
    expect(list.body.items.map((item) => item.id)).not.toContain(other.service.id);
  });

  it('dono vê inativos com include_inactive; anônimo e outro dono não', async () => {
    await Service.create({ ...base(tenant.barbershop.id), name: 'Inativo', active: false });
    const url = `/api/services?barbershop_id=${tenant.barbershop.id}&include_inactive=true`;
    expect((await request(app).get(url).set(bearer(ownerToken))).body.total).toBe(2);
    expect((await request(app).get(url)).body.total).toBe(1);
    const otherToken = await loginAs(other.owner);
    expect((await request(app).get(url).set(bearer(otherToken))).body.total).toBe(1);
  });

  it('desativar pelo PUT tira o serviço da listagem e bloqueia novos agendamentos', async () => {
    const res = await request(app).put(`/api/services/${tenant.service.id}`).set(bearer(ownerToken)).send({ active: false });
    expect(res.status).toBe(200);
    expect(res.body.service.active).toBe(false);

    const client = await loginAs(await createUser());
    const booking = await request(app)
      .post('/api/appointment')
      .set(bearer(client))
      .send({
        barber_id: tenant.barber.id,
        service_id: tenant.service.id,
        branch_id: tenant.branch.id,
        appointment_date: new Date(Date.now() + 86400000).toISOString(),
      });
    expect(booking.status).toBe(400);
  });

  it('excluir é soft delete e não quebra o histórico de agendamentos', async () => {
    const clientUser = await createUser();
    const appointment = await createAppointment({ tenant, client: clientUser });
    const del = await request(app).delete(`/api/services/${tenant.service.id}`).set(bearer(ownerToken));
    expect(del.status).toBe(204);

    expect(await Service.findByPk(tenant.service.id)).toBeNull();
    const raw = await Service.findByPk(tenant.service.id, { paranoid: false });
    expect(raw.deleted_at).not.toBeNull();

    const clientToken = await loginAs(clientUser);
    const history = await request(app).get(`/api/appointment/${appointment.id}`).set(bearer(clientToken));
    expect(history.status).toBe(200);
    expect(history.body.Service.name).toBe('Corte');
  });

  it('owner A não edita serviço de B (403) nem troca barbershop_id (400)', async () => {
    const put = await request(app).put(`/api/services/${other.service.id}`).set(bearer(ownerToken)).send({ price: 1 });
    expect(put.status).toBe(403);
    const move = await request(app)
      .put(`/api/services/${tenant.service.id}`)
      .set(bearer(ownerToken))
      .send({ barbershop_id: other.barbershop.id });
    expect(move.status).toBe(400);
  });

  it('listagem não expõe o owner_id da barbearia', async () => {
    const list = await request(app).get(`/api/services?barbershop_id=${tenant.barbershop.id}`);
    expect(JSON.stringify(list.body)).not.toContain('owner_id');
  });
});
