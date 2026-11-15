// BE-16: fila persistida + worker; e-mails de agendamento com MAIL_DRIVER=log; lembretes 24 h/2 h
// criados na reserva e removidos/reagendados no cancelamento/reagendamento.
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
const { Job, IdempotencyKey } = require('../../../models');
const mailer = require('../../../shared/mailer');
const worker = require('../../../jobs/worker');
const queue = require('../../../jobs/queue');

const HOUR = 3600000;
const reminders = (appointmentId, status = 'pending') =>
  Job.findAll({ where: { reference: `appointment:${appointmentId}`, status }, order: [['run_at', 'ASC']] }).then((rows) =>
    rows.map((row) => queue.parsePayload(row)).filter((payload) => payload.kind.startsWith('reminder_'))
  );

describe('BE-16 — notificações por e-mail e fila de jobs', () => {
  let tenant;
  let client;
  let clientToken;
  let ownerToken;

  const book = (start = slotAt(3, '10:00')) =>
    request(app)
      .post('/api/appointment')
      .set(bearer(clientToken))
      .send({ barber_id: tenant.barber.id, service_id: tenant.service.id, branch_id: tenant.branch.id, start_at: start });

  beforeEach(async () => {
    await resetDatabase();
    mailer.clearOutbox();
    tenant = await createTenant({ name: 'Navalha & Cia' });
    await openAllWeek(tenant.branch);
    client = await createUser({ name: 'Ana Souza', email: 'ana@cliente.test' });
    clientToken = await loginAs(client);
    ownerToken = await loginAs(tenant.owner);
  });

  afterAll(() => sequelize.close());

  it('reserva enfileira confirmação imediata e lembretes 24 h e 2 h antes; worker envia a confirmação com .ics', async () => {
    const res = await book();
    const id = res.body.appointment.id;
    const start = new Date(slotAt(3, '10:00')).getTime();

    const jobs = await Job.findAll({ where: { reference: `appointment:${id}` }, order: [['run_at', 'ASC']] });
    const byKind = Object.fromEntries(jobs.map((job) => [queue.parsePayload(job).kind, job]));
    expect(Object.keys(byKind).sort()).toEqual(['confirmation', 'reminder_24h', 'reminder_2h']);
    expect(new Date(byKind.reminder_24h.run_at).getTime()).toBe(start - 24 * HOUR);
    expect(new Date(byKind.reminder_2h.run_at).getTime()).toBe(start - 2 * HOUR);

    expect(mailer.outbox()).toHaveLength(0); // nada sai antes do worker
    const stats = await worker.runOnce();
    expect(stats).toMatchObject({ processed: 1, done: 1, failed: 0 });

    const [mail] = mailer.outbox();
    expect(mail.to).toBe('ana@cliente.test');
    expect(mail.subject).toMatch(/^Agendamento confirmado: Corte em .+ às 10:00$/);
    expect(mail.text).toContain('Olá, Ana!');
    expect(mail.html).toContain('Navalha &amp; Cia');
    expect(mail.attachments[0].filename).toBe('agendamento.ics');
    expect(mail.attachments[0].content).toContain(`UID:appointment-${id}@barberos.app`);
    expect((await Job.findByPk(byKind.confirmation.id)).status).toBe('done');
  });

  it('lembretes só saem na hora certa; o de 24 h menciona "amanhã"', async () => {
    const id = (await book()).body.appointment.id;
    await worker.runOnce(); // confirmação
    mailer.clearOutbox();
    const start = new Date(slotAt(3, '10:00')).getTime();

    await worker.runOnce({ now: new Date(start - 25 * HOUR) });
    expect(mailer.outbox()).toHaveLength(0);

    await worker.runOnce({ now: new Date(start - 24 * HOUR + 60000) });
    expect(mailer.outbox()).toHaveLength(1);
    expect(mailer.outbox()[0].subject).toMatch(/^Lembrete: Corte amanhã às 10:00$/);

    await worker.runOnce({ now: new Date(start - 2 * HOUR + 60000) });
    expect(mailer.outbox()).toHaveLength(2);
    expect(await reminders(id)).toEqual([]);
  });

  it('agendar em cima da hora não cria lembretes que já passaram', async () => {
    const { scheduleReminders } = require('../../../modules/notification/appointmentNotifications');
    const appt = await createAppointment({ tenant, client, date: slotAt(3) });
    const now = new Date();
    await Job.destroy({ where: {} });

    await scheduleReminders({ id: appt.id, start_at: new Date(now.getTime() + HOUR) }, { now });
    expect(await reminders(appt.id)).toEqual([]);

    await scheduleReminders({ id: appt.id, start_at: new Date(now.getTime() + 3 * HOUR) }, { now });
    expect((await reminders(appt.id)).map((p) => p.kind)).toEqual(['reminder_2h']);
  });

  it('cancelar remove os lembretes pendentes e envia o cancelamento (.ics METHOD:CANCEL)', async () => {
    const id = (await book()).body.appointment.id;
    await worker.runOnce();
    mailer.clearOutbox();

    const res = await request(app).post(`/api/appointment/${id}/cancel`).set(bearer(clientToken)).send({ reason: 'Imprevisto' });
    expect(res.status).toBe(200);
    expect(await reminders(id)).toEqual([]);
    expect((await reminders(id, 'cancelled')).map((p) => p.kind).sort()).toEqual(['reminder_24h', 'reminder_2h']);

    await worker.runOnce();
    expect(mailer.outbox()).toHaveLength(1);
    const [mail] = mailer.outbox();
    expect(mail.subject).toMatch(/^Agendamento cancelado/);
    expect(mail.text).toContain('Motivo: Imprevisto');
    expect(mail.attachments[0].content).toContain('METHOD:CANCEL');

    // Mesmo na hora do antigo lembrete, nada sai.
    mailer.clearOutbox();
    await worker.runOnce({ now: new Date(new Date(slotAt(3, '10:00')).getTime() - HOUR) });
    expect(mailer.outbox()).toHaveLength(0);
  });

  it('reagendar troca os lembretes e envia o novo horário com o anterior', async () => {
    const id = (await book(slotAt(3, '10:00'))).body.appointment.id;
    await worker.runOnce();
    mailer.clearOutbox();

    await request(app).post(`/api/appointment/${id}/reschedule`).set(bearer(clientToken)).send({ start_at: slotAt(5, '16:00') });
    const pending = await Job.findAll({ where: { reference: `appointment:${id}`, status: 'pending' } });
    const remindersNow = pending.map((job) => ({ ...queue.parsePayload(job), run_at: new Date(job.run_at).getTime() }));
    const newStart = new Date(slotAt(5, '16:00')).getTime();
    expect(remindersNow.filter((p) => p.kind.startsWith('reminder_')).map((p) => p.run_at).sort()).toEqual(
      [newStart - 24 * HOUR, newStart - 2 * HOUR].sort()
    );

    await worker.runOnce();
    const [mail] = mailer.outbox();
    expect(mail.subject).toMatch(/^Agendamento alterado: Corte agora em .+ às 16:00$/);
    expect(mail.text).toMatch(/Antes: .+ às 10:00/);
    expect(mail.attachments[0].content).toContain('SEQUENCE:1');
  });

  it('concluir remove lembretes; lembrete de horário alterado por fora é ignorado', async () => {
    const appt = await createAppointment({ tenant, client, date: new Date(Date.now() - 10 * 60000) });
    await queue.enqueue('appointment.email', { appointment_id: appt.id, kind: 'reminder_2h', start_at: new Date(appt.start_at).toISOString() }, { reference: `appointment:${appt.id}`, runAt: new Date(Date.now() + HOUR) });
    await request(app).post(`/api/appointment/${appt.id}/complete`).set(bearer(ownerToken));
    expect(await reminders(appt.id)).toEqual([]);

    const other = await createAppointment({ tenant, client, date: slotAt(4) });
    await queue.enqueue('appointment.email', { appointment_id: other.id, kind: 'reminder_2h', start_at: '2020-01-01T00:00:00.000Z' }, { reference: `appointment:${other.id}` });
    mailer.clearOutbox();
    expect(await worker.runOnce()).toMatchObject({ done: 1, failed: 0 });
    expect(mailer.outbox()).toHaveLength(0);
  });

  it('falha no envio: retry exponencial até 5 tentativas, depois failed com last_error', async () => {
    const job = await queue.enqueue('appointment.email', { appointment_id: (await book()).body.appointment.id, kind: 'confirmation' });
    await Job.destroy({ where: { id: { [require('sequelize').Op.ne]: job.id } } });
    const spy = jest.spyOn(mailer, 'send').mockRejectedValue(new Error('SMTP fora do ar'));
    try {
      let now = new Date();
      await worker.runOnce({ now });
      let fresh = await Job.findByPk(job.id);
      expect(fresh).toMatchObject({ status: 'pending', attempts: 1, last_error: 'SMTP fora do ar' });
      // MySQL DATETIME guarda segundos (sem ms).
      expect(Math.abs(new Date(fresh.run_at).getTime() - (now.getTime() + 2 * 60000))).toBeLessThan(1000);

      for (let attempt = 2; attempt <= 5; attempt += 1) {
        now = new Date(new Date(fresh.run_at).getTime() + 1000);
        await worker.runOnce({ now });
        fresh = await Job.findByPk(job.id);
      }
      expect(fresh).toMatchObject({ status: 'failed', attempts: 5 });
      expect(spy).toHaveBeenCalledTimes(5);
      // Esgotado: não roda mais.
      await worker.runOnce({ now: new Date(now.getTime() + 24 * HOUR) });
      expect(spy).toHaveBeenCalledTimes(5);
    } finally {
      spy.mockRestore();
    }
  });

  it('tipo sem handler falha; job preso em running volta para a fila', async () => {
    const orphan = await queue.enqueue('nao.existe', {});
    await worker.runOnce();
    expect((await Job.findByPk(orphan.id)).last_error).toMatch(/Sem handler/);

    const stuck = await queue.enqueue('email.send', { template: 'welcome', to: 'x@y.test', data: { first_name: 'X', barbershop_name: 'B', trial_days: 14, dashboard_url: 'u' } });
    await stuck.update({ status: 'running', locked_at: new Date(Date.now() - 11 * 60000) });
    mailer.clearOutbox();
    await worker.runOnce();
    expect((await Job.findByPk(stuck.id)).status).toBe('done');
    expect(mailer.outbox()[0].subject).toBe('Bem-vindo ao BarberOS, X!');
  });

  it('dois workers ao mesmo tempo não processam o mesmo job (SKIP LOCKED)', async () => {
    for (let i = 0; i < 12; i += 1) {
      await queue.enqueue('email.send', { template: 'welcome', to: `w${i}@y.test`, data: { first_name: `W${i}`, barbershop_name: 'B', trial_days: 14, dashboard_url: 'u' } });
    }
    mailer.clearOutbox();
    const [a, b] = await Promise.all([worker.runOnce({ limit: 8 }), worker.runOnce({ limit: 8 })]);
    expect(a.processed + b.processed).toBe(12);
    const recipients = mailer.outbox().map((mail) => mail.to);
    expect(recipients).toHaveLength(12);
    expect(new Set(recipients).size).toBe(12);
  });

  it('manutenção do worker remove Idempotency-Keys vencidas', async () => {
    await request(app)
      .post('/api/appointment')
      .set(bearer(clientToken))
      .set('Idempotency-Key', 'purge-key-0001')
      .send({ barber_id: tenant.barber.id, service_id: tenant.service.id, branch_id: tenant.branch.id, start_at: slotAt(3) });
    expect(await IdempotencyKey.count()).toBe(1);
    await worker.runOnce({ now: new Date(Date.now() + 25 * HOUR) });
    expect(await IdempotencyKey.count()).toBe(0);
  });

  it('boas-vindas e convite usam os templates HTML', async () => {
    mailer.clearOutbox();
    await request(app)
      .post('/api/auth/register-owner')
      .send({ name: 'Carlos Lima', email: 'carlos@navalha.test', password: 'Tesoura#Navalha9', phone: '11987654321', barbershop: { name: 'Navalha Nova' } });
    const welcome = mailer.outbox().find((mail) => mail.to === 'carlos@navalha.test');
    expect(welcome.subject).toBe('Bem-vindo ao BarberOS, Carlos!');
    expect(welcome.html).toContain('Navalha Nova');

    await request(app).post(`/api/branch/${tenant.branch.id}/invitations`).set(bearer(ownerToken)).send({ email: 'novo@barbeiro.test' });
    const invite = mailer.outbox().find((mail) => mail.to === 'novo@barbeiro.test');
    expect(invite.html).toMatch(/\/convite\/[A-Za-z0-9_-]+/);
    // Token do convite nunca vai para a fila/banco.
    expect(await Job.count({ where: { type: 'email.send' } })).toBe(0);
  });
});
