// BE-50: resumo do dia para o atendimento (dono, gerente e recepcionista da filial).
jest.setTimeout(120000);

const { app, request, resetDatabase, createTenant, createUser, createAppointment, loginAs, bearer, slotAt, sequelize } = require('../../helpers/factories');
const { Address, Branch, BarbershopMember, BarbershopClient } = require('../../../models');
const dashboardService = require('../../../modules/dashboard/dashboardService');
const time = require('../../../shared/time');

describe('BE-50 — GET /api/dashboard/front-desk', () => {
  let tenant;
  let branchY;
  let client;
  let receptionToken;
  let receptionUser;
  const tomorrow = () => time.addDays(time.todayIn(time.DEFAULT_TIMEZONE), 1);

  beforeAll(async () => {
    await resetDatabase();
    tenant = await createTenant();
    const address = await Address.create({ cep: '01001-000', number: 2, city: 'SP', state: 'SP' });
    branchY = await Branch.create({ name: 'Filial Y', barbershop_id: tenant.barbershop.id, address_id: address.id });
    client = await createUser({ name: 'Ana Cliente' });
    const quick = await BarbershopClient.create({ barbershop_id: tenant.barbershop.id, name: 'Seu Jorge', phone: '+5511977770000' });
    await createAppointment({ tenant, client, date: slotAt(1, '15:00'), status: 'confirmado' });
    await createAppointment({ tenant, client: { id: null }, client_id: quick.id, date: slotAt(1, '10:00'), status: 'confirmado' });
    await createAppointment({ tenant, client, date: slotAt(1, '09:00'), status: 'concluido' });
    await createAppointment({ tenant, client, date: slotAt(1, '11:00'), status: 'cancelado' });
    await createAppointment({ tenant, client, date: slotAt(1, '12:00'), status: 'nao_compareceu' });
    await createAppointment({ tenant, client, date: slotAt(2, '10:00'), status: 'confirmado' }); // outro dia
    receptionUser = await createUser({ email: 'balcao@x.com' });
    await BarbershopMember.create({ barbershop_id: tenant.barbershop.id, user_id: receptionUser.id, role: 'receptionist', branch_ids: [tenant.branch.id] });
    receptionToken = await loginAs(receptionUser);
  });
  afterAll(() => sequelize.close());

  it('recepcionista vê contadores e próximos do dia, em ordem', async () => {
    const res = await request(app).get('/api/dashboard/front-desk').set(bearer(receptionToken)).query({ branch_id: tenant.branch.id, date: tomorrow() });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ date: tomorrow(), branch: { id: tenant.branch.id }, total_today: 4, attended: 1, pending: 2, cancelled: 1, no_show: 1 });
    expect(res.body.upcoming.map((item) => item.time)).toEqual(['10:00', '15:00']);
    expect(res.body.upcoming[0]).toMatchObject({
      status: 'confirmado',
      client: { name: 'Seu Jorge', phone: '+5511977770000', user_id: null },
      services: [{ id: tenant.service.id, name: 'Corte', duration_min: 30 }],
      barber: { id: tenant.barber.id },
    });
    expect(res.body.upcoming[1].client).toMatchObject({ name: 'Ana Cliente', user_id: client.id });
    expect(res.body.upcoming[0].allowed_actions).toEqual(expect.arrayContaining(['cancel', 'reschedule']));
  });

  it('dono e gerente da filial acessam; data padrão = hoje', async () => {
    const owner = await request(app).get('/api/dashboard/front-desk').set(bearer(await loginAs(tenant.owner))).query({ branch_id: tenant.branch.id });
    expect(owner.status).toBe(200);
    expect(owner.body.date).toBe(time.todayIn(time.DEFAULT_TIMEZONE));
    const manager = await createUser();
    await BarbershopMember.create({ barbershop_id: tenant.barbershop.id, user_id: manager.id, role: 'manager', branch_ids: [tenant.branch.id] });
    expect((await request(app).get('/api/dashboard/front-desk').set(bearer(await loginAs(manager))).query({ branch_id: tenant.branch.id })).status).toBe(200);
  });

  it('outra filial, outro tenant, barbeiro → 403; filial inexistente → 404; sem branch_id → 400', async () => {
    expect((await request(app).get('/api/dashboard/front-desk').set(bearer(receptionToken)).query({ branch_id: branchY.id })).status).toBe(403);
    const other = await createTenant();
    expect((await request(app).get('/api/dashboard/front-desk').set(bearer(await loginAs(other.owner))).query({ branch_id: tenant.branch.id })).status).toBe(403);
    expect((await request(app).get('/api/dashboard/front-desk').set(bearer(await loginAs(tenant.barberUser))).query({ branch_id: tenant.branch.id })).status).toBe(403);
    expect((await request(app).get('/api/dashboard/front-desk').set(bearer(receptionToken)).query({ branch_id: 99999 })).status).toBe(404);
    expect((await request(app).get('/api/dashboard/front-desk').set(bearer(receptionToken))).status).toBe(400);
  });

  it('service: upcoming ignora o que já terminou no momento consultado', async () => {
    const user = { id: tenant.owner.id, role: 'owner', memberships: [] };
    const noon = time.localToUtc(tomorrow(), 12 * 60, time.DEFAULT_TIMEZONE);
    const result = await dashboardService.frontDesk({ branch_id: tenant.branch.id, date: tomorrow() }, user, noon);
    expect(result.upcoming.map((item) => item.time)).toEqual(['15:00']);
    expect(result.pending).toBe(2);
  });
});
