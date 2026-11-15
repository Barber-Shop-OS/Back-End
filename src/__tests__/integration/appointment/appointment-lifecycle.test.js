// BE-15: cancelar, reagendar, concluir, falta; allowed_actions/can_cancel_until em toda resposta;
// histórico em appointment_events.
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
const { Appointment, AppointmentEvent, Barber, BarberService } = require('../../../models');

const inMinutes = (minutes) => new Date(Date.now() + minutes * 60000);

describe('BE-15 — ciclo de vida do agendamento', () => {
  let tenant;
  let client;
  let clientToken;
  let ownerToken;
  let barberToken;
  let strangerToken;

  const post = (token, id, action, body = {}) =>
    request(app).post(`/api/appointment/${id}/${action}`).set(bearer(token)).send(body);

  beforeEach(async () => {
    await resetDatabase();
    tenant = await createTenant();
    await openAllWeek(tenant.branch);
    client = await createUser({ name: 'Cliente' });
    clientToken = await loginAs(client);
    ownerToken = await loginAs(tenant.owner);
    barberToken = await loginAs(tenant.barberUser);
    strangerToken = await loginAs(await createUser());
  });

  afterAll(() => sequelize.close());

  describe('cancelar', () => {
    it('cliente cancela com mais de 24 h: grava quem, quando, motivo e histórico', async () => {
      const appt = await createAppointment({ tenant, client, date: slotAt(3) });
      const res = await post(clientToken, appt.id, 'cancel', { reason: '  Imprevisto  ' });
      expect(res.status).toBe(200);
      expect(res.body.appointment).toMatchObject({ status: 'cancelado', cancel_reason: 'Imprevisto', allowed_actions: [] });
      const fresh = await Appointment.findByPk(appt.id);
      expect(fresh.cancelled_by).toBe(client.id);
      expect(fresh.cancelled_at).not.toBeNull();
      const event = await AppointmentEvent.findOne({ where: { appointment_id: appt.id, type: 'cancelled' } });
      expect(event).toMatchObject({ from_status: 'confirmado', to_status: 'cancelado', actor_user_id: client.id, actor_role: 'client' });
    });

    it('cliente 23h59 antes → 409 CANCELLATION_WINDOW_CLOSED; equipe ainda cancela', async () => {
      const appt = await createAppointment({ tenant, client, date: inMinutes(23 * 60 + 59) });
      const byClient = await post(clientToken, appt.id, 'cancel');
      expect(byClient.status).toBe(409);
      expect(byClient.body.code).toBe('CANCELLATION_WINDOW_CLOSED');
      expect((await post(barberToken, appt.id, 'cancel', { reason: 'Barbeiro doente' })).status).toBe(200);
    });

    it('cancelado é final: cancelar de novo → 409 INVALID_STATUS_TRANSITION', async () => {
      const appt = await createAppointment({ tenant, client, date: slotAt(3), status: 'cancelado' });
      const res = await post(ownerToken, appt.id, 'cancel');
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('INVALID_STATUS_TRANSITION');
    });

    it('campos extras no corpo → 400; motivo > 255 → 400', async () => {
      const appt = await createAppointment({ tenant, client, date: slotAt(3) });
      expect((await post(clientToken, appt.id, 'cancel', { status: 'concluido' })).status).toBe(400);
      expect((await post(clientToken, appt.id, 'cancel', { reason: 'x'.repeat(256) })).status).toBe(400);
      expect((await Appointment.findByPk(appt.id)).status).toBe('confirmado');
    });
  });

  describe('concluir e falta', () => {
    it('equipe conclui/marca falta depois do início; antes → 409; cliente → 403', async () => {
      const future = await createAppointment({ tenant, client, date: inMinutes(60) });
      expect((await post(ownerToken, future.id, 'complete')).body.code).toBe('INVALID_STATUS_TRANSITION');

      const started = await createAppointment({ tenant, client, date: inMinutes(-30) });
      expect((await post(clientToken, started.id, 'complete')).status).toBe(403);
      expect((await post(clientToken, started.id, 'no-show')).status).toBe(403);
      const done = await post(barberToken, started.id, 'complete');
      expect(done.status).toBe(200);
      expect(done.body.appointment).toMatchObject({ status: 'concluido', allowed_actions: [] });

      const missed = await createAppointment({ tenant, client, date: inMinutes(-120) });
      const noShow = await post(ownerToken, missed.id, 'no-show');
      expect(noShow.status).toBe(200);
      expect(noShow.body.appointment.status).toBe('nao_compareceu');
      // Final: nada mais muda.
      expect((await post(ownerToken, missed.id, 'complete')).status).toBe(409);
      expect((await post(ownerToken, missed.id, 'cancel')).status).toBe(409);
    });
  });

  describe('reagendar', () => {
    it('cliente reagenda: novo intervalo, histórico com de → para e horário antigo liberado', async () => {
      const appt = await createAppointment({ tenant, client, date: slotAt(3, '10:00') });
      const res = await post(clientToken, appt.id, 'reschedule', { start_at: slotAt(4, '15:00') });
      expect(res.status).toBe(200);
      expect(res.body.appointment).toMatchObject({
        status: 'confirmado',
        start_at: slotAt(4, '15:00'),
        end_at: new Date(new Date(slotAt(4, '15:00')).getTime() + 30 * 60000).toISOString(),
      });
      const event = await AppointmentEvent.findOne({ where: { appointment_id: appt.id, type: 'rescheduled' } });
      const payload = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload;
      expect(payload).toEqual({
        from: { start_at: slotAt(3, '10:00'), barber_id: tenant.barber.id },
        to: { start_at: slotAt(4, '15:00'), barber_id: tenant.barber.id },
      });

      const day = slotAt(3, '10:00');
      const local = require('../../../shared/time').toLocalParts(day).date;
      const slots = await request(app)
        .get('/api/availability')
        .query({ branch_id: tenant.branch.id, service_id: tenant.service.id, date: local });
      expect(slots.body.map((slot) => slot.start_at)).toContain(day);
    });

    it('pode reagendar para um horário sobreposto ao próprio (ignora a si mesmo)', async () => {
      const appt = await createAppointment({ tenant, client, date: slotAt(3, '10:00') });
      const res = await post(clientToken, appt.id, 'reschedule', { start_at: slotAt(3, '10:15') });
      expect(res.status).toBe(200);
    });

    it('horário ocupado → 409 SLOT_TAKEN; fora da agenda → 400 SLOT_UNAVAILABLE; nada muda', async () => {
      const appt = await createAppointment({ tenant, client, date: slotAt(3, '10:00') });
      await createAppointment({ tenant, client: await createUser(), date: slotAt(3, '14:00') });
      const taken = await post(clientToken, appt.id, 'reschedule', { start_at: slotAt(3, '14:00') });
      expect(taken.status).toBe(409);
      expect(taken.body.code).toBe('SLOT_TAKEN');
      const closed = await post(clientToken, appt.id, 'reschedule', { start_at: slotAt(3, '22:00') });
      expect(closed.body.code).toBe('SLOT_UNAVAILABLE');
      expect(new Date((await Appointment.findByPk(appt.id)).start_at).toISOString()).toBe(slotAt(3, '10:00'));
    });

    it('trocar de barbeiro: só da mesma filial e que execute o serviço', async () => {
      const appt = await createAppointment({ tenant, client, date: slotAt(3, '10:00') });
      const colleague = await Barber.create({ user_id: (await createUser({ role: 'barbeiro' })).id, branch_id: tenant.branch.id });
      expect((await post(ownerToken, appt.id, 'reschedule', { start_at: slotAt(3, '10:00'), barber_id: colleague.id })).status).toBe(400);
      await BarberService.create({ barber_id: colleague.id, service_id: tenant.service.id });
      const ok = await post(ownerToken, appt.id, 'reschedule', { start_at: slotAt(3, '10:00'), barber_id: colleague.id });
      expect(ok.status).toBe(200);
      expect(ok.body.appointment.barber_id).toBe(colleague.id);

      const other = await createTenant();
      const res = await post(ownerToken, appt.id, 'reschedule', { start_at: slotAt(3, '11:00'), barber_id: other.barber.id });
      expect(res.status).toBe(400);
    });

    it('cliente dentro de 24 h → 409; sem start_at → 400', async () => {
      const appt = await createAppointment({ tenant, client, date: inMinutes(600) });
      expect((await post(clientToken, appt.id, 'reschedule', { start_at: slotAt(5) })).body.code).toBe('CANCELLATION_WINDOW_CLOSED');
      expect((await post(clientToken, appt.id, 'reschedule', {})).status).toBe(400);
    });
  });

  describe('autorização', () => {
    it('quem não é cliente nem equipe recebe 404 em todas as ações; dono de outro tenant também', async () => {
      const appt = await createAppointment({ tenant, client, date: slotAt(3) });
      const otherOwner = await loginAs((await createTenant()).owner);
      for (const token of [strangerToken, otherOwner]) {
        expect((await post(token, appt.id, 'cancel')).status).toBe(404);
        expect((await post(token, appt.id, 'reschedule', { start_at: slotAt(4) })).status).toBe(404);
        expect((await post(token, appt.id, 'complete')).status).toBe(404);
        expect((await post(token, appt.id, 'no-show')).status).toBe(404);
        expect((await request(app).get(`/api/appointment/${appt.id}/events`).set(bearer(token))).status).toBe(404);
      }
      expect((await post(ownerToken, 99999, 'cancel')).status).toBe(404);
    });
  });

  describe('allowed_actions e can_cancel_until em toda resposta', () => {
    it('criação, detalhe, lista e /me/appointments — calculados para quem vê', async () => {
      const created = await request(app)
        .post('/api/appointment')
        .set(bearer(clientToken))
        .send({ barber_id: tenant.barber.id, service_id: tenant.service.id, branch_id: tenant.branch.id, start_at: slotAt(3) });
      expect(created.status).toBe(201);
      const until = new Date(new Date(slotAt(3)).getTime() - 24 * 3600000).toISOString();
      expect(created.body.appointment).toMatchObject({ can_cancel_until: until, allowed_actions: ['cancel', 'reschedule'] });
      expect(created.body.appointment.Branch).not.toHaveProperty('Barbershop');

      const id = created.body.appointment.id;
      const asClient = await request(app).get(`/api/appointment/${id}`).set(bearer(clientToken));
      expect(asClient.body.allowed_actions).toEqual(['cancel', 'reschedule']);
      const asOwner = await request(app).get(`/api/appointment/${id}`).set(bearer(ownerToken));
      expect(asOwner.body.allowed_actions).toEqual(['cancel', 'reschedule']);
      expect(JSON.stringify(asOwner.body)).not.toContain('owner_id');

      const list = await request(app).get('/api/appointment').set(bearer(barberToken));
      expect(list.body.items[0]).toMatchObject({ id, can_cancel_until: until, allowed_actions: ['cancel', 'reschedule'] });

      const mine = await request(app).get('/api/me/appointments').set(bearer(clientToken));
      expect(mine.body.items[0]).toMatchObject({ id, can_cancel_until: until, allowed_actions: ['cancel', 'reschedule'] });
    });

    it('agendamento já começado: equipe vê complete/no_show; cliente não vê nada', async () => {
      const appt = await createAppointment({ tenant, client, date: inMinutes(-10) });
      const asOwner = await request(app).get(`/api/appointment/${appt.id}`).set(bearer(ownerToken));
      expect(asOwner.body.allowed_actions).toEqual(['cancel', 'reschedule', 'complete', 'no_show']);
      const asClient = await request(app).get(`/api/appointment/${appt.id}`).set(bearer(clientToken));
      expect(asClient.body.allowed_actions).toEqual([]);
    });
  });

  it('histórico: created → rescheduled → cancelled', async () => {
    const created = await request(app)
      .post('/api/appointment')
      .set(bearer(clientToken))
      .send({ barber_id: tenant.barber.id, service_id: tenant.service.id, branch_id: tenant.branch.id, start_at: slotAt(3) });
    const id = created.body.appointment.id;
    await post(clientToken, id, 'reschedule', { start_at: slotAt(4) });
    await post(ownerToken, id, 'cancel', { reason: 'Fechado' });
    const res = await request(app).get(`/api/appointment/${id}/events`).set(bearer(clientToken));
    expect(res.status).toBe(200);
    expect(res.body.map((event) => [event.type, event.from_status, event.to_status, event.actor_role])).toEqual([
      ['created', null, 'confirmado', 'client'],
      ['rescheduled', 'confirmado', 'confirmado', 'client'],
      ['cancelled', 'confirmado', 'cancelado', 'staff'],
    ]);
    expect(res.body[2].payload).toEqual({ reason: 'Fechado' });
  });
});
