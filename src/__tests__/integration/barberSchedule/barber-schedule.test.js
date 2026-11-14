// BE-11: jornada (só dono, dentro do horário da filial) e bloqueios (dono ou o próprio barbeiro).
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
const { Barber, BranchOpeningHour, BarberTimeOff } = require('../../../models');

const at = (iso) => new Date(iso).toISOString();

describe('BE-11 — jornada e bloqueios do barbeiro', () => {
  let tenant;
  let other;
  let ownerToken;
  let barberToken;

  beforeEach(async () => {
    await resetDatabase();
    tenant = await createTenant();
    other = await createTenant();
    await BranchOpeningHour.bulkCreate([
      { branch_id: tenant.branch.id, weekday: 1, opens_at: '09:00', closes_at: '19:00' },
      { branch_id: tenant.branch.id, weekday: 2, opens_at: '09:00', closes_at: '19:00' },
    ]);
    ownerToken = await loginAs(tenant.owner);
    barberToken = await loginAs(tenant.barberUser);
  });

  afterAll(() => sequelize.close());

  const hoursUrl = (barber) => `/api/barber/${barber.id}/working-hours`;
  const offUrl = (barber) => `/api/barber/${barber.id}/time-off`;

  describe('working-hours', () => {
    it('sem jornada própria, a leitura pública devolve o horário da filial', async () => {
      const res = await request(app).get(hoursUrl(tenant.barber));
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ uses_branch_hours: true, timezone: 'America/Sao_Paulo' });
      expect(res.body.working_hours).toHaveLength(2);
    });

    it('dono define a jornada dentro do horário da filial', async () => {
      const res = await request(app)
        .put(hoursUrl(tenant.barber))
        .set(bearer(ownerToken))
        .send({ working_hours: [{ weekday: 1, start_time: '10:00', end_time: '16:00' }] });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        uses_branch_hours: false,
        working_hours: [{ weekday: 1, start_time: '10:00', end_time: '16:00' }],
      });
    });

    it('jornada fora do horário da filial → 400', async () => {
      const res = await request(app)
        .put(hoursUrl(tenant.barber))
        .set(bearer(ownerToken))
        .send({ working_hours: [{ weekday: 1, start_time: '07:00', end_time: '12:00' }] });
      expect(res.status).toBe(400);
    });

    it('barbeiro não edita a própria jornada nem a de colega (403)', async () => {
      const colleagueUser = await createUser({ role: 'barbeiro' });
      const colleague = await Barber.create({ user_id: colleagueUser.id, branch_id: tenant.branch.id, bio: '' });
      const body = { working_hours: [{ weekday: 1, start_time: '10:00', end_time: '12:00' }] };
      expect((await request(app).put(hoursUrl(colleague)).set(bearer(barberToken)).send(body)).status).toBe(403);
      expect((await request(app).put(hoursUrl(tenant.barber)).set(bearer(barberToken)).send(body)).status).toBe(403);
    });

    it('owner A não edita jornada de barbeiro de B (403)', async () => {
      const res = await request(app)
        .put(hoursUrl(other.barber))
        .set(bearer(ownerToken))
        .send({ working_hours: [] });
      expect(res.status).toBe(403);
    });
  });

  describe('time-off', () => {
    const lunch = { start_at: '2030-01-07T15:00:00.000Z', end_at: '2030-01-07T16:00:00.000Z', reason: 'Almoço' };

    it('barbeiro cria, lista e remove o próprio bloqueio', async () => {
      const created = await request(app).post(offUrl(tenant.barber)).set(bearer(barberToken)).send(lunch);
      expect(created.status).toBe(201);
      expect(created.body.time_off).toMatchObject({ start_at: lunch.start_at, end_at: lunch.end_at, reason: 'Almoço' });

      const list = await request(app)
        .get(`${offUrl(tenant.barber)}?from=2030-01-07T00:00:00.000Z&to=2030-01-08T00:00:00.000Z`)
        .set(bearer(barberToken));
      expect(list.body.items).toHaveLength(1);

      const del = await request(app).delete(`${offUrl(tenant.barber)}/${created.body.time_off.id}`).set(bearer(barberToken));
      expect(del.status).toBe(204);
    });

    it('dono cria bloqueio para barbeiro do tenant', async () => {
      const res = await request(app).post(offUrl(tenant.barber)).set(bearer(ownerToken)).send(lunch);
      expect(res.status).toBe(201);
    });

    it('bloqueio sobre agendamento confirmado → 409 com a lista; cancelado não conflita', async () => {
      const client = await createUser();
      const appt = await createAppointment({ tenant, client, date: '2030-01-07T15:30:00.000Z' });
      await createAppointment({ tenant, client, date: '2030-01-07T15:00:00.000Z', status: 'cancelado' });

      const res = await request(app).post(offUrl(tenant.barber)).set(bearer(barberToken)).send(lunch);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('TIME_OFF_CONFLICT');
      expect(res.body.details.appointments).toEqual([
        { id: appt.id, start_at: at('2030-01-07T15:30:00Z'), end_at: at('2030-01-07T16:00:00Z') },
      ]);
      expect(await BarberTimeOff.count()).toBe(0);
    });

    it('agendamento que termina exatamente no início do bloqueio não conflita', async () => {
      const client = await createUser();
      await createAppointment({ tenant, client, date: '2030-01-07T14:30:00.000Z' }); // 14:30–15:00
      const res = await request(app).post(offUrl(tenant.barber)).set(bearer(barberToken)).send(lunch);
      expect(res.status).toBe(201);
    });

    it('início >= fim → 400', async () => {
      const res = await request(app)
        .post(offUrl(tenant.barber))
        .set(bearer(barberToken))
        .send({ start_at: lunch.end_at, end_at: lunch.start_at });
      expect(res.status).toBe(400);
    });

    it('barbeiro não mexe na agenda de colega; owner A não mexe na de B; cliente 403', async () => {
      const colleagueUser = await createUser({ role: 'barbeiro' });
      const colleague = await Barber.create({ user_id: colleagueUser.id, branch_id: tenant.branch.id, bio: '' });
      expect((await request(app).post(offUrl(colleague)).set(bearer(barberToken)).send(lunch)).status).toBe(403);
      expect((await request(app).get(offUrl(colleague)).set(bearer(barberToken))).status).toBe(403);
      expect((await request(app).post(offUrl(other.barber)).set(bearer(ownerToken)).send(lunch)).status).toBe(403);
      const client = await loginAs(await createUser());
      expect((await request(app).post(offUrl(tenant.barber)).set(bearer(client)).send(lunch)).status).toBe(403);
    });

    it('bloqueio de outro barbeiro pelo id → 404', async () => {
      const otherOwner = await loginAs(other.owner);
      const foreign = await request(app).post(offUrl(other.barber)).set(bearer(otherOwner)).send(lunch);
      const res = await request(app)
        .delete(`${offUrl(tenant.barber)}/${foreign.body.time_off.id}`)
        .set(bearer(barberToken));
      expect(res.status).toBe(404);
    });
  });
});
