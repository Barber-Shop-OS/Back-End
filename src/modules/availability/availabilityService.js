// BE-13: motor de disponibilidade.
//
// Slot livre = horário da filial ∩ jornada do barbeiro − fechamentos − bloqueios − agendamentos
// `confirmado` − passado/antecedência mínima, dentro do horizonte, numa grade fixa a partir da
// meia-noite local. "Sem preferência" (sem barber_id) = união dos barbeiros que executam o serviço.
//
// `computeSlots` é pura (sem banco): o BE-14 usa a mesma função para revalidar o horário dentro da
// transação de criação, então a regra mostrada ao cliente é exatamente a regra aplicada na reserva.
const { Op } = require('sequelize');
const {
  Branch,
  Barbershop,
  Service,
  Barber,
  BranchOpeningHour,
  BranchClosure,
  BarberWorkingHour,
  BarberTimeOff,
  Appointment,
} = require('../../models');
const time = require('../../shared/time');
const { ValidationError, NotFoundError } = require('../../utils/errorHandler');

const POLICY = Object.freeze({
  minNoticeMin: 30,
  horizonDays: 30,
  stepMin: 15,
});

/** Intervalos [start, end) em minutos do dia; interseção de duas listas. */
const intersect = (a, b) => {
  const result = [];
  for (const x of a) {
    for (const y of b) {
      const start = Math.max(x.start, y.start);
      const end = Math.min(x.end, y.end);
      if (start < end) result.push({ start, end });
    }
  }
  return result.sort((p, q) => p.start - q.start);
};

const toMinuteIntervals = (rows, weekday, startKey, endKey) =>
  rows
    .filter((row) => Number(row.weekday) === weekday)
    .map((row) => ({ start: time.timeToMinutes(row[startKey]), end: time.timeToMinutes(row[endKey]) }));

/**
 * Calcula os horários livres de um dia local.
 * @param {object} input
 * @param {string} input.date            data local YYYY-MM-DD
 * @param {string} input.timezone        fuso da filial
 * @param {number} input.durationMin     duração do serviço
 * @param {Array}  input.openingHours    [{weekday, opens_at, closes_at}] da filial
 * @param {Array}  input.closures        [{date, all_day, start_time, end_time}] da filial
 * @param {Array}  input.barbers         [{id, workingHours:[{weekday,start_time,end_time}], busy:[{start_at,end_at}]}]
 *                                       workingHours vazia = usa o horário da filial; busy = bloqueios + agendamentos
 * @param {Date}   input.now
 * @param {object} [input.policy]        {minNoticeMin, horizonDays, stepMin}
 * @returns {Array<{start_at: string, end_at: string, barber_ids: number[]}>}
 */
const computeSlots = (input) => {
  const { date, durationMin, openingHours = [], closures = [], barbers = [] } = input;
  const timezone = input.timezone || time.DEFAULT_TIMEZONE;
  const now = input.now ? new Date(input.now) : new Date();
  const policy = { ...POLICY, ...(input.policy || {}) };
  const duration = Number(durationMin);
  if (!time.isValidDate(date) || !Number.isInteger(duration) || duration <= 0) return [];

  const today = time.todayIn(timezone, now);
  if (date < today || date > time.addDays(today, policy.horizonDays)) return [];

  const dayClosures = closures.filter((closure) => String(closure.date) === date);
  if (dayClosures.some((closure) => closure.all_day)) return [];

  const weekday = time.weekdayOf(date);
  const branchIntervals = toMinuteIntervals(openingHours, weekday, 'opens_at', 'closes_at');
  if (!branchIntervals.length) return [];

  // Fechamento parcial vira ocupação (UTC) comum a todos os barbeiros.
  const closureBusy = dayClosures.map((closure) => ({
    start: time.localToUtc(date, time.timeToMinutes(closure.start_time), timezone).getTime(),
    end: time.localToUtc(date, time.timeToMinutes(closure.end_time), timezone).getTime(),
  }));
  const earliest = now.getTime() + policy.minNoticeMin * 60000;
  const slots = new Map();

  for (const barber of barbers) {
    const own = barber.workingHours && barber.workingHours.length
      ? toMinuteIntervals(barber.workingHours, weekday, 'start_time', 'end_time')
      : branchIntervals;
    // Jornada do barbeiro sempre limitada pelo horário da filial.
    const windows = intersect(own, branchIntervals);
    const busy = closureBusy.concat(
      (barber.busy || []).map((item) => ({ start: +new Date(item.start_at), end: +new Date(item.end_at) }))
    );

    for (const window of windows) {
      const first = Math.ceil(window.start / policy.stepMin) * policy.stepMin;
      for (let minute = first; minute + duration <= window.end; minute += policy.stepMin) {
        const start = time.localToUtc(date, minute, timezone).getTime();
        const end = start + duration * 60000;
        if (start < earliest) continue;
        if (busy.some((item) => time.overlaps(start, end, item.start, item.end))) continue;
        if (!slots.has(start)) slots.set(start, { end, barber_ids: [] });
        slots.get(start).barber_ids.push(barber.id);
      }
    }
  }

  return [...slots.entries()]
    .sort(([a], [b]) => a - b)
    .map(([start, slot]) => ({
      start_at: new Date(start).toISOString(),
      end_at: new Date(slot.end).toISOString(),
      barber_ids: slot.barber_ids.sort((a, b) => a - b),
    }));
};

/** Barbeiros ativos da filial que executam o serviço (BE-19). */
const findEligibleBarbers = (branchId, serviceId, { barberId, transaction } = {}) =>
  Barber.findAll({
    where: { branch_id: branchId, active: true, ...(barberId ? { id: barberId } : {}) },
    include: [{ model: Service, attributes: [], where: { id: serviceId }, through: { attributes: [] }, required: true }],
    attributes: ['id', 'user_id', 'branch_id'],
    order: [['id', 'ASC']],
    transaction,
  });

/**
 * Carrega do banco tudo o que computeSlots precisa para um dia e um conjunto de barbeiros.
 * `excludeAppointmentId` ignora o próprio agendamento (reagendamento — BE-15).
 */
const loadDayInput = async ({ branch, date, barberIds, excludeAppointmentId, transaction }) => {
  const { start, end } = time.localDayRange(date, branch.timezone);
  const appointmentWhere = {
    barber_id: { [Op.in]: barberIds },
    status: Appointment.STATUS.CONFIRMED,
    start_at: { [Op.lt]: end },
    end_at: { [Op.gt]: start },
  };
  if (excludeAppointmentId) appointmentWhere.id = { [Op.ne]: excludeAppointmentId };

  const [openingHours, closures, workingHours, timeOff, appointments] = await Promise.all([
    BranchOpeningHour.findAll({ where: { branch_id: branch.id }, transaction }),
    BranchClosure.findAll({ where: { branch_id: branch.id, date }, transaction }),
    BarberWorkingHour.findAll({ where: { barber_id: { [Op.in]: barberIds } }, transaction }),
    BarberTimeOff.findAll({
      where: { barber_id: { [Op.in]: barberIds }, start_at: { [Op.lt]: end }, end_at: { [Op.gt]: start } },
      transaction,
    }),
    Appointment.findAll({ where: appointmentWhere, attributes: ['id', 'barber_id', 'start_at', 'end_at'], transaction }),
  ]);

  const byBarber = (rows, barberId) => rows.filter((row) => Number(row.barber_id) === Number(barberId));
  return {
    date,
    timezone: branch.timezone,
    openingHours,
    closures,
    barbers: barberIds.map((id) => ({
      id: Number(id),
      workingHours: byBarber(workingHours, id),
      busy: [...byBarber(timeOff, id), ...byBarber(appointments, id)],
      // Usado pelo "sem preferência" do BE-14 (barbeiro com menos agendamentos no dia).
      appointmentCount: byBarber(appointments, id).length,
    })),
  };
};

/** Filial ativa de barbearia ativa e serviço ativo da mesma barbearia. */
const loadBookingContext = async ({ branchId, serviceId, transaction }) => {
  const branch = await Branch.findByPk(branchId, { include: [{ model: Barbershop }], transaction });
  if (!branch || !branch.active || !branch.Barbershop || branch.Barbershop.status !== 'active') {
    throw new NotFoundError('Filial não encontrada');
  }
  const service = await Service.findByPk(serviceId, { transaction });
  if (!service) throw new NotFoundError('Serviço não encontrado');
  if (String(service.barbershop_id) !== String(branch.barbershop_id)) {
    throw new ValidationError('Este serviço não pertence à barbearia da filial selecionada');
  }
  if (!service.active) throw new ValidationError('Este serviço não está disponível para agendamento');
  return { branch, service };
};

/** GET /api/availability (público). */
const getAvailability = async ({ branch_id, service_id, date, barber_id }, now = new Date()) => {
  if (!time.isValidDate(date)) throw new ValidationError("Campo 'date' deve estar no formato YYYY-MM-DD");
  const { branch, service } = await loadBookingContext({ branchId: branch_id, serviceId: service_id });
  const barbers = await findEligibleBarbers(branch.id, service.id, { barberId: barber_id });
  if (barber_id && !barbers.length) {
    throw new NotFoundError('Barbeiro não encontrado nesta filial ou não realiza este serviço');
  }
  if (!barbers.length) return [];

  const input = await loadDayInput({ branch, date, barberIds: barbers.map((barber) => barber.id) });
  return computeSlots({ ...input, durationMin: service.duration, now });
};

module.exports = {
  POLICY,
  computeSlots,
  intersect,
  findEligibleBarbers,
  loadDayInput,
  loadBookingContext,
  getAvailability,
};
