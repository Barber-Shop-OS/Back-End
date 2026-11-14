// BE-05: posse por tenant, promoção de papel, desativação com agendamentos futuros e DTO público.
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
const { Barber, User, Appointment } = require('../../../models');

describe('BE-05 — barbeiros', () => {
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

  describe('listagem e detalhe públicos', () => {
    it('não expõem e-mail, telefone nem user_id', async () => {
      await tenant.barberUser.update({ phone: '+5511999990000' });
      const list = await request(app).get(`/api/barber?branch_id=${tenant.branch.id}`);
      const detail = await request(app).get(`/api/barber/${tenant.barber.id}`);
      for (const body of [list.body, detail.body]) {
        const json = JSON.stringify(body);
        expect(json).not.toContain('@');
        expect(json).not.toContain('5511999990000');
        expect(json).not.toContain('user_id');
      }
      expect(detail.body).toMatchObject({
        id: tenant.barber.id,
        display_name: tenant.barberUser.name,
        branch_id: tenant.branch.id,
        photo_url: null,
      });
    });

    it('barbeiro inativo some da listagem e o detalhe responde 404', async () => {
      await Barber.update({ active: false }, { where: { id: tenant.barber.id } });
      const list = await request(app).get(`/api/barber?branch_id=${tenant.branch.id}`);
      expect(list.body.items).toHaveLength(0);
      expect((await request(app).get(`/api/barber/${tenant.barber.id}`)).status).toBe(404);
    });
  });

  describe('POST /api/branch/:id/barbers', () => {
    it('owner adiciona usuário existente por e-mail; cliente vira barbeiro', async () => {
      const person = await createUser({ email: 'novo.barbeiro@test.com' });
      const res = await request(app)
        .post(`/api/branch/${tenant.branch.id}/barbers`)
        .set(bearer(ownerToken))
        .send({ email: 'NOVO.barbeiro@test.com', display_name: 'Zé da Navalha', bio: 'Degradê' });
      expect(res.status).toBe(201);
      expect(res.body.barber).toMatchObject({ display_name: 'Zé da Navalha', branch_id: tenant.branch.id });
      expect((await User.findByPk(person.id)).role).toBe('barbeiro');
    });

    it('owner/admin nunca são rebaixados ao virar barbeiro', async () => {
      const res = await request(app)
        .post(`/api/branch/${tenant.branch.id}/barbers`)
        .set(bearer(ownerToken))
        .send({ user_id: tenant.owner.id });
      expect(res.status).toBe(201);
      expect((await User.findByPk(tenant.owner.id)).role).toBe('owner');
    });

    it('owner A não adiciona barbeiro na filial de B → 403', async () => {
      const person = await createUser();
      const res = await request(app)
        .post(`/api/branch/${other.branch.id}/barbers`)
        .set(bearer(ownerToken))
        .send({ user_id: person.id });
      expect(res.status).toBe(403);
      expect(await Barber.count({ where: { user_id: person.id } })).toBe(0);
    });

    it('mesmo usuário duas vezes na filial → 409 BARBER_ALREADY_EXISTS', async () => {
      const res = await request(app)
        .post(`/api/branch/${tenant.branch.id}/barbers`)
        .set(bearer(ownerToken))
        .send({ user_id: tenant.barberUser.id });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('BARBER_ALREADY_EXISTS');
    });

    it('reativa vínculo desativado em vez de duplicar', async () => {
      await Barber.update({ active: false }, { where: { id: tenant.barber.id } });
      const res = await request(app)
        .post(`/api/branch/${tenant.branch.id}/barbers`)
        .set(bearer(ownerToken))
        .send({ user_id: tenant.barberUser.id });
      expect(res.status).toBe(201);
      expect(res.body.barber.id).toBe(tenant.barber.id);
      expect(await Barber.count({ where: { user_id: tenant.barberUser.id } })).toBe(1);
    });

    it('user_id e email juntos ou nenhum → 400; e-mail desconhecido → 404 USER_NOT_FOUND', async () => {
      const url = `/api/branch/${tenant.branch.id}/barbers`;
      expect((await request(app).post(url).set(bearer(ownerToken)).send({})).status).toBe(400);
      expect(
        (await request(app).post(url).set(bearer(ownerToken)).send({ user_id: 1, email: 'a@b.com' })).status
      ).toBe(400);
      const unknown = await request(app).post(url).set(bearer(ownerToken)).send({ email: 'ninguem@test.com' });
      expect(unknown.status).toBe(404);
      expect(unknown.body.code).toBe('USER_NOT_FOUND');
    });

    it('sem login → 401; cliente → 403', async () => {
      const url = `/api/branch/${tenant.branch.id}/barbers`;
      expect((await request(app).post(url).send({ user_id: 1 })).status).toBe(401);
      const client = await loginAs(await createUser());
      expect((await request(app).post(url).set(bearer(client)).send({ user_id: 1 })).status).toBe(403);
    });
  });

  describe('POST /api/barber (legado)', () => {
    it('owner A não cria barbeiro na filial de B', async () => {
      const person = await createUser();
      const res = await request(app)
        .post('/api/barber')
        .set(bearer(ownerToken))
        .send({ user_id: person.id, branch_id: other.branch.id, bio: 'x' });
      expect(res.status).toBe(403);
    });
  });

  describe('DELETE /api/barber/:id', () => {
    it('com agendamentos futuros → 409 com a lista; nada muda', async () => {
      const client = await createUser();
      const appt = await createAppointment({ tenant, client });
      const res = await request(app).delete(`/api/barber/${tenant.barber.id}`).set(bearer(ownerToken));
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('BARBER_HAS_FUTURE_APPOINTMENTS');
      expect(res.body.details.appointment_ids).toEqual([appt.id]);
      expect((await Barber.findByPk(tenant.barber.id)).active).toBe(true);
    });

    it('?force=cancel cancela os futuros, preserva os passados e desativa', async () => {
      const client = await createUser();
      const future = await createAppointment({ tenant, client });
      const past = await createAppointment({ tenant, client, date: new Date(Date.now() - 86400000) });
      const res = await request(app).delete(`/api/barber/${tenant.barber.id}?force=cancel`).set(bearer(ownerToken));
      expect(res.status).toBe(204);
      expect((await Appointment.findByPk(future.id)).status).toBe('cancelado');
      expect((await Appointment.findByPk(past.id)).status).toBe('confirmado');
      expect((await Barber.findByPk(tenant.barber.id)).active).toBe(false);
    });

    it('force com valor inválido → 400', async () => {
      const res = await request(app).delete(`/api/barber/${tenant.barber.id}?force=all`).set(bearer(ownerToken));
      expect(res.status).toBe(400);
    });

    it('owner A não remove barbeiro de B → 403', async () => {
      const res = await request(app).delete(`/api/barber/${other.barber.id}`).set(bearer(ownerToken));
      expect(res.status).toBe(403);
    });
  });

  describe('PUT /api/barber/:id', () => {
    it('não transfere para filial onde o usuário já atua → 409', async () => {
      const { Branch } = require('../../../models');
      const second = await Branch.create({ name: 'F2', barbershop_id: tenant.barbershop.id, address_id: tenant.address.id });
      await Barber.create({ user_id: tenant.barberUser.id, branch_id: second.id, bio: '' });
      const res = await request(app)
        .put(`/api/barber/${tenant.barber.id}`)
        .set(bearer(ownerToken))
        .send({ branch_id: second.id });
      expect(res.status).toBe(409);
    });

    it('photo_url precisa ser https', async () => {
      const res = await request(app)
        .put(`/api/barber/${tenant.barber.id}`)
        .set(bearer(ownerToken))
        .send({ photo_url: 'javascript:alert(1)' });
      expect(res.status).toBe(400);
    });
  });
});
