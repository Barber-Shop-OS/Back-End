// BE-24: métricas do dono (barbearia/filial) e do barbeiro logado.
// Período = datas locais [from, to] (inclusive) no fuso de cada filial. Receita = pagamentos PAID
// pela data do pagamento; agendamentos e ocupação pela data do atendimento.
const { Op } = require('sequelize');
const {
  Appointment,
  Payment,
  Branch,
  Barber,
  User,
  BranchOpeningHour,
  BranchClosure,
  BarberWorkingHour,
  BarberTimeOff,
} = require('../../models');
const { assertCanManageBarbershop, membershipFor, ownsBarbershop } = require('../../shared/authz');
const { Barbershop } = require('../../models');
const { ForbiddenError } = require('../../utils/errorHandler');
const time = require('../../shared/time');
const metrics = require('./metrics');
const { ValidationError, NotFoundError } = require('../../utils/errorHandler');

const { STATUS, STATUSES } = Appointment;
const BOOKED_STATUSES = [STATUS.CONFIRMED, STATUS.COMPLETED, STATUS.NO_SHOW];
const DEFAULT_RANGE_DAYS = 30;
const TOP_SERVICES = 5;

/** from/to (YYYY-MM-DD) validados; padrão = últimos 30 dias até hoje (fuso padrão). */
const resolvePeriod = (query, now = new Date()) => {
  const today = time.todayIn(time.DEFAULT_TIMEZONE, now);
  const to = query.to || today;
  const from = query.from || time.addDays(to, -(DEFAULT_RANGE_DAYS - 1));
  if (!time.isValidDate(from) || !time.isValidDate(to)) {
    throw new ValidationError("Campos 'from' e 'to' devem estar no formato YYYY-MM-DD");
  }
  if (from > to) throw new ValidationError("'from' deve ser anterior ou igual a 'to'");
  const days = metrics.daysBetween(from, to);
  if (days.length > metrics.MAX_RANGE_DAYS) {
    throw new ValidationError(`Período máximo de ${metrics.MAX_RANGE_DAYS} dias`);
  }
  return { from, to, days };
};

/** Intervalo UTC que cobre o período em todos os fusos envolvidos. */
const utcRange = (period, timezones) => {
  const starts = timezones.map((tz) => time.localDayRange(period.from, tz).start.getTime());
  const ends = timezones.map((tz) => time.localDayRange(period.to, tz).end.getTime());
  return { start: new Date(Math.min(...starts)), end: new Date(Math.max(...ends)) };
};

/** O instante cai no período, considerando o fuso da filial? */
const inPeriod = (instant, tz, period) => {
  const day = time.toLocalParts(instant, tz).date;
  return day >= period.from && day <= period.to;
};

/** Minutos disponíveis por filial no período (todos os barbeiros ativos, ou só os informados). */
const availableMinutes = async (branches, period, { barberIds } = {}) => {
  let total = 0;
  for (const branch of branches) {
    const barberWhere = { branch_id: branch.id, active: true };
    if (barberIds) barberWhere.id = { [Op.in]: barberIds };
    const barbers = await Barber.findAll({ where: barberWhere, attributes: ['id'] });
    if (!barbers.length) continue;
    const ids = barbers.map((barber) => barber.id);
    const range = utcRange(period, [branch.timezone]);
    const [openingHours, closures, workingHours, timeOff] = await Promise.all([
      BranchOpeningHour.findAll({ where: { branch_id: branch.id } }),
      BranchClosure.findAll({ where: { branch_id: branch.id, date: { [Op.between]: [period.from, period.to] } } }),
      BarberWorkingHour.findAll({ where: { barber_id: { [Op.in]: ids } } }),
      BarberTimeOff.findAll({
        where: { barber_id: { [Op.in]: ids }, start_at: { [Op.lt]: range.end }, end_at: { [Op.gt]: range.start } },
      }),
    ]);
    const perBarber = ids.map((id) => ({
      workingHours: workingHours.filter((row) => Number(row.barber_id) === id),
      timeOff: timeOff.filter((row) => Number(row.barber_id) === id),
    }));
    for (const date of period.days) {
      total += metrics.availableMinutesForDay({
        date,
        timezone: branch.timezone,
        openingHours,
        closures: closures.map((closure) => closure.get({ plain: true })),
        barbers: perBarber,
      });
    }
  }
  return total;
};

const barberLabel = (barber) => (barber ? barber.display_name || (barber.User && barber.User.name) || `#${barber.id}` : null);

/**
 * Núcleo comum: recebe as filiais do escopo e um filtro extra de agendamento (barbeiro) e devolve
 * todas as métricas.
 */
const compute = async ({ branches, period, appointmentFilter = {}, barberIds }) => {
  const branchIds = branches.map((branch) => branch.id);
  const tzByBranch = new Map(branches.map((branch) => [branch.id, branch.timezone || time.DEFAULT_TIMEZONE]));
  const tzOf = (branchId) => tzByBranch.get(branchId) || time.DEFAULT_TIMEZONE;
  const range = utcRange(period, [...new Set(tzByBranch.values()), time.DEFAULT_TIMEZONE]);

  const barberInclude = { model: Barber, attributes: ['id', 'display_name'], include: [{ model: User, attributes: ['name'] }] };
  const [appointmentRows, paymentRows] = await Promise.all([
    Appointment.findAll({
      where: { branch_id: { [Op.in]: branchIds }, start_at: { [Op.gte]: range.start, [Op.lt]: range.end }, ...appointmentFilter },
      attributes: ['id', 'branch_id', 'barber_id', 'service_id', 'service_name_snapshot', 'status', 'start_at', 'duration_min'],
      include: [barberInclude],
    }),
    Payment.findAll({
      where: { status: 'PAID', paid_at: { [Op.gte]: range.start, [Op.lt]: range.end } },
      attributes: ['id', 'amount', 'method', 'paid_at'],
      include: [
        {
          model: Appointment,
          required: true,
          where: { branch_id: { [Op.in]: branchIds }, ...appointmentFilter },
          attributes: ['id', 'branch_id', 'barber_id', 'service_id', 'service_name_snapshot'],
          include: [barberInclude],
        },
      ],
    }),
  ]);

  const appointments = appointmentRows.filter((row) => inPeriod(row.start_at, tzOf(row.branch_id), period));
  const payments = paymentRows
    .map((row) => ({ row, appointment: row.appointment || row.Appointment }))
    .filter(({ row, appointment }) => inPeriod(row.paid_at, tzOf(appointment.branch_id), period));

  // Agendamentos por status
  const byStatus = Object.fromEntries(STATUSES.map((status) => [status, 0]));
  appointments.forEach((row) => {
    byStatus[row.status] += 1;
  });

  // Receita
  const revenueCents = payments.reduce((sum, { row }) => sum + metrics.toCents(row.amount), 0);
  const byMethod = { PIX: 0, CASH: 0, CARD: 0 };
  payments.forEach(({ row }) => {
    byMethod[row.method] += metrics.toCents(row.amount);
  });

  // Ocupação
  const bookedMinutes = appointments
    .filter((row) => BOOKED_STATUSES.includes(row.status))
    .reduce((sum, row) => sum + Number(row.duration_min), 0);
  const available = await availableMinutes(branches, period, { barberIds });

  // Top serviços (agendamentos não cancelados) com a receita paga de cada um
  const services = new Map();
  appointments
    .filter((row) => row.status !== STATUS.CANCELLED)
    .forEach((row) => {
      const entry = services.get(row.service_id) || { service_id: row.service_id, name: row.service_name_snapshot, count: 0, cents: 0 };
      entry.count += 1;
      services.set(row.service_id, entry);
    });
  payments.forEach(({ row, appointment }) => {
    const entry = services.get(appointment.service_id);
    if (entry) entry.cents += metrics.toCents(row.amount);
  });
  const topServices = [...services.values()]
    .sort((a, b) => b.count - a.count || b.cents - a.cents || a.service_id - b.service_id)
    .slice(0, TOP_SERVICES)
    .map(({ cents, ...rest }) => ({ ...rest, revenue: metrics.fromCents(cents) }));

  // Receita por filial e por barbeiro
  const branchTotals = new Map(branches.map((branch) => [branch.id, { branch_id: branch.id, name: branch.name, cents: 0, appointments: 0 }]));
  const barberTotals = new Map();
  const barberEntry = (barber, id) => {
    if (!barberTotals.has(id)) barberTotals.set(id, { barber_id: id, name: barberLabel(barber), cents: 0, appointments: 0 });
    return barberTotals.get(id);
  };
  payments.forEach(({ row, appointment }) => {
    const cents = metrics.toCents(row.amount);
    branchTotals.get(appointment.branch_id).cents += cents;
    barberEntry(appointment.barber || appointment.Barber, appointment.barber_id).cents += cents;
  });
  appointments
    .filter((row) => BOOKED_STATUSES.includes(row.status))
    .forEach((row) => {
      branchTotals.get(row.branch_id).appointments += 1;
      barberEntry(row.barber || row.Barber, row.barber_id).appointments += 1;
    });
  const finish = (entry) => {
    const { cents, ...rest } = entry;
    return { ...rest, revenue: metrics.fromCents(cents) };
  };

  const paidCount = payments.length;
  return {
    period: { from: period.from, to: period.to },
    revenue: {
      total: metrics.fromCents(revenueCents),
      payments: paidCount,
      average_ticket: metrics.fromCents(paidCount ? Math.round(revenueCents / paidCount) : 0),
      by_method: Object.fromEntries(Object.entries(byMethod).map(([method, cents]) => [method, metrics.fromCents(cents)])),
    },
    appointments: { total: appointments.length, by_status: byStatus },
    occupancy: { booked_minutes: bookedMinutes, available_minutes: available, rate: metrics.rate(bookedMinutes, available) },
    top_services: topServices,
    revenue_by_day: metrics.byDay(
      payments.map(({ row, appointment }) => ({ paid_at: row.paid_at, branch_id: appointment.branch_id, amount: row.amount })),
      period.days,
      { instantKey: 'paid_at', tzOf: (row) => tzOf(row.branch_id), amountOf: (row) => metrics.toCents(row.amount) }
    ),
    revenue_by_branch: [...branchTotals.values()].map(finish),
    revenue_by_barber: [...barberTotals.values()].map(finish).sort((a, b) => Number(b.revenue) - Number(a.revenue) || a.barber_id - b.barber_id),
  };
};

/** GET /api/dashboard/summary — dono/admin da barbearia; branch_id opcional restringe a uma filial. */
const summary = async (query, user, now = new Date()) => {
  const period = resolvePeriod(query, now);
  const where = { barbershop_id: query.barbershop_id };
  if (query.branch_id) where.id = query.branch_id;
  // BE-47: gerente de filial vê só as filiais que administra.
  const shop = await Barbershop.findByPk(query.barbershop_id, { attributes: ['id', 'owner_id'] });
  const membership = shop && !ownsBarbershop(user, shop) ? membershipFor(user, shop.id) : null;
  if (membership) {
    if (membership.branch_ids) {
      const allowed = membership.branch_ids.map(Number);
      if (query.branch_id && !allowed.includes(Number(query.branch_id))) throw new ForbiddenError('Sem permissão para esta filial');
      if (!query.branch_id) where.id = allowed;
    }
  } else {
    await assertCanManageBarbershop(user, query.barbershop_id, { access: 'read' });
  }
  const branches = await Branch.findAll({ where, attributes: ['id', 'name', 'timezone'], order: [['id', 'ASC']] });
  if (query.branch_id && !branches.length) throw new NotFoundError('Filial não encontrada');
  const result = await compute({ branches, period });
  // BE-35: no plano sem financial_reports o resumo vem sem o detalhamento financeiro.
  if (!(await require('../subscription/accessControl').hasFeature(query.barbershop_id, 'financial_reports'))) {
    delete result.revenue_by_branch;
    delete result.revenue_by_barber;
    delete result.top_services;
    result.locked_features = ['financial_reports'];
  }
  return result;
};

/** GET /api/dashboard/barber — barbeiro logado (todos os perfis dele, em qualquer filial). */
const barber = async (query, user, now = new Date()) => {
  const period = resolvePeriod(query, now);
  const profiles = await Barber.findAll({ where: { user_id: user.id }, attributes: ['id', 'branch_id'] });
  if (!profiles.length) throw new NotFoundError('Perfil de barbeiro não encontrado');
  const barberIds = profiles.map((profile) => profile.id);
  const branches = await Branch.findAll({
    where: { id: { [Op.in]: [...new Set(profiles.map((profile) => profile.branch_id))] } },
    attributes: ['id', 'name', 'timezone'],
    order: [['id', 'ASC']],
  });
  const result = await compute({ branches, period, appointmentFilter: { barber_id: { [Op.in]: barberIds } }, barberIds });
  delete result.revenue_by_barber;
  return result;
};

module.exports = { summary, barber, resolvePeriod };
