// BE-51: central de notificações in-app — gravada pelo job do agendamento (criado/cancelado/
// remarcado) para cliente, barbeiro e equipe da filial, sem avisar o autor da ação.
jest.setTimeout(120000);

const { app, request, resetDatabase, createTenant, createUser, loginAs, bearer, openAllWeek, slotAt, sequelize } = require('../../helpers/factories');
const { Address, Branch, BarbershopMember, UserNotification, Job } = require('../../../models');
const worker = require('../../../jobs/worker');
const mailer = require('../../../shared/mailer');
const center = require('../../../modules/notification/notificationCenter');
const appointmentNotifications = require('../../../modules/notification/appointmentNotifications');

const typesOf = async (userId) => (await UserNotification.findAll({ where: { user_id: userId }, order: [['id', 'ASC']] })).map((row) => row.type);

describe('BE-51 — central de notificações', () => {
  let tenant;
  let client;
  let clientToken;
  let reception;
  let receptionToken;
  let otherReception;
  let manager;
  let appointmentId;

  beforeAll(async () => {
    await resetDatabase();
    tenant = await createTenant();
    await openAllWeek(tenant.branch);
    const address = await Address.create({ cep: '01001-000', number: 2, city: 'SP', state: 'SP' });
    const branchY = await Branch.create({ name: 'Filial Y', barbershop_id: tenant.barbershop.id, address_id: address.id });
    client = await createUser({ name: 'Ana Cliente' });
    clientToken = await loginAs(client);
    reception = await createUser({ email: 'rec@x.com' });
    otherReception = await createUser({ email: 'rec-y@x.com' });
    manager = await createUser({ email: 'ger@x.com' });
    await BarbershopMember.bulkCreate([
      { barbershop_id: tenant.barbershop.id, user_id: reception.id, role: 'receptionist', branch_ids: [tenant.branch.id] },
      { barbershop_id: tenant.barbershop.id, user_id: otherReception.id, role: 'receptionist', branch_ids: [branchY.id] },
      { barbershop_id: tenant.barbershop.id, user_id: manager.id, role: 'manager', branch_ids: null },
    ]);
    receptionToken = await loginAs(reception);
  });
  afterAll(() => sequelize.close());

  it('agendamento criado pelo cliente: equipe e barbeiro recebem; o cliente (autor) não', async () => {
    const res = await request(app)
      .post('/api/appointment')
      .set(bearer(clientToken))
      .send({ branch_id: tenant.branch.id, service_id: tenant.service.id, barber_id: tenant.barber.id, start_at: slotAt(3, '10:00') });
    expect(res.status).toBe(201);
    appointmentId = res.body.appointment.id;
    await worker.runOnce({ limit: 50 });

    expect(await typesOf(client.id)).toEqual([]);
    for (const user of [tenant.barberUser, tenant.owner, reception, manager]) {
      expect(await typesOf(user.id)).toEqual(['appointment.created']);
    }
    expect(await typesOf(otherReception.id)).toEqual([]);
    const toOwner = await UserNotification.findOne({ where: { user_id: tenant.owner.id } });
    expect(toOwner.title).toBe('Novo agendamento');
    expect(toOwner.body).toMatch(/^Ana Cliente — Corte · .+ às 10:00$/);
    expect(toOwner.data).toMatchObject({ appointment_id: appointmentId, branch_id: tenant.branch.id, barbershop_id: tenant.barbershop.id });
  });

  it('remarcado pelo cliente e cancelado pela recepção: cada um avisa os demais', async () => {
    await request(app).post(`/api/appointment/${appointmentId}/reschedule`).set(bearer(clientToken)).send({ start_at: slotAt(4, '11:00') }).expect(200);
    await request(app).post(`/api/appointment/${appointmentId}/cancel`).set(bearer(receptionToken)).send({ reason: 'Barbeiro doente' }).expect(200);
    await worker.runOnce({ limit: 50 });

    expect(await typesOf(client.id)).toEqual(['appointment.cancelled']);
    expect(await typesOf(reception.id)).toEqual(['appointment.created', 'appointment.rescheduled']);
    expect(await typesOf(tenant.owner.id)).toEqual(['appointment.created', 'appointment.rescheduled', 'appointment.cancelled']);
    expect(await typesOf(tenant.barberUser.id)).toEqual(['appointment.created', 'appointment.rescheduled', 'appointment.cancelled']);
    const toClient = await UserNotification.findOne({ where: { user_id: client.id } });
    expect(toClient.title).toBe('Agendamento cancelado');
  });

  it('GET paginado com unread_count; filtro unread; marcar lida e todas', async () => {
    const ownerToken = await loginAs(tenant.owner);
    const page = await request(app).get('/api/me/notifications').set(bearer(ownerToken)).query({ pageSize: 2 });
    expect(page.status).toBe(200);
    expect(page.body).toMatchObject({ page: 1, pageSize: 2, total: 3, totalPages: 2, unread_count: 3 });
    expect(page.body.items[0]).toMatchObject({ type: 'appointment.cancelled', read: false, read_at: null, link: null });
    expect(Object.keys(page.body.items[0]).sort()).toEqual(['body', 'created_at', 'data', 'id', 'link', 'read', 'read_at', 'title', 'type']);

    const firstId = page.body.items[0].id;
    const read = await request(app).patch(`/api/me/notifications/${firstId}/read`).set(bearer(ownerToken));
    expect(read.status).toBe(200);
    expect(read.body).toMatchObject({ notification: { id: firstId, read: true }, unread_count: 2 });
    expect((await request(app).patch(`/api/me/notifications/${firstId}/read`).set(bearer(ownerToken))).body.unread_count).toBe(2);

    const unread = await request(app).get('/api/me/notifications').set(bearer(ownerToken)).query({ unread: true });
    expect(unread.body.total).toBe(2);
    expect(unread.body.items.every((item) => !item.read)).toBe(true);

    const all = await request(app).post('/api/me/notifications/read-all').set(bearer(ownerToken));
    expect(all.body).toEqual({ updated: 2, unread_count: 0 });
    expect((await request(app).get('/api/me/notifications').set(bearer(ownerToken))).body.unread_count).toBe(0);
  });

  it('só o dono da notificação acessa (404 para os demais); 400 e 401', async () => {
    const someone = await UserNotification.findOne({ where: { user_id: tenant.barberUser.id } });
    expect((await request(app).patch(`/api/me/notifications/${someone.id}/read`).set(bearer(clientToken))).status).toBe(404);
    expect((await UserNotification.findByPk(someone.id)).read_at).toBeNull();
    expect((await request(app).patch('/api/me/notifications/abc/read').set(bearer(clientToken))).status).toBe(400);
    expect((await request(app).get('/api/me/notifications')).status).toBe(401);
    const mine = await request(app).get('/api/me/notifications').set(bearer(clientToken));
    expect(mine.body.items.every((item) => item.type === 'appointment.cancelled')).toBe(true);
    expect(mine.body.total).toBe(1);
  });

  it('reprocessar o mesmo job não duplica; falha na gravação não derruba o e-mail', async () => {
    const job = await Job.findOne({ where: { type: appointmentNotifications.JOB_TYPE }, order: [['id', 'ASC']] });
    const payload = typeof job.payload === 'string' ? JSON.parse(job.payload) : job.payload;
    const before = await UserNotification.count();
    await appointmentNotifications.handle(payload, new Date(), job);
    expect(await UserNotification.count()).toBe(before);

    mailer.clearOutbox();
    const spy = jest.spyOn(UserNotification, 'create').mockRejectedValue(new Error('banco fora'));
    try {
      const res = await request(app)
        .post('/api/appointment')
        .set(bearer(clientToken))
        .send({ branch_id: tenant.branch.id, service_id: tenant.service.id, barber_id: tenant.barber.id, start_at: slotAt(5, '10:00') });
      expect(res.status).toBe(201);
      const stats = await worker.runOnce({ limit: 50 });
      expect(stats.failed).toBe(0);
      expect(mailer.outbox().length).toBeGreaterThan(0);
    } finally {
      spy.mockRestore();
    }
    expect(await UserNotification.count()).toBe(before);
  });

  it('notifyUsers ignora nulos e repetidos', async () => {
    const created = await center.notifyUsers([client.id, client.id, null], { type: 'appointment.created', title: 'x', body: 'y' });
    expect(created).toHaveLength(1);
  });
});
