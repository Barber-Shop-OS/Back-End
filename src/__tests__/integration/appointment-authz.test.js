// BE-04 / SEC-02 / SEC-04: agendamento com identidade e status definidos pelo servidor; sem IDOR.
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
} = require('../helpers/factories');
const { Appointment, Service } = require('../../models');

const inDays = (days) => new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

describe('BE-04 — agendamentos', () => {
  let a;
  let b;
  let alice; // cliente
  let bob; // outro cliente
  let aliceToken;
  let bobToken;
  let ownerA;
  let ownerB;
  let barberA;
  let adminToken;

  const payloadFor = (tenant, extra = {}) => ({
    barber_id: tenant.barber.id,
    service_id: tenant.service.id,
    branch_id: tenant.branch.id,
    appointment_date: inDays(3),
    ...extra,
  });

  beforeEach(async () => {
    await resetDatabase();
    a = await createTenant({ name: 'A' });
    b = await createTenant({ name: 'B' });
    alice = await createUser({ name: 'Alice' });
    bob = await createUser({ name: 'Bob' });
    aliceToken = await loginAs(alice);
    bobToken = await loginAs(bob);
    ownerA = await loginAs(a.owner);
    ownerB = await loginAs(b.owner);
    barberA = await loginAs(a.barberUser);
    adminToken = await loginAs(await createUser({ role: 'admin' }));
  });

  afterAll(() => sequelize.close());

  describe('criação — SEC-04', () => {
    it('cliente agenda para si mesmo; user_id de outra pessoa é ignorado', async () => {
      const res = await request(app)
        .post('/api/appointment')
        .set(bearer(aliceToken))
        .send(payloadFor(a, { user_id: bob.id }));

      expect(res.status).toBe(201);
      expect(res.body.appointment.user_id).toBe(alice.id);
      expect(await Appointment.count({ where: { user_id: bob.id } })).toBe(0);
    });

    it('status do body é ignorado: agendamento nasce confirmado', async () => {
      const res = await request(app)
        .post('/api/appointment')
        .set(bearer(aliceToken))
        .send(payloadFor(a, { status: 'cancelado' }));

      expect(res.status).toBe(201);
      expect(res.body.appointment.status).toBe('confirmado');
    });

    it('resposta não expõe senha nem token_version de ninguém', async () => {
      const res = await request(app).post('/api/appointment').set(bearer(aliceToken)).send(payloadFor(a));
      const json = JSON.stringify(res.body);
      expect(json).not.toContain('password');
      expect(json).not.toContain('token_version');
      expect(res.body.appointment.client.name).toBe('Alice');
    });

    it('dono agenda para um cliente (balcão) e precisa informar user_id', async () => {
      const ok = await request(app)
        .post('/api/appointment')
        .set(bearer(ownerA))
        .send(payloadFor(a, { user_id: alice.id }));
      expect(ok.status).toBe(201);
      expect(ok.body.appointment.user_id).toBe(alice.id);

      const missing = await request(app).post('/api/appointment').set(bearer(ownerA)).send(payloadFor(a));
      expect(missing.status).toBe(400);
    });

    it('barbeiro agenda um cliente na própria agenda', async () => {
      const res = await request(app)
        .post('/api/appointment')
        .set(bearer(barberA))
        .send(payloadFor(a, { user_id: bob.id }));
      expect(res.status).toBe(201);
      expect(res.body.appointment.user_id).toBe(bob.id);
    });

    it('dono de B agendando em A é tratado como cliente (agenda para si)', async () => {
      const res = await request(app)
        .post('/api/appointment')
        .set(bearer(ownerB))
        .send(payloadFor(a, { user_id: alice.id }));
      expect(res.status).toBe(201);
      expect(res.body.appointment.user_id).toBe(b.owner.id);
    });

    it('serviço de outra barbearia → 400', async () => {
      const res = await request(app)
        .post('/api/appointment')
        .set(bearer(aliceToken))
        .send(payloadFor(a, { service_id: b.service.id }));
      expect(res.status).toBe(400);
    });

    it('data no passado ou inválida → 400', async () => {
      const past = await request(app)
        .post('/api/appointment')
        .set(bearer(aliceToken))
        .send(payloadFor(a, { appointment_date: inDays(-1) }));
      const invalid = await request(app)
        .post('/api/appointment')
        .set(bearer(aliceToken))
        .send(payloadFor(a, { appointment_date: 'amanhã' }));
      expect(past.status).toBe(400);
      expect(invalid.status).toBe(400);
    });

    it('serviço inexistente → 404', async () => {
      await Service.destroy({ where: { id: a.service.id } });
      const res = await request(app).post('/api/appointment').set(bearer(aliceToken)).send(payloadFor(a));
      expect(res.status).toBe(404);
    });
  });

  describe('leitura e alteração — SEC-02', () => {
    let aliceAppt;

    beforeEach(async () => {
      aliceAppt = await createAppointment({ tenant: a, client: alice });
    });

    it('outro cliente não lê, não altera e não exclui o agendamento (404)', async () => {
      const get = await request(app).get(`/api/appointment/${aliceAppt.id}`).set(bearer(bobToken));
      const put = await request(app)
        .put(`/api/appointment/${aliceAppt.id}`)
        .set(bearer(bobToken))
        .send({ status: 'cancelado' });
      const del = await request(app).delete(`/api/appointment/${aliceAppt.id}`).set(bearer(bobToken));

      expect(get.status).toBe(404);
      expect(put.status).toBe(404);
      expect(del.status).toBe(403);
      const fresh = await Appointment.findByPk(aliceAppt.id);
      expect(fresh.status).toBe('confirmado');
    });

    it('dono de outra barbearia não lê nem altera (404)', async () => {
      const get = await request(app).get(`/api/appointment/${aliceAppt.id}`).set(bearer(ownerB));
      const put = await request(app)
        .put(`/api/appointment/${aliceAppt.id}`)
        .set(bearer(ownerB))
        .send({ status: 'cancelado' });
      expect(get.status).toBe(404);
      expect(put.status).toBe(404);
    });

    it('cliente lê o próprio agendamento e pode cancelar', async () => {
      const get = await request(app).get(`/api/appointment/${aliceAppt.id}`).set(bearer(aliceToken));
      expect(get.status).toBe(200);

      const cancel = await request(app)
        .put(`/api/appointment/${aliceAppt.id}`)
        .set(bearer(aliceToken))
        .send({ status: 'cancelado' });
      expect(cancel.status).toBe(200);
      expect(cancel.body.appointment.status).toBe('cancelado');
    });

    it('cliente não muda status para algo diferente de cancelado (403)', async () => {
      const cancelled = await createAppointment({ tenant: a, client: alice, status: 'cancelado' });
      const res = await request(app)
        .put(`/api/appointment/${cancelled.id}`)
        .set(bearer(aliceToken))
        .send({ status: 'confirmado' });
      expect(res.status).toBe(403);
    });

    it('dono e barbeiro da barbearia alteram o status', async () => {
      const byOwner = await request(app)
        .put(`/api/appointment/${aliceAppt.id}`)
        .set(bearer(ownerA))
        .send({ status: 'pendente' });
      const byBarber = await request(app)
        .put(`/api/appointment/${aliceAppt.id}`)
        .set(bearer(barberA))
        .send({ status: 'confirmado' });
      expect(byOwner.status).toBe(200);
      expect(byBarber.status).toBe(200);
    });

    it('exclusão física só para admin', async () => {
      const byOwner = await request(app).delete(`/api/appointment/${aliceAppt.id}`).set(bearer(ownerA));
      expect(byOwner.status).toBe(403);
      const byAdmin = await request(app).delete(`/api/appointment/${aliceAppt.id}`).set(bearer(adminToken));
      expect(byAdmin.status).toBe(204);
    });
  });

  describe('listagem com escopo', () => {
    beforeEach(async () => {
      await createAppointment({ tenant: a, client: alice });
      await createAppointment({ tenant: a, client: bob });
      await createAppointment({ tenant: b, client: alice });
      await createAppointment({ tenant: b, client: bob });
    });

    const listIds = async (token, query = '') => {
      const res = await request(app).get(`/api/appointment${query}`).set(bearer(token));
      expect(res.status).toBe(200);
      return res.body.items;
    };

    it('cliente vê só os próprios agendamentos (e filtro user_id não fura o escopo)', async () => {
      const items = await listIds(aliceToken, `?user_id=${bob.id}`);
      expect(items).toHaveLength(0);
      const own = await listIds(aliceToken);
      expect(own).toHaveLength(2);
      expect(own.every((item) => item.user_id === alice.id)).toBe(true);
    });

    it('dono vê só os agendamentos das próprias filiais', async () => {
      const items = await listIds(ownerA);
      expect(items).toHaveLength(2);
      expect(items.every((item) => item.branch_id === a.branch.id)).toBe(true);

      const otherBranch = await listIds(ownerA, `?branch_id=${b.branch.id}`);
      expect(otherBranch).toHaveLength(0);
    });

    it('barbeiro vê só os próprios atendimentos', async () => {
      const items = await listIds(barberA);
      expect(items).toHaveLength(2);
      expect(items.every((item) => item.barber_id === a.barber.id)).toBe(true);
    });

    it('admin vê tudo', async () => {
      expect(await listIds(adminToken)).toHaveLength(4);
    });
  });
});
