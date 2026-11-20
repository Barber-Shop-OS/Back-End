// BE-11: jornada semanal do barbeiro e bloqueios de agenda.
// - Jornada: horário local da filial; precisa caber no horário de funcionamento; vazia = usa o da filial.
// - Bloqueio: intervalo UTC; sobre agendamento confirmado → 409 com a lista de conflitos.
const { Op } = require('sequelize');
const { sequelize, Barber, Branch, Appointment, BarberWorkingHour, BarberTimeOff } = require('../../models');
const { assertCanManageBarber, assertCanManageBarberAgenda } = require('../../shared/authz');
const { validateWeek, findOpeningHours } = require('../branchSchedule/branchScheduleService');
const time = require('../../shared/time');
const { ValidationError, NotFoundError, ConflictError, CODES } = require('../../utils/errorHandler');

const toBranchShape = (intervals) =>
  intervals.map((item) => ({ weekday: item.weekday, opens_at: item.start_time, closes_at: item.end_time }));
const toBarberShape = (intervals) =>
  intervals.map((item) => ({ weekday: item.weekday, start_time: item.opens_at, end_time: item.closes_at }));

/**
 * Valida a jornada contra o horário da filial (função pura).
 * Cada intervalo do barbeiro precisa estar inteiro dentro de um intervalo da filial no mesmo dia.
 */
const validateBarberWeek = (intervals = [], branchHours = []) => {
  const week = toBarberShape(validateWeek(toBranchShape(intervals)));
  for (const interval of week) {
    const start = time.timeToMinutes(interval.start_time);
    const end = time.timeToMinutes(interval.end_time);
    const fits = branchHours.some(
      (open) =>
        Number(open.weekday) === interval.weekday &&
        start >= time.timeToMinutes(open.opens_at) &&
        end <= time.timeToMinutes(open.closes_at)
    );
    if (!fits) {
      throw new ValidationError(
        `Jornada fora do horário de funcionamento da filial no dia ${interval.weekday} (${interval.start_time}–${interval.end_time})`
      );
    }
  }
  return week;
};

/** Jornada efetiva: a do barbeiro ou, se vazia, a da filial (função pura). */
const effectiveWorkingHours = (barberHours = [], branchHours = []) =>
  barberHours.length
    ? { uses_branch_hours: false, working_hours: barberHours.map(({ weekday, start_time, end_time }) => ({ weekday, start_time, end_time })) }
    : { uses_branch_hours: true, working_hours: toBarberShape(branchHours) };

const findBarberHours = (barberId, options = {}) =>
  BarberWorkingHour.findAll({
    where: { barber_id: barberId },
    order: [['weekday', 'ASC'], ['start_time', 'ASC']],
    ...options,
  });

const loadActiveBarber = async (barberId) => {
  const barber = await Barber.findByPk(barberId, { include: [{ model: Branch }] });
  if (!barber || !barber.active) throw new NotFoundError('Barbeiro não encontrado');
  return barber;
};

/** GET público (a página de agendamento usa). */
const getWorkingHours = async (barberId) => {
  const barber = await loadActiveBarber(barberId);
  const [barberHours, branchHours] = await Promise.all([findBarberHours(barber.id), findOpeningHours(barber.branch_id)]);
  return {
    barber_id: barber.id,
    branch_id: barber.branch_id,
    timezone: barber.Branch ? barber.Branch.timezone : time.DEFAULT_TIMEZONE,
    ...effectiveWorkingHours(barberHours, branchHours),
  };
};

/** PUT: só o dono. Lista vazia volta a usar o horário da filial. */
const replaceWorkingHours = async (barberId, intervals, currentUser) => {
  const barber = await assertCanManageBarber(currentUser, barberId);
  const branchHours = await findOpeningHours(barber.branch_id);
  const week = validateBarberWeek(intervals, branchHours);
  await sequelize.transaction(async (transaction) => {
    await BarberWorkingHour.destroy({ where: { barber_id: barber.id }, transaction });
    if (week.length) {
      await BarberWorkingHour.bulkCreate(week.map((interval) => ({ ...interval, barber_id: barber.id })), { transaction });
    }
  });
  return getWorkingHours(barber.id);
};

const serializeTimeOff = (row) => ({
  id: row.id,
  barber_id: row.barber_id,
  start_at: row.start_at,
  end_at: row.end_at,
  reason: row.reason,
});

const listTimeOff = async (barberId, { from, to } = {}, currentUser) => {
  await assertCanManageBarberAgenda(currentUser, barberId, { access: 'read' });
  const where = { barber_id: barberId };
  if (from) where.end_at = { [Op.gt]: new Date(from) };
  if (to) where.start_at = { [Op.lt]: new Date(to) };
  const rows = await BarberTimeOff.findAll({ where, order: [['start_at', 'ASC']] });
  return rows.map(serializeTimeOff);
};

/** Agendamentos confirmados do barbeiro que se sobrepõem a [start, end). */
const findConflictingAppointments = (barberId, start, end, options = {}) =>
  Appointment.findAll({
    where: {
      barber_id: barberId,
      status: Appointment.STATUS.CONFIRMED,
      start_at: { [Op.lt]: end },
      end_at: { [Op.gt]: start },
    },
    attributes: ['id', 'start_at', 'end_at', 'user_id'],
    order: [['start_at', 'ASC']],
    ...options,
  });

const createTimeOff = async (barberId, data, currentUser) => {
  const barber = await assertCanManageBarberAgenda(currentUser, barberId);
  const start = new Date(data.start_at);
  const end = new Date(data.end_at);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new ValidationError('start_at e end_at devem ser datas ISO 8601');
  }
  if (start >= end) throw new ValidationError('start_at deve ser antes de end_at');
  if (end.getTime() - start.getTime() > 90 * 24 * 60 * 60 * 1000) {
    throw new ValidationError('Bloqueio não pode passar de 90 dias');
  }

  const conflicts = await findConflictingAppointments(barber.id, start, end);
  if (conflicts.length) {
    throw new ConflictError('O bloqueio coincide com agendamentos confirmados', CODES.TIME_OFF_CONFLICT, {
      appointments: conflicts.map((appt) => ({ id: appt.id, start_at: appt.start_at, end_at: appt.end_at })),
    });
  }

  const row = await BarberTimeOff.create({
    barber_id: barber.id,
    start_at: start,
    end_at: end,
    reason: data.reason ? String(data.reason).trim() : null,
    created_by: currentUser.id,
  });
  return serializeTimeOff(row);
};

const removeTimeOff = async (barberId, timeOffId, currentUser) => {
  await assertCanManageBarberAgenda(currentUser, barberId);
  const row = await BarberTimeOff.findOne({ where: { id: timeOffId, barber_id: barberId } });
  if (!row) throw new NotFoundError('Bloqueio não encontrado');
  await row.destroy();
  return true;
};

module.exports = {
  validateBarberWeek,
  effectiveWorkingHours,
  findBarberHours,
  findConflictingAppointments,
  getWorkingHours,
  replaceWorkingHours,
  listTimeOff,
  createTimeOff,
  removeTimeOff,
};
