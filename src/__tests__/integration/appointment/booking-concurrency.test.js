// BE-14: criação à prova de concorrência, revalidação do horário, "sem preferência",
// limite de agendamentos ativos [SEC-21] e Idempotency-Key.
// O caso de 10 requisições simultâneas roda no SQLite e no job MySQL do CI (TEST_DB_DIALECT=mysql).
jest.setTimeout(120000);

const {
  app,
  request,
  resetDatabase,
  createUser,
  createTenant,
  createAppointment,
  openAllWeek,
  slotAt,
  loginAs,
  bearer,
  sequelize,
} = require('../../helpers/factories');
const { Appointment, Barber, BarberService, BarberTimeOff, IdempotencyKey } = require('../../../models');

describe('BE-14 — criação de agendamento', () => {
  let tenant;
  let client;
  let clientToken;
  let ownerToken;

  const payload = (extra = {}) => ({
    barber_id: tenant.barber.id,
    service_id: tenant.service.id,
    branch_id: tenant.branch.id,
    start_at: slotAt(3, '10:00'),
    ...extra,
  });
  const book = (token, body, headers = {}) =>
    request(app).post('/api/appointment').set(bearer(token)).set(headers).send(body);

  beforeEach(async () => {
    await resetDatabase();
    tenant = await createTenant();
    await openAllWeek(tenant.branch);
    client = await createUser({ name: 'Cliente' });
    clientToken = await loginAs(client);
    ownerToken = await loginAs(tenant.owner);
  });

  afterAll(() => sequelize.close());

  describe('concorrência', () => {
    it('10 requisições simultâneas no mesmo horário → exatamente 1 sucesso, 9 × 409 SLOT_TAKEN', async () => {
      const clients = await Promise.all(Array.from({ length: 10 }, (_, i) => createUser({ name: `C${i}` })));
      const tokens = await Promise.all(clients.map((user) => loginAs(user)));
      const responses = await Promise.all(tokens.map((token) => book(token, payload())));
      const statuses = responses.map((res) => res.status).sort();
      expect(statuses.filter((status) => status === 201)).toHaveLength(1);
      expect(statuses.filter((status) => status === 409)).toHaveLength(9);
      responses
        .filter((res) => res.status === 409)
        .forEach((res) => expect(res.body.code).toBe('SLOT_TAKEN'));
      expect(await Appointment.count({ where: { barber_id: tenant.barber.id } })).toBe(1);
    });

    it('mesmo Idempotency-Key em paralelo → 1 agendamento, mesma resposta', async () => {
      const headers = { 'Idempotency-Key': 'retry-key-0001' };
      const responses = await Promise.all(Array.from({ length: 5 }, () => book(clientToken, payload(), headers)));
      expect(responses.map((res) => res.status)).toEqual([201, 201, 201, 201, 201]);
      const ids = new Set(responses.map((res) => res.body.appointment.id));
      expect(ids.size).toBe(1);
      expect(await Appointment.count()).toBe(1);
    });
  });

  describe('revalidação do horário', () => {
    it('horário já reservado → 409 SLOT_TAKEN; sobreposição parcial também', async () => {
      expect((await book(clientToken, payload())).status).toBe(201);
      const other = await loginAs(await createUser());
      const same = await book(other, payload());
      expect(same.status).toBe(409);
      expect(same.body.code).toBe('SLOT_TAKEN');
      const partial = await book(other, payload({ start_at: slotAt(3, '09:45') }));
      expect(partial.status).toBe(409);
    });

    it('agendamento cancelado libera o horário', async () => {
      await createAppointment({ tenant, client, date: slotAt(3, '10:00'), status: 'cancelado' });
      expect((await book(clientToken, payload())).status).toBe(201);
    });

    it('bloqueio do barbeiro → 409 SLOT_TAKEN', async () => {
      await BarberTimeOff.create({ barber_id: tenant.barber.id, start_at: slotAt(3, '09:30'), end_at: slotAt(3, '11:00') });
      const res = await book(clientToken, payload());
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('SLOT_TAKEN');
    });

    it('fora do horário, fora da grade ou além do horizonte → 400 SLOT_UNAVAILABLE (cliente)', async () => {
      for (const start of [slotAt(3, '21:00'), slotAt(3, '10:05'), slotAt(40, '10:00')]) {
        const res = await book(clientToken, payload({ start_at: start }));
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('SLOT_UNAVAILABLE');
      }
    });

    it('equipe agenda em grade de 5 min, sem antecedência mínima e além de 30 dias — mas não fora do expediente', async () => {
      const asOwner = (start) => book(ownerToken, payload({ start_at: start, user_id: client.id, source: 'balcao' }));
      expect((await asOwner(slotAt(3, '10:05'))).status).toBe(201);
      expect((await asOwner(slotAt(60, '10:00'))).status).toBe(201);
      expect((await asOwner(slotAt(3, '21:00'))).body.code).toBe('SLOT_UNAVAILABLE');
    });
  });

  describe('sem preferência', () => {
    let second;

    beforeEach(async () => {
      second = await Barber.create({ user_id: (await createUser({ role: 'barbeiro' })).id, branch_id: tenant.branch.id });
      await BarberService.create({ barber_id: second.id, service_id: tenant.service.id });
    });

    it('escolhe o barbeiro livre com menos agendamentos no dia', async () => {
      await createAppointment({ tenant, client, date: slotAt(3, '15:00') });
      const res = await book(clientToken, payload({ barber_id: undefined }));
      expect(res.status).toBe(201);
      expect(res.body.appointment.barber_id).toBe(second.id);
    });

    it('empate → menor id; quando todos estão ocupados → 409', async () => {
      const first = await book(clientToken, payload({ barber_id: undefined }));
      expect(first.body.appointment.barber_id).toBe(Math.min(tenant.barber.id, second.id));
      const other = await loginAs(await createUser());
      const secondBooking = await book(other, payload({ barber_id: undefined }));
      expect(secondBooking.body.appointment.barber_id).toBe(Math.max(tenant.barber.id, second.id));
      const third = await book(await loginAs(await createUser()), payload({ barber_id: undefined }));
      expect(third.status).toBe(409);
      expect(third.body.code).toBe('SLOT_TAKEN');
    });

    it('barbeiro que não executa o serviço não é escolhido', async () => {
      await BarberService.destroy({ where: { barber_id: second.id } });
      await createAppointment({ tenant, client, date: slotAt(3, '10:00') });
      const res = await book(await loginAs(await createUser()), payload({ barber_id: undefined }));
      expect(res.status).toBe(409);
    });
  });

  describe('limite de agendamentos ativos — SEC-21', () => {
    it('4º agendamento futuro na mesma barbearia → 409 TOO_MANY_ACTIVE_APPOINTMENTS', async () => {
      for (const hour of ['10:00', '11:00', '12:00']) {
        expect((await book(clientToken, payload({ start_at: slotAt(3, hour) }))).status).toBe(201);
      }
      const res = await book(clientToken, payload({ start_at: slotAt(3, '13:00') }));
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ code: 'TOO_MANY_ACTIVE_APPOINTMENTS', details: { limit: 3 } });
    });

    it('cancelados, passados e de outra barbearia não contam; equipe não tem limite', async () => {
      await createAppointment({ tenant, client, date: slotAt(4, '10:00'), status: 'cancelado' });
      await createAppointment({ tenant, client, date: new Date(Date.now() - 86400000) });
      const other = await createTenant();
      await createAppointment({ tenant: other, client, date: slotAt(4, '10:00') });
      await createAppointment({ tenant: other, client, date: slotAt(4, '11:00') });
      await createAppointment({ tenant: other, client, date: slotAt(4, '12:00') });
      expect((await book(clientToken, payload())).status).toBe(201);

      await createAppointment({ tenant, client, date: slotAt(5, '10:00') });
      await createAppointment({ tenant, client, date: slotAt(5, '11:00') });
      const byOwner = await book(ownerToken, payload({ start_at: slotAt(6, '10:00'), user_id: client.id }));
      expect(byOwner.status).toBe(201);
    });
  });

  describe('Idempotency-Key', () => {
    const key = { 'Idempotency-Key': '6f1c2a52-6a0e-4b8e-9d55-2a7c1e2b9f10' };

    it('repetir com a mesma chave devolve o mesmo agendamento e não duplica', async () => {
      const first = await book(clientToken, payload(), key);
      const retry = await book(clientToken, payload(), key);
      expect(first.status).toBe(201);
      expect(retry.status).toBe(201);
      expect(retry.headers['idempotent-replayed']).toBe('true');
      expect(first.headers['idempotent-replayed']).toBeUndefined();
      expect(retry.body.appointment).toEqual(first.body.appointment);
      expect(await Appointment.count()).toBe(1);
    });

    it('mesma chave com outro corpo → 409 IDEMPOTENCY_KEY_REUSED', async () => {
      await book(clientToken, payload(), key);
      const res = await book(clientToken, payload({ start_at: slotAt(3, '11:00') }), key);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
    });

    it('a chave é por usuário; chave vencida (24 h) não vale mais', async () => {
      await book(clientToken, payload(), key);
      const other = await book(await loginAs(await createUser()), payload({ start_at: slotAt(3, '11:00') }), key);
      expect(other.status).toBe(201);
      expect(other.headers['idempotent-replayed']).toBeUndefined();

      await IdempotencyKey.update({ expires_at: new Date(Date.now() - 1000) }, { where: { user_id: client.id } });
      const after = await book(clientToken, payload({ start_at: slotAt(3, '12:00') }), key);
      expect(after.status).toBe(201);
      expect(after.headers['idempotent-replayed']).toBeUndefined();
      expect(await Appointment.count({ where: { user_id: client.id } })).toBe(2);
    });

    it('falha não grava a chave: corrigir e repetir funciona', async () => {
      await createAppointment({ tenant, client: await createUser(), date: slotAt(3, '10:00') });
      expect((await book(clientToken, payload(), key)).status).toBe(409);
      expect(await IdempotencyKey.count()).toBe(0);
    });

    it('chave inválida → 400', async () => {
      const res = await book(clientToken, payload(), { 'Idempotency-Key': 'curta' });
      expect(res.status).toBe(400);
    });
  });
});
