// BE-10: horário de funcionamento e fechamentos da filial.
// Horários são locais (fuso da filial, "HH:mm"); intervalos semiabertos [opens_at, closes_at).
const { Op } = require('sequelize');
const { sequelize, Branch, BranchOpeningHour, BranchClosure } = require('../../models');
const { assertCanManageBranch } = require('../../shared/authz');
const { pickFields } = require('../../shared/pickFields');
const time = require('../../shared/time');
const { ValidationError, NotFoundError } = require('../../utils/errorHandler');

const toMinutes = (value, field) => {
  try {
    return time.timeToMinutes(value);
  } catch {
    throw new ValidationError(`Campo '${field}' deve estar no formato HH:mm`);
  }
};

/**
 * Valida e normaliza uma semana de intervalos. Regras: weekday 0–6, opens < closes,
 * sem sobreposição no mesmo dia. Retorna os intervalos ordenados (weekday, opens_at).
 * Função pura (testável sem banco).
 */
const validateWeek = (intervals = []) => {
  const normalized = intervals.map((item, index) => {
    const weekday = Number(item.weekday);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      throw new ValidationError(`Intervalo ${index + 1}: weekday deve ser de 0 (domingo) a 6 (sábado)`);
    }
    const opens = toMinutes(item.opens_at, 'opens_at');
    const closes = toMinutes(item.closes_at, 'closes_at');
    if (opens >= closes) {
      throw new ValidationError(`Intervalo ${index + 1}: opens_at deve ser antes de closes_at`, [
        { field: `opening_hours.${index}`, message: 'opens_at deve ser antes de closes_at' },
      ]);
    }
    return { weekday, opens, closes };
  });

  normalized.sort((a, b) => a.weekday - b.weekday || a.opens - b.opens);
  for (let i = 1; i < normalized.length; i += 1) {
    const prev = normalized[i - 1];
    const curr = normalized[i];
    if (prev.weekday === curr.weekday && curr.opens < prev.closes) {
      throw new ValidationError(
        `Intervalos sobrepostos no dia ${curr.weekday}: ${time.minutesToTime(prev.opens)}–${time.minutesToTime(prev.closes)} e ${time.minutesToTime(curr.opens)}–${time.minutesToTime(curr.closes)}`
      );
    }
  }

  return normalized.map(({ weekday, opens, closes }) => ({
    weekday,
    opens_at: time.minutesToTime(opens),
    closes_at: time.minutesToTime(closes),
  }));
};

/** Valida um fechamento. Dia inteiro não tem horários; parcial exige start_time < end_time. */
const validateClosure = (data) => {
  if (data.date !== undefined && !time.isValidDate(data.date)) {
    throw new ValidationError("Campo 'date' deve estar no formato YYYY-MM-DD");
  }
  const allDay = data.all_day === undefined ? true : Boolean(data.all_day);
  if (allDay) {
    return { ...data, all_day: true, start_time: null, end_time: null };
  }
  if (!data.start_time || !data.end_time) {
    throw new ValidationError('Fechamento parcial exige start_time e end_time');
  }
  const start = toMinutes(data.start_time, 'start_time');
  const end = toMinutes(data.end_time, 'end_time');
  if (start >= end) throw new ValidationError('start_time deve ser antes de end_time');
  return { ...data, all_day: false, start_time: time.minutesToTime(start), end_time: time.minutesToTime(end) };
};

/**
 * A filial está aberta neste instante? Considera o horário semanal e os fechamentos do dia.
 * Função pura: recebe os dados já carregados.
 */
const isOpenAt = ({ openingHours = [], closures = [], timezone = time.DEFAULT_TIMEZONE }, instant = new Date()) => {
  const local = time.toLocalParts(instant, timezone);
  const inInterval = (startText, endText) =>
    local.minutes >= time.timeToMinutes(startText) && local.minutes < time.timeToMinutes(endText);

  const closedNow = closures
    .filter((closure) => String(closure.date) === local.date)
    .some((closure) => closure.all_day || inInterval(closure.start_time, closure.end_time));
  if (closedNow) return false;

  return openingHours
    .filter((interval) => Number(interval.weekday) === local.weekday)
    .some((interval) => inInterval(interval.opens_at, interval.closes_at));
};

const loadBranch = async (branchId) => {
  const branch = await Branch.findByPk(branchId);
  if (!branch) throw new NotFoundError('Filial não encontrada');
  return branch;
};

const serializeHours = (rows) =>
  rows.map((row) => ({ weekday: row.weekday, opens_at: row.opens_at, closes_at: row.closes_at }));

const findOpeningHours = (branchId, options = {}) =>
  BranchOpeningHour.findAll({
    where: { branch_id: branchId },
    order: [['weekday', 'ASC'], ['opens_at', 'ASC']],
    ...options,
  });

/** GET público. */
const getOpeningHours = async (branchId) => {
  const branch = await loadBranch(branchId);
  const rows = await findOpeningHours(branchId);
  return { branch_id: branch.id, timezone: branch.timezone, opening_hours: serializeHours(rows) };
};

/** PUT: substitui a semana inteira numa transação. */
const replaceOpeningHours = async (branchId, intervals, currentUser) => {
  const branch = await assertCanManageBranch(currentUser, branchId);
  const week = validateWeek(intervals);
  await sequelize.transaction(async (transaction) => {
    await BranchOpeningHour.destroy({ where: { branch_id: branch.id }, transaction });
    if (week.length) {
      await BranchOpeningHour.bulkCreate(
        week.map((interval) => ({ ...interval, branch_id: branch.id })),
        { transaction }
      );
    }
  });
  return getOpeningHours(branch.id);
};

const CLOSURE_FIELDS = ['date', 'reason', 'all_day', 'start_time', 'end_time'];

const serializeClosure = (closure) => ({
  id: closure.id,
  branch_id: closure.branch_id,
  date: closure.date,
  reason: closure.reason,
  all_day: Boolean(closure.all_day),
  start_time: closure.start_time,
  end_time: closure.end_time,
});

/** Fechamentos no período [from, to] (datas locais). Público: a agenda precisa deles. */
const listClosures = async (branchId, { from, to } = {}) => {
  await loadBranch(branchId);
  const where = { branch_id: branchId };
  if (from || to) {
    where.date = {};
    if (from) where.date[Op.gte] = from;
    if (to) where.date[Op.lte] = to;
  }
  const rows = await BranchClosure.findAll({ where, order: [['date', 'ASC'], ['start_time', 'ASC']] });
  return rows.map(serializeClosure);
};

const createClosure = async (branchId, data, currentUser) => {
  const branch = await assertCanManageBranch(currentUser, branchId);
  const payload = validateClosure(pickFields(data, CLOSURE_FIELDS));
  if (!payload.date) throw new ValidationError("Campo 'date' é obrigatório");
  const closure = await BranchClosure.create({ ...payload, reason: payload.reason || null, branch_id: branch.id });
  return serializeClosure(closure);
};

const loadClosure = async (branchId, closureId) => {
  const closure = await BranchClosure.findOne({ where: { id: closureId, branch_id: branchId } });
  if (!closure) throw new NotFoundError('Fechamento não encontrado');
  return closure;
};

const updateClosure = async (branchId, closureId, data, currentUser) => {
  await assertCanManageBranch(currentUser, branchId);
  const closure = await loadClosure(branchId, closureId);
  const merged = {
    date: closure.date,
    reason: closure.reason,
    all_day: closure.all_day,
    start_time: closure.start_time,
    end_time: closure.end_time,
    ...pickFields(data, CLOSURE_FIELDS),
  };
  await closure.update(validateClosure(merged));
  return serializeClosure(closure);
};

const removeClosure = async (branchId, closureId, currentUser) => {
  await assertCanManageBranch(currentUser, branchId);
  const closure = await loadClosure(branchId, closureId);
  await closure.destroy();
  return true;
};

module.exports = {
  validateWeek,
  validateClosure,
  isOpenAt,
  findOpeningHours,
  getOpeningHours,
  replaceOpeningHours,
  listClosures,
  createClosure,
  updateClosure,
  removeClosure,
};
