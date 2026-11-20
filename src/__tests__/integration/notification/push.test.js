// BE-45: push (Expo) — registro do token, envio ao cliente e ao barbeiro, lembrete por push e
// remoção de token inválido (DeviceNotRegistered).
jest.setTimeout(120000);

const { app, request, resetDatabase, createTenant, createUser, loginAs, bearer, openAllWeek, slotAt, sequelize } = require('../../helpers/factories');
const { PushToken, Job } = require('../../../models');
const worker = require('../../../jobs/worker');
const push = require('../../../modules/notification/pushService');

const CLIENT_TOKEN = 'ExponentPushToken[client-aaaaaaaaaaaa]';
const BARBER_TOKEN = 'ExponentPushToken[barber-bbbbbbbbbbbb]';
const DEAD_TOKEN = 'ExponentPushToken[dead-cccccccccccccc]';

describe('BE-45 — push notifications', () => {
  let tenant;
  let client;
  let clientToken;
  let sent;

  beforeAll(async () => {
    await resetDatabase();
    tenant = await createTenant();
    await openAllWeek(tenant.branch);
    client = await createUser();
    clientToken = await loginAs(client);
  });
  beforeEach(() => {
    sent = [];
    push.setSender(async (messages) => {
      sent.push(...messages);
      return messages.map((message) => (message.to === DEAD_TOKEN ? { status: 'error', details: { error: 'DeviceNotRegistered' } } : { status: 'ok', id: 'tkt' }));
    });
  });
  afterAll(async () => {
    push.setSender(null);
    await sequelize.close();
  });

  it('registra token (válido) e recusa formato inválido; mesmo token muda de dono', async () => {
    expect((await request(app).post('/api/me/push-tokens').set(bearer(clientToken)).send({ token: CLIENT_TOKEN, platform: 'android' })).status).toBe(201);
    expect((await request(app).post('/api/me/push-tokens').set(bearer(clientToken)).send({ token: 'qualquer-coisa' })).status).toBe(400);
    const barberToken = await loginAs(tenant.barberUser);
    await request(app).post('/api/me/push-tokens').set(bearer(barberToken)).send({ token: BARBER_TOKEN, platform: 'ios' });
    expect(await PushToken.count()).toBe(2);
  });

  it('novo agendamento: push ao cliente (confirmado) e ao barbeiro (novo agendamento)', async () => {
    const res = await request(app)
      .post('/api/appointment')
      .set(bearer(clientToken))
      .send({ branch_id: tenant.branch.id, service_id: tenant.service.id, barber_id: tenant.barber.id, start_at: slotAt(3, '10:00') });
    expect(res.status).toBe(201);
    await worker.runOnce({ limit: 50 });
    const toClient = sent.find((message) => message.to === CLIENT_TOKEN);
    const toBarber = sent.find((message) => message.to === BARBER_TOKEN);
    expect(toClient).toMatchObject({ title: 'Agendamento confirmado', data: { appointment_id: res.body.appointment.id, kind: 'confirmation' } });
    expect(toClient.body).toMatch(/Corte/);
    expect(toBarber).toMatchObject({ title: 'Novo agendamento' });
  });

  it('lembrete de 2 h chega por push e e-mail', async () => {
    const res = await request(app)
      .post('/api/appointment')
      .set(bearer(clientToken))
      .send({ branch_id: tenant.branch.id, service_id: tenant.service.id, barber_id: tenant.barber.id, start_at: slotAt(4, '15:00') });
    const appointmentId = res.body.appointment.id;
    await worker.runOnce({ limit: 50 });
    sent = [];
    const reminder = (await Job.findAll({ where: { type: 'appointment.email', status: 'pending' } })).find(
      (job) => (typeof job.payload === 'string' ? JSON.parse(job.payload) : job.payload).kind === 'reminder_2h' && JSON.stringify(job.payload).includes(`"appointment_id":${appointmentId}`)
    );
    expect(reminder).toBeDefined();
    await worker.runOnce({ now: new Date(reminder.run_at.getTime() + 1000), limit: 50 });
    // No horário do lembrete de 2 h o de 24 h (já vencido) também sai.
    expect(sent.filter((message) => message.to === CLIENT_TOKEN).map((message) => message.title)).toContain('Lembrete: seu horário é daqui a pouco');
  });

  it('token inválido é removido ao receber DeviceNotRegistered', async () => {
    await request(app).post('/api/me/push-tokens').set(bearer(clientToken)).send({ token: DEAD_TOKEN });
    const result = await push.sendToUsers([client.id], { title: 't', body: 'b' });
    expect(result).toEqual({ sent: 1, removed: 1 });
    expect(await PushToken.count({ where: { expo_token: DEAD_TOKEN } })).toBe(0);
  });

  it('falha do Expo não derruba o e-mail; DELETE remove o token', async () => {
    push.setSender(async () => {
      throw new Error('Expo fora do ar');
    });
    expect(await push.sendToUsers([client.id], { title: 't', body: 'b' })).toEqual({ sent: 0, removed: 0 });
    expect((await request(app).delete('/api/me/push-tokens').set(bearer(clientToken)).send({ token: CLIENT_TOKEN })).status).toBe(204);
    expect(await PushToken.count({ where: { expo_token: CLIENT_TOKEN } })).toBe(0);
  });
});
