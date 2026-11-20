// BE-24: métricas com fixture conhecida — cada número conferido à mão.
// Filial em America/Sao_Paulo (UTC−3), aberta 09:00–18:00 todos os dias (540 min).
// Período 2026-12-07 (segunda) a 2026-12-09 (quarta):
//   barbeiro 1 (sem jornada → horário da filial): 540 + (540 − 60 de bloqueio) + 0 (fechada) = 1020
//   barbeiro 2 (jornada só segunda 10–12):          120
//   disponível = 1140 min
jest.setTimeout(120000);

const {
  app,
  request,
  resetDatabase,
  createTenant,
  createUser,
  createAppointment,
  loginAs,
  bearer,
  openAllWeek,
  sequelize,
} = require('../../helpers/factories');
const { Barber, BarberWorkingHour, BarberTimeOff, BranchClosure, Payment, Address, Branch } = require('../../../models');
const metrics = require('../../../modules/dashboard/metrics');
const dashboardService = require('../../../modules/dashboard/dashboardService');

const PERIOD = { from: '2026-12-07', to: '2026-12-09' };

describe('BE-24 — métricas', () => {
  let a;
  let b;
  let barber2;
  let barber2User;
  let tokens;

  const appt = (tenant, client, iso, status, barber) => createAppointment({ tenant, client, date: iso, status, barber });
  const pay = (appointment, method, amount, paidAt) =>
    Payment.create({ appointment_id: appointment.id, amount, method, status: 'PAID', paid_at: new Date(paidAt) });

  beforeAll(async () => {
    await resetDatabase();
    a = await createTenant({ name: 'Métricas A' });
    b = await createTenant({ name: 'Métricas B' });
    await openAllWeek(a.branch, '09:00', '18:00');
    await openAllWeek(b.branch, '09:00', '18:00');

    barber2User = await createUser({ role: 'barbeiro' });
    barber2 = await Barber.create({ user_id: barber2User.id, branch_id: a.branch.id, display_name: 'Barbeiro Dois' });
    await BarberWorkingHour.create({ barber_id: barber2.id, weekday: 1, start_time: '10:00', end_time: '12:00' });
    await BarberTimeOff.create({ barber_id: a.barber.id, start_at: new Date('2026-12-08T16:00:00Z'), end_at: new Date('2026-12-08T17:00:00Z') });
    await BranchClosure.create({ branch_id: a.branch.id, date: '2026-12-09', all_day: true });

    const client = await createUser();
    const a1 = await appt(a, client, '2026-12-07T13:00:00Z', 'concluido');
    await pay(a1, 'PIX', 50, '2026-12-07T14:00:00Z');
    const a2 = await appt(a, client, '2026-12-08T13:00:00Z', 'concluido');
    await pay(a2, 'CARD', 50, '2026-12-08T14:00:00Z');
    await appt(a, client, '2026-12-07T13:00:00Z', 'nao_compareceu', barber2);
    await appt(a, client, '2026-12-08T15:00:00Z', 'cancelado');
    // 2026-12-06 23:00 no horário local → fora do período (fuso respeitado).
    const outside = await appt(a, client, '2026-12-07T02:00:00Z', 'concluido');
    await pay(outside, 'CASH', 50, '2026-12-07T02:30:00Z');
    // 2026-12-08 21:30 local → dentro do período.
    await appt(a, client, '2026-12-09T00:30:00Z', 'confirmado');
    // Outra barbearia: nunca entra nos números de A.
    const other = await appt(b, client, '2026-12-07T13:00:00Z', 'concluido');
    await pay(other, 'PIX', 999, '2026-12-07T14:00:00Z');

    tokens = {
      ownerA: await loginAs(a.owner),
      ownerB: await loginAs(b.owner),
      barber1: await loginAs(a.barberUser),
      barber2: await loginAs(barber2User),
      client: await loginAs(client),
    };
  });

  afterAll(() => sequelize.close());

  const summary = (token, query) => request(app).get('/api/dashboard/summary').set(bearer(token)).query(query);

  it('summary confere cada número', async () => {
    const res = await summary(tokens.ownerA, { barbershop_id: a.barbershop.id, ...PERIOD });
    expect(res.status).toBe(200);
    expect(res.body.period).toEqual(PERIOD);
    expect(res.body.revenue).toEqual({
      total: '100.00',
      payments: 2,
      average_ticket: '50.00',
      by_method: { PIX: '50.00', CASH: '0.00', CARD: '50.00' },
    });
    expect(res.body.appointments).toEqual({
      total: 5,
      by_status: { confirmado: 1, concluido: 2, cancelado: 1, nao_compareceu: 1 },
    });
    expect(res.body.occupancy).toEqual({ booked_minutes: 120, available_minutes: 1140, rate: 0.1053 });
    expect(res.body.top_services).toEqual([{ service_id: a.service.id, name: 'Corte', count: 4, revenue: '100.00' }]);
    expect(res.body.revenue_by_day).toEqual([
      { date: '2026-12-07', amount: '50.00' },
      { date: '2026-12-08', amount: '50.00' },
      { date: '2026-12-09', amount: '0.00' },
    ]);
    expect(res.body.revenue_by_branch).toEqual([{ branch_id: a.branch.id, name: a.branch.name, appointments: 4, revenue: '100.00' }]);
    expect(res.body.revenue_by_barber).toEqual([
      { barber_id: a.barber.id, name: expect.any(String), appointments: 3, revenue: '100.00' },
      { barber_id: barber2.id, name: 'Barbeiro Dois', appointments: 1, revenue: '0.00' },
    ]);
  });

  it('filtro por filial: outra filial sem movimento zera os números', async () => {
    const address = await Address.create({ cep: '01001-000', number: 9, city: 'São Paulo', state: 'SP' });
    const empty = await Branch.create({ name: 'Vazia', barbershop_id: a.barbershop.id, address_id: address.id });
    const res = await summary(tokens.ownerA, { barbershop_id: a.barbershop.id, branch_id: empty.id, ...PERIOD });
    expect(res.status).toBe(200);
    expect(res.body.revenue.total).toBe('0.00');
    expect(res.body.appointments.total).toBe(0);
    expect(res.body.occupancy.rate).toBe(0);
    // Filial de outra barbearia → 404.
    expect((await summary(tokens.ownerA, { barbershop_id: a.barbershop.id, branch_id: b.branch.id, ...PERIOD })).status).toBe(404);
  });

  it('autorização: outro dono 403, barbeiro/cliente 403, sem barbershop_id 400', async () => {
    expect((await summary(tokens.ownerB, { barbershop_id: a.barbershop.id, ...PERIOD })).status).toBe(403);
    expect((await summary(tokens.barber1, { barbershop_id: a.barbershop.id, ...PERIOD })).status).toBe(403);
    expect((await summary(tokens.client, { barbershop_id: a.barbershop.id, ...PERIOD })).status).toBe(403);
    expect((await summary(tokens.ownerA, PERIOD)).status).toBe(400);
    expect((await summary(tokens.ownerA, { barbershop_id: 999999, ...PERIOD })).status).toBe(404);
  });

  it('período inválido → 400 (formato, invertido, maior que 366 dias)', async () => {
    const base = { barbershop_id: a.barbershop.id };
    expect((await summary(tokens.ownerA, { ...base, from: '07/12/2026' })).status).toBe(400);
    expect((await summary(tokens.ownerA, { ...base, from: '2026-12-09', to: '2026-12-01' })).status).toBe(400);
    expect((await summary(tokens.ownerA, { ...base, from: '2025-01-01', to: '2026-12-01' })).status).toBe(400);
  });

  it('dashboard do barbeiro: só os próprios atendimentos e a própria ocupação', async () => {
    const res = await request(app).get('/api/dashboard/barber').set(bearer(tokens.barber2)).query(PERIOD);
    expect(res.status).toBe(200);
    expect(res.body.appointments).toEqual({ total: 1, by_status: { confirmado: 0, concluido: 0, cancelado: 0, nao_compareceu: 1 } });
    expect(res.body.revenue.total).toBe('0.00');
    expect(res.body.occupancy).toEqual({ booked_minutes: 30, available_minutes: 120, rate: 0.25 });
    expect(res.body.revenue_by_barber).toBeUndefined();

    const one = await request(app).get('/api/dashboard/barber').set(bearer(tokens.barber1)).query(PERIOD);
    expect(one.body.revenue.total).toBe('100.00');
    expect(one.body.occupancy).toEqual({ booked_minutes: 90, available_minutes: 1020, rate: 0.0882 });
  });

  it('dono sem perfil de barbeiro → 404 no dashboard do barbeiro', async () => {
    expect((await request(app).get('/api/dashboard/barber').set(bearer(tokens.ownerA))).status).toBe(404);
  });

  it('período padrão = últimos 30 dias', () => {
    const period = dashboardService.resolvePeriod({}, new Date('2026-12-10T12:00:00Z'));
    expect(period.from).toBe('2026-11-11');
    expect(period.to).toBe('2026-12-10');
    expect(period.days).toHaveLength(30);
  });

  describe('metrics (unitário)', () => {
    it('availableMinutesForDay: fechamento parcial e bloqueio sobrepostos não contam duas vezes', () => {
      const minutes = metrics.availableMinutesForDay({
        date: '2026-12-07',
        timezone: 'America/Sao_Paulo',
        openingHours: [{ weekday: 1, opens_at: '09:00', closes_at: '18:00' }],
        closures: [{ date: '2026-12-07', all_day: false, start_time: '12:00', end_time: '14:00' }],
        barbers: [{ workingHours: [], timeOff: [{ start_at: '2026-12-07T16:00:00Z', end_at: '2026-12-07T18:00:00Z' }] }],
      });
      // 540 − (12:00–14:00 ∪ 13:00–15:00 = 3 h) = 360
      expect(minutes).toBe(360);
    });

    it('rate e conversão de centavos', () => {
      expect(metrics.rate(1, 3)).toBe(0.3333);
      expect(metrics.rate(5, 0)).toBe(0);
      expect(metrics.fromCents(metrics.toCents('0.1') + metrics.toCents(0.2))).toBe('0.30');
    });
  });
});
