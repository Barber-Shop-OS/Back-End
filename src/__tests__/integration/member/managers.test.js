// BE-47: gerente de filial — vê e opera só as filiais dele; não mexe em cobrança nem em outros gerentes.
jest.setTimeout(120000);

const { app, request, resetDatabase, createTenant, createUser, createAppointment, loginAs, bearer, sequelize } = require('../../helpers/factories');
const { Address, Branch, Barber, Payment, BarbershopMember } = require('../../../models');

describe('BE-47 — gerente de filial', () => {
  let tenant;
  let branchY;
  let barberY;
  let ownerToken;
  let manager;
  let managerToken;

  beforeAll(async () => {
    await resetDatabase();
    tenant = await createTenant({ subscription: { status: 'active', plan_code: 'rede' } });
    const address = await Address.create({ cep: '01001-000', number: 2, city: 'SP', state: 'SP' });
    branchY = await Branch.create({ name: 'Filial Y', barbershop_id: tenant.barbershop.id, address_id: address.id });
    barberY = await Barber.create({ user_id: (await createUser({ role: 'barbeiro' })).id, branch_id: branchY.id });
    ownerToken = await loginAs(tenant.owner);
    manager = await createUser({ email: 'gerente@x.com' });
    const client = await createUser();
    const apX = await createAppointment({ tenant, client, date: new Date(Date.now() - 2 * 86400000), status: 'concluido' });
    const apY = await createAppointment({ tenant, client, barber: barberY, branch_id: branchY.id, date: new Date(Date.now() - 2 * 86400000), status: 'concluido' });
    await Payment.create({ appointment_id: apX.id, amount: 50, method: 'PIX', status: 'PAID', paid_at: new Date(Date.now() - 2 * 86400000), branch_id: tenant.branch.id, barbershop_id: tenant.barbershop.id });
    await Payment.create({ appointment_id: apY.id, amount: 80, method: 'PIX', status: 'PAID', paid_at: new Date(Date.now() - 2 * 86400000), branch_id: branchY.id, barbershop_id: tenant.barbershop.id });
  });
  afterAll(() => sequelize.close());

  it('dono adiciona gerente da filial X; outra barbearia/filial alheia → 400', async () => {
    const res = await request(app).post(`/api/barbershop/${tenant.barbershop.id}/members`).set(bearer(ownerToken)).send({ email: 'gerente@x.com', branch_ids: [tenant.branch.id] });
    expect(res.status).toBe(201);
    expect(res.body.member).toMatchObject({ role: 'manager', branch_ids: [tenant.branch.id], user: { email: 'gerente@x.com' } });
    const other = await createTenant();
    const bad = await request(app).post(`/api/barbershop/${tenant.barbershop.id}/members`).set(bearer(ownerToken)).send({ email: (await createUser()).email, branch_ids: [other.branch.id] });
    expect(bad.status).toBe(400);
    expect((await request(app).post(`/api/barbershop/${tenant.barbershop.id}/members`).set(bearer(ownerToken)).send({ email: 'gerente@x.com' })).status).toBe(409);
    expect((await request(app).post(`/api/barbershop/${tenant.barbershop.id}/members`).set(bearer(ownerToken)).send({ email: 'ninguem@x.com' })).status).toBe(404);
    managerToken = await loginAs(manager);
  });

  it('gerente da filial X não vê financeiro da filial Y', async () => {
    const summary = await request(app).get('/api/dashboard/summary').set(bearer(managerToken)).query({ barbershop_id: tenant.barbershop.id });
    expect(summary.status).toBe(200);
    expect(summary.body.revenue.total).toBe('50.00');
    expect(summary.body.revenue_by_branch.map((row) => row.branch_id)).toEqual([tenant.branch.id]);
    expect((await request(app).get('/api/dashboard/summary').set(bearer(managerToken)).query({ barbershop_id: tenant.barbershop.id, branch_id: branchY.id })).status).toBe(403);

    const payments = await request(app).get('/api/payment').set(bearer(managerToken));
    expect(payments.status).toBe(200);
    expect(payments.body.totals.paid.amount).toBe('50.00');
    const ownerPayments = await request(app).get('/api/payment').set(bearer(ownerToken));
    expect(ownerPayments.body.totals.paid.amount).toBe('130.00');
  });

  it('gerente opera a filial X (horário, barbeiro, agenda) e é barrado na Y', async () => {
    const hours = { opening_hours: [{ weekday: 1, opens_at: '09:00', closes_at: '18:00' }] };
    expect((await request(app).put(`/api/branch/${tenant.branch.id}/opening-hours`).set(bearer(managerToken)).send(hours)).status).toBe(200);
    expect((await request(app).put(`/api/branch/${branchY.id}/opening-hours`).set(bearer(managerToken)).send(hours)).status).toBe(403);
    expect((await request(app).put(`/api/barber/${barberY.id}`).set(bearer(managerToken)).send({ bio: 'x' })).status).toBe(403);
    expect((await request(app).put(`/api/barber/${tenant.barber.id}`).set(bearer(managerToken)).send({ bio: 'Gerenciado' })).status).toBe(200);
    const agenda = await request(app).get('/api/appointment').set(bearer(managerToken));
    expect(agenda.body.items.every((item) => item.branch_id === tenant.branch.id)).toBe(true);
    expect(agenda.body.total).toBe(1);
  });

  it('gerente não mexe em cobrança, configurações da barbearia nem em outros gerentes', async () => {
    expect((await request(app).post('/api/billing/cancel').set(bearer(managerToken)).send({ barbershop_id: tenant.barbershop.id })).status).toBe(403);
    expect((await request(app).put(`/api/barbershop/${tenant.barbershop.id}`).set(bearer(managerToken)).send({ description: 'x' })).status).toBe(403);
    expect((await request(app).get(`/api/barbershop/${tenant.barbershop.id}/members`).set(bearer(managerToken))).status).toBe(403);
  });

  it('/api/me lista a barbearia gerenciada; remover o gerente corta o acesso na hora', async () => {
    const me = await request(app).get('/api/me').set(bearer(managerToken));
    expect(me.body.barbershops).toEqual([expect.objectContaining({ id: tenant.barbershop.id, membership: 'manager', branch_ids: [tenant.branch.id] })]);
    const member = await BarbershopMember.findOne({ where: { user_id: manager.id } });
    expect((await request(app).delete(`/api/barbershop/${tenant.barbershop.id}/members/${member.id}`).set(bearer(ownerToken))).status).toBe(204);
    expect((await request(app).get('/api/dashboard/summary').set(bearer(managerToken)).query({ barbershop_id: tenant.barbershop.id })).status).toBe(403);
  });

  it('fora do plano Rede → 402 FEATURE_NOT_IN_PLAN', async () => {
    const pro = await createTenant({ subscription: { status: 'active', plan_code: 'profissional' } });
    const res = await request(app).post(`/api/barbershop/${pro.barbershop.id}/members`).set(bearer(await loginAs(pro.owner))).send({ email: 'gerente@x.com' });
    expect(res.status).toBe(402);
    expect(res.body.details).toMatchObject({ feature: 'branch_managers', upgrade_to: 'rede' });
  });
});
