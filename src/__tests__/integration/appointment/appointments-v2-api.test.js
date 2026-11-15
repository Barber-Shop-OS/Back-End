// BE-12: a API cria e devolve agendamentos com intervalo UTC, snapshots e status completos.
const {
  app,
  request,
  resetDatabase,
  createUser,
  createTenant,
  openAllWeek,
  slotAt,
  loginAs,
  bearer,
  sequelize,
} = require('../../helpers/factories');
const { Appointment, Service } = require('../../../models');

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

describe('BE-12 — agendamento v2 na API', () => {
  let tenant;
  let client;
  let clientToken;
  const start = slotAt(5, '10:00');

  beforeEach(async () => {
    await resetDatabase();
    tenant = await createTenant();
    await openAllWeek(tenant.branch);
    client = await createUser();
    clientToken = await loginAs(client);
  });

  afterAll(() => sequelize.close());

  const book = (extra = {}) =>
    request(app)
      .post('/api/appointment')
      .set(bearer(clientToken))
      .send({
        barber_id: tenant.barber.id,
        service_id: tenant.service.id,
        branch_id: tenant.branch.id,
        start_at: start,
        ...extra,
      });

  it('end_at = start_at + duração; snapshots do serviço; datas ISO UTC', async () => {
    const res = await book({ notes: '  Prefere máquina 2  ', source: 'mobile' });
    expect(res.status).toBe(201);
    const appt = res.body.appointment;
    expect(appt.start_at).toBe(start);
    expect(appt.end_at).toBe(new Date(new Date(start).getTime() + 30 * 60000).toISOString());
    expect(appt.start_at).toMatch(ISO_UTC);
    expect(appt).toMatchObject({
      duration_min: 30,
      price_snapshot: '50.00',
      service_name_snapshot: 'Corte',
      notes: 'Prefere máquina 2',
      source: 'mobile',
      status: 'confirmado',
    });
    expect(appt).not.toHaveProperty('appointment_date');
  });

  it('mudar o preço do serviço não altera o snapshot do agendamento', async () => {
    const res = await book();
    await Service.update({ price: 99 }, { where: { id: tenant.service.id } });
    const detail = await request(app).get(`/api/appointment/${res.body.appointment.id}`).set(bearer(clientToken));
    expect(detail.body.price_snapshot).toBe('50.00');
  });

  it('appointment_date ainda é aceito como alias de start_at', async () => {
    const res = await book({ start_at: undefined, appointment_date: start });
    expect(res.status).toBe(201);
    expect(res.body.appointment.start_at).toBe(start);
  });

  it('sem start_at → 400; notes > 500 → 400; source inválido → 400', async () => {
    expect((await book({ start_at: undefined })).status).toBe(400);
    expect((await book({ notes: 'x'.repeat(501) })).status).toBe(400);
    expect((await book({ source: 'fax' })).status).toBe(400);
  });

  it('cancelar registra cancelled_at e cancelled_by', async () => {
    const res = await book();
    const id = res.body.appointment.id;
    const cancel = await request(app).put(`/api/appointment/${id}`).set(bearer(clientToken)).send({ status: 'cancelado' });
    expect(cancel.status).toBe(200);
    const fresh = await Appointment.findByPk(id);
    expect(fresh.cancelled_by).toBe(client.id);
    expect(fresh.cancelled_at).not.toBeNull();
  });

  it('status antigo "pendente" não existe mais → 400', async () => {
    const res = await book();
    const ownerToken = await loginAs(tenant.owner);
    const put = await request(app)
      .put(`/api/appointment/${res.body.appointment.id}`)
      .set(bearer(ownerToken))
      .send({ status: 'pendente' });
    expect(put.status).toBe(400);
  });

  it('filtro from/to usa start_at', async () => {
    await book();
    const inRange = await request(app)
      .get(`/api/appointment?from=${new Date(new Date(start).getTime() - 3600000).toISOString()}&to=${new Date(new Date(start).getTime() + 3600000).toISOString()}`)
      .set(bearer(clientToken));
    const outOfRange = await request(app)
      .get(`/api/appointment?from=${new Date(new Date(start).getTime() + 86400000).toISOString()}`)
      .set(bearer(clientToken));
    expect(inRange.body.total).toBe(1);
    expect(outOfRange.body.total).toBe(0);
  });
});
