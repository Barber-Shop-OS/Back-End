// BE-36: soft delete (histórico preservado) e trilha de auditoria das ações sensíveis.
jest.setTimeout(120000);

const { app, request, resetDatabase, createTenant, createUser, createAppointment, loginAs, bearer, sequelize } = require('../../helpers/factories');
const { AuditLog, Appointment, Branch, User, Service } = require('../../../models');

describe('BE-36 — auditoria e soft delete', () => {
  let tenant;
  let ownerToken;
  let adminToken;
  let other;

  beforeAll(async () => {
    await resetDatabase();
    tenant = await createTenant();
    other = await createTenant();
    ownerToken = await loginAs(tenant.owner);
    adminToken = await loginAs(await createUser({ role: 'admin' }));
  });
  afterAll(() => sequelize.close());

  it('excluir serviço não quebra o histórico do agendamento', async () => {
    const appointment = await createAppointment({ tenant, client: await createUser() });
    expect([200, 204]).toContain((await request(app).delete(`/api/services/${tenant.service.id}`).set(bearer(ownerToken))).status);
    const res = await request(app).get(`/api/appointment/${appointment.id}`).set(bearer(ownerToken));
    expect(res.status).toBe(200);
    expect(res.body.service_name_snapshot).toBe('Corte');
    expect(await Service.findByPk(tenant.service.id)).toBeNull();
    expect(await Service.findByPk(tenant.service.id, { paranoid: false })).not.toBeNull();
  });

  it('excluir filial é soft delete: agendamentos e pagamentos continuam', async () => {
    const t = await createTenant();
    const token = await loginAs(t.owner);
    const appointment = await createAppointment({ tenant: t, client: await createUser() });
    const res = await request(app).delete(`/api/branch/${t.branch.id}`).set(bearer(token));
    expect([200, 204]).toContain(res.status);
    expect(await Branch.findByPk(t.branch.id)).toBeNull();
    expect(await Branch.findByPk(t.branch.id, { paranoid: false })).not.toBeNull();
    expect(await Appointment.findByPk(appointment.id)).not.toBeNull();
    const view = await request(app).get(`/api/appointment/${appointment.id}`).set(bearer(token));
    expect(view.status).toBe(200);
    expect(view.body.Branch).toMatchObject({ id: t.branch.id });
  });

  it('usuário excluído (admin) não consegue logar e some das listagens, mas o registro fica', async () => {
    const victim = await createUser({ email: 'excluido@teste.com' });
    expect([200, 204]).toContain((await request(app).delete(`/api/user/${victim.id}`).set(bearer(adminToken))).status);
    expect((await request(app).post('/api/auth/login').send({ email: 'excluido@teste.com', password: 'Tesoura#Navalha9' })).status).toBe(401);
    expect(await User.findByPk(victim.id)).toBeNull();
    expect(await User.findByPk(victim.id, { paranoid: false })).not.toBeNull();
  });

  it('registra alteração de preço com antes/depois, ator, IP e request_id', async () => {
    const t = await createTenant();
    const token = await loginAs(t.owner);
    await request(app).put(`/api/services/${t.service.id}`).set(bearer(token)).set('X-Request-Id', 'req-audit-0001').send({ price: 65 });
    const log = await AuditLog.findOne({ where: { action: 'service.updated', entity_id: String(t.service.id) } });
    expect(log).toMatchObject({ actor_id: t.owner.id, actor_role: 'owner', barbershop_id: t.barbershop.id, request_id: 'req-audit-0001' });
    expect(log.before).toEqual({ price: '50.00' });
    expect(log.after).toEqual({ price: '65.00' });
    expect(log.ip).toBeTruthy();
  });

  it('registra troca de papel, pagamento e pedido de cancelamento da assinatura', async () => {
    const user = await createUser();
    await request(app).patch(`/api/admin/users/${user.id}/role`).set(bearer(adminToken)).send({ role: 'owner' });
    expect(await AuditLog.findOne({ where: { action: 'user.role_changed', entity_id: String(user.id) } })).toMatchObject({ before: { role: 'cliente' }, after: { role: 'owner' } });

    const t = await createTenant();
    const token = await loginAs(t.owner);
    const appointment = await createAppointment({ tenant: t, client: await createUser() });
    await request(app).post('/api/payment').set(bearer(token)).send({ appointment_id: appointment.id, method: 'PIX', status: 'PAID' });
    expect(await AuditLog.count({ where: { action: 'payment.created', barbershop_id: t.barbershop.id } })).toBe(1);

    await request(app).post('/api/billing/cancel').set(bearer(token)).send({ barbershop_id: t.barbershop.id });
    expect(await AuditLog.count({ where: { action: 'subscription.cancel_requested', barbershop_id: t.barbershop.id } })).toBe(1);
  });

  describe('GET /api/audit-logs', () => {
    it('dono vê só a própria barbearia (outro dono → 403; sem barbershop_id → 400)', async () => {
      const res = await request(app).get('/api/audit-logs').set(bearer(ownerToken)).query({ barbershop_id: tenant.barbershop.id });
      expect(res.status).toBe(200);
      expect(res.body.items.length).toBeGreaterThan(0);
      expect(res.body.items.every((item) => item.barbershop_id === tenant.barbershop.id)).toBe(true);
      expect(res.body.items[0].actor).toMatchObject({ id: tenant.owner.id });
      expect((await request(app).get('/api/audit-logs').set(bearer(ownerToken)).query({ barbershop_id: other.barbershop.id })).status).toBe(403);
      expect((await request(app).get('/api/audit-logs').set(bearer(ownerToken))).status).toBe(400);
    });

    it('admin vê tudo e filtra por ação; barbeiro → 403', async () => {
      const all = await request(app).get('/api/audit-logs').set(bearer(adminToken)).query({ action: 'user.role_changed' });
      expect(all.status).toBe(200);
      expect(all.body.items.every((item) => item.action === 'user.role_changed')).toBe(true);
      expect((await request(app).get('/api/audit-logs').set(bearer(await loginAs(tenant.barberUser)))).status).toBe(403);
    });
  });
});
