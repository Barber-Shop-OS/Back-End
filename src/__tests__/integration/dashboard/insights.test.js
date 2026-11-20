// BE-53: lacunas das telas do Figma — variação vs período anterior (cards "+12%"), receita por
// serviço (Rendimentos da Filial) e clientes do barbeiro.
// Semana atual 2026-12-14 (seg) … 2026-12-20 (dom); anterior 2026-12-07 … 2026-12-13 (São Paulo, UTC−3).
jest.setTimeout(120000);

const { app, request, resetDatabase, createTenant, createUser, createAppointment, loginAs, bearer, sequelize } = require('../../helpers/factories');
const { Payment, Service, BarberService, Barber, BarbershopClient } = require('../../../models');
const dashboardService = require('../../../modules/dashboard/dashboardService');
const metrics = require('../../../modules/dashboard/metrics');

const WEEK = { from: '2026-12-14', to: '2026-12-20' };

describe('BE-53 — insights do dashboard', () => {
  let tenant;
  let barba;
  let ana;
  let bruno;
  let otherBarberUser;
  let tokens;

  const appt = (client, iso, status, extra = {}) => createAppointment({ tenant, client, date: iso, status, ...extra });
  const pay = (appointment, amount, paidAt) => Payment.create({ appointment_id: appointment.id, amount, method: 'PIX', status: 'PAID', paid_at: new Date(paidAt), branch_id: tenant.branch.id, barbershop_id: tenant.barbershop.id });

  beforeAll(async () => {
    await resetDatabase();
    tenant = await createTenant({ subscription: { status: 'active', plan_code: 'profissional' } });
    barba = await Service.create({ name: 'Barba', description: 'Barba', price: 30, duration: 30, barbershop_id: tenant.barbershop.id });
    await BarberService.create({ barber_id: tenant.barber.id, service_id: barba.id });
    ana = await createUser({ name: 'Ana' });
    bruno = await createUser({ name: 'Bruno' });
    const anaClient = await BarbershopClient.create({ barbershop_id: tenant.barbershop.id, user_id: ana.id, name: 'Ana Souza', phone: '+5511911112222' });

    // Semana atual: 2 cortes (50) + 1 barba (30) pagos = 130; 3 agendamentos.
    await pay(await appt(ana, '2026-12-14T13:00:00Z', 'concluido', { client_id: anaClient.id }), 50, '2026-12-14T13:30:00Z');
    await pay(await appt(bruno, '2026-12-16T13:00:00Z', 'concluido'), 50, '2026-12-16T13:30:00Z');
    await pay(await appt(ana, '2026-12-18T13:00:00Z', 'concluido', { service: barba, client_id: anaClient.id }), 30, '2026-12-18T13:30:00Z');
    // Semana anterior: 2 cortes pagos = 100; 2 agendamentos.
    await pay(await appt(ana, '2026-12-08T13:00:00Z', 'concluido', { client_id: anaClient.id }), 50, '2026-12-08T13:30:00Z');
    await pay(await appt(bruno, '2026-12-10T13:00:00Z', 'concluido'), 50, '2026-12-10T13:30:00Z');

    // Outro barbeiro da filial: cliente dele não aparece na lista do barbeiro 1.
    otherBarberUser = await createUser({ role: 'barbeiro' });
    const otherBarber = await Barber.create({ user_id: otherBarberUser.id, branch_id: tenant.branch.id });
    const carla = await createUser({ name: 'Carla' });
    await appt(carla, '2026-12-15T13:00:00Z', 'concluido', { barber: otherBarber });
    // Agendamento não concluído não conta como cliente atendido.
    await appt(await createUser({ name: 'Diego' }), '2026-12-19T13:00:00Z', 'confirmado');

    tokens = { owner: await loginAs(tenant.owner), barber: await loginAs(tenant.barberUser), client: await loginAs(ana) };
  });
  afterAll(() => sequelize.close());

  it('summary: comparison com a semana anterior e revenue_by_service completo', async () => {
    const res = await request(app).get('/api/dashboard/summary').set(bearer(tokens.owner)).query({ barbershop_id: tenant.barbershop.id, branch_id: tenant.branch.id, ...WEEK });
    expect(res.status).toBe(200);
    expect(res.body.revenue.total).toBe('130.00');
    expect(res.body.comparison).toEqual({
      previous_period: { from: '2026-12-07', to: '2026-12-13' },
      revenue: { previous: '100.00', change_pct: 30 },
      payments: { previous: 2, change_pct: 50 },
      average_ticket: { previous: '50.00', change_pct: -13.3 },
      appointments: { previous: 2, change_pct: 150 },
    });
    expect(res.body.revenue_by_service).toEqual([
      { service_id: tenant.service.id, name: 'Corte', appointments: 4, revenue: '100.00' },
      { service_id: barba.id, name: 'Barba', appointments: 1, revenue: '30.00' },
    ]);
    // Gráfico "Receita Semanal": revenue_by_day cobre seg→dom.
    expect(res.body.revenue_by_day.map((day) => day.amount)).toEqual(['50.00', '0.00', '50.00', '0.00', '30.00', '0.00', '0.00']);
    expect(res.body.revenue_by_barber[0]).toMatchObject({ barber_id: tenant.barber.id, revenue: '130.00' });
  });

  it('dashboard do barbeiro também traz comparison e revenue_by_service', async () => {
    const res = await request(app).get('/api/dashboard/barber').set(bearer(tokens.barber)).query(WEEK);
    expect(res.status).toBe(200);
    expect(res.body.comparison.revenue).toEqual({ previous: '100.00', change_pct: 30 });
    expect(res.body.revenue_by_service.map((row) => row.name)).toEqual(['Corte', 'Barba']);
    expect(res.body).not.toHaveProperty('revenue_by_barber');
  });

  it('clientes do barbeiro: só os atendidos (concluídos) por ele, com visitas, última visita e total', async () => {
    const res = await request(app).get('/api/dashboard/barber/clients').set(bearer(tokens.barber));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 1, pageSize: 10, total: 2, totalPages: 1 });
    const names = res.body.items.map((item) => item.name);
    expect(names).not.toContain('Carla');
    expect(names).not.toContain('Diego');
    const anaRow = res.body.items.find((item) => item.name === 'Ana Souza');
    expect(anaRow).toMatchObject({ user_id: ana.id, phone: '+5511911112222', visits: 3, last_visit: '2026-12-18T13:00:00.000Z', total_spent: '130.00' });
    expect(res.body.items[0].name).toBe('Ana Souza'); // padrão: última visita mais recente

    const bySpent = await request(app).get('/api/dashboard/barber/clients').set(bearer(tokens.barber)).query({ sortBy: 'visits', pageSize: 1 });
    expect(bySpent.body).toMatchObject({ total: 2, totalPages: 2, pageSize: 1 });
    expect(bySpent.body.items[0].visits).toBe(3);
    const search = await request(app).get('/api/dashboard/barber/clients').set(bearer(tokens.barber)).query({ search: 'brun' });
    expect(search.body.items.map((item) => item.name)).toEqual(['Bruno']);
    const byPhone = await request(app).get('/api/dashboard/barber/clients').set(bearer(tokens.barber)).query({ search: '1111' });
    expect(byPhone.body.items.map((item) => item.name)).toEqual(['Ana Souza']);
  });

  it('clientes do barbeiro: cliente → 403, dono sem perfil → 404, sortBy inválido → 400', async () => {
    expect((await request(app).get('/api/dashboard/barber/clients').set(bearer(tokens.client))).status).toBe(403);
    expect((await request(app).get('/api/dashboard/barber/clients').set(bearer(tokens.owner))).status).toBe(404);
    expect((await request(app).get('/api/dashboard/barber/clients').set(bearer(tokens.barber)).query({ sortBy: 'x' })).status).toBe(400);
  });

  it('unitário: período anterior e variação percentual', () => {
    const period = { from: '2026-12-14', to: '2026-12-20', days: metrics.daysBetween('2026-12-14', '2026-12-20') };
    expect(dashboardService.previousPeriod(period)).toMatchObject({ from: '2026-12-07', to: '2026-12-13' });
    expect(dashboardService.changePct(112, 100)).toBe(12);
    expect(dashboardService.changePct(50, 0)).toBeNull();
    expect(dashboardService.changePct(0, 40)).toBe(-100);
  });
});
