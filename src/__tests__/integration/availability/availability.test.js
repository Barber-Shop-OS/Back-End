// BE-13: GET /api/availability (público) carrega filial, jornada, bloqueios e agendamentos do banco.
const {
  app,
  request,
  resetDatabase,
  createUser,
  createTenant,
  createAppointment,
  sequelize,
} = require('../../helpers/factories');
const {
  Barber,
  BarberService,
  BarberTimeOff,
  BranchClosure,
  BranchOpeningHour,
  Barbershop,
  Service,
} = require('../../../models');
const time = require('../../../shared/time');

const TZ = 'America/Sao_Paulo';
// Sempre um dia útil futuro dentro do horizonte de 30 dias.
const targetDate = time.addDays(time.todayIn(TZ), 3);
const at = (hhmm) => time.localToUtc(targetDate, time.timeToMinutes(hhmm), TZ).toISOString();

describe('BE-13 — GET /api/availability', () => {
  let tenant;
  let client;

  const query = (params = {}) =>
    request(app)
      .get('/api/availability')
      .query({ branch_id: tenant.branch.id, service_id: tenant.service.id, date: targetDate, ...params });

  beforeEach(async () => {
    await resetDatabase();
    tenant = await createTenant();
    client = await createUser();
    await BranchOpeningHour.bulkCreate(
      [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, opens_at: '09:00', closes_at: '11:00', branch_id: tenant.branch.id }))
    );
  });

  afterAll(() => sequelize.close());

  it('lista os horários livres sem login, com cache curto', async () => {
    const res = await query();
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=30');
    // 09:00–11:00, 30 min, grade 15 → 09:00 … 10:30 = 7 horários.
    expect(res.body).toHaveLength(7);
    expect(res.body[0]).toEqual({ start_at: at('09:00'), end_at: at('09:30'), barber_ids: [tenant.barber.id] });
  });

  it('agendamento confirmado ocupa; cancelado libera', async () => {
    await createAppointment({ tenant, client, date: at('09:00') });
    await createAppointment({ tenant, client, date: at('10:00'), status: 'cancelado' });
    const res = await query();
    const starts = res.body.map((slot) => slot.start_at);
    expect(starts).not.toContain(at('09:00'));
    expect(starts).not.toContain(at('08:45'));
    expect(starts).toContain(at('09:30'));
    expect(starts).toContain(at('10:00'));
  });

  it('bloqueio do barbeiro e fechamento da filial', async () => {
    await BarberTimeOff.create({ barber_id: tenant.barber.id, start_at: at('09:00'), end_at: at('10:00') });
    let res = await query();
    expect(res.body.map((slot) => slot.start_at)).toEqual([at('10:00'), at('10:15'), at('10:30')]);

    await BranchClosure.create({ branch_id: tenant.branch.id, date: targetDate, all_day: true, reason: 'Feriado' });
    res = await query();
    expect(res.body).toEqual([]);
  });

  it('sem preferência = união; barber_id filtra', async () => {
    const other = await Barber.create({ user_id: (await createUser({ role: 'barbeiro' })).id, branch_id: tenant.branch.id });
    await BarberService.create({ barber_id: other.id, service_id: tenant.service.id });
    await createAppointment({ tenant, client, date: at('09:00') });

    const union = await query();
    expect(union.body[0]).toEqual({ start_at: at('09:00'), end_at: at('09:30'), barber_ids: [other.id] });
    expect(union.body.find((slot) => slot.start_at === at('09:30')).barber_ids).toEqual(
      [tenant.barber.id, other.id].sort((a, b) => a - b)
    );

    const onlyFirst = await query({ barber_id: tenant.barber.id });
    expect(onlyFirst.body.map((slot) => slot.start_at)).not.toContain(at('09:00'));
    expect(onlyFirst.body.every((slot) => slot.barber_ids.length === 1)).toBe(true);
  });

  it('barbeiro que não executa o serviço ou inativo não entra', async () => {
    const other = await Barber.create({ user_id: (await createUser({ role: 'barbeiro' })).id, branch_id: tenant.branch.id });
    const notPerforming = await query({ barber_id: other.id });
    expect(notPerforming.status).toBe(404);

    await tenant.barber.update({ active: false });
    const res = await query();
    expect(res.body).toEqual([]);
  });

  it('validação: data inválida, ids ausentes → 400', async () => {
    expect((await query({ date: '10/12/2026' })).status).toBe(400);
    expect((await request(app).get('/api/availability').query({ date: targetDate })).status).toBe(400);
  });

  it('filial/serviço inexistentes ou de outra barbearia → 404; serviço inativo → 400', async () => {
    expect((await query({ branch_id: 9999 })).status).toBe(404);
    const otherTenant = await createTenant();
    expect((await query({ service_id: otherTenant.service.id })).status).toBe(404);
    await Service.update({ active: false }, { where: { id: tenant.service.id } });
    expect((await query()).status).toBe(400);
  });

  it('barbearia suspensa ou filial inativa → 404', async () => {
    await Barbershop.update({ status: 'suspended' }, { where: { id: tenant.barbershop.id } });
    expect((await query()).status).toBe(404);
    await Barbershop.update({ status: 'active' }, { where: { id: tenant.barbershop.id } });
    await tenant.branch.update({ active: false });
    expect((await query()).status).toBe(404);
  });

  it('data além do horizonte ou no passado → lista vazia', async () => {
    expect((await query({ date: time.addDays(time.todayIn(TZ), 31) })).body).toEqual([]);
    expect((await query({ date: time.addDays(time.todayIn(TZ), -1) })).body).toEqual([]);
  });
});
