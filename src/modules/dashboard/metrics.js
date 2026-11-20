// BE-24: cálculos puros das métricas (sem banco) — testáveis com fixtures conhecidas.
const time = require('../../shared/time');
const { intersect } = require('../availability/availabilityService');

const MAX_RANGE_DAYS = 366;

const toCents = (value) => Math.round(Number(value || 0) * 100);
const fromCents = (cents) => (cents / 100).toFixed(2);

/** Lista de datas locais [from, to] inclusive. */
const daysBetween = (from, to) => {
  const days = [];
  for (let day = from; day <= to; day = time.addDays(day, 1)) days.push(day);
  return days;
};

const toMinuteIntervals = (rows, weekday, startKey, endKey) =>
  rows
    .filter((row) => Number(row.weekday) === weekday)
    .map((row) => ({ start: time.timeToMinutes(row[startKey]), end: time.timeToMinutes(row[endKey]) }));

/** Soma do comprimento (ms) de intervalos, após subtrair os ocupados. */
const subtract = (windows, blocks) => {
  let pieces = windows.map((window) => ({ ...window }));
  for (const block of blocks) {
    const next = [];
    for (const piece of pieces) {
      if (block.end <= piece.start || block.start >= piece.end) {
        next.push(piece);
        continue;
      }
      if (block.start > piece.start) next.push({ start: piece.start, end: block.start });
      if (block.end < piece.end) next.push({ start: block.end, end: piece.end });
    }
    pieces = next;
  }
  return pieces;
};

/**
 * Minutos disponíveis de atendimento num dia local, somados entre os barbeiros:
 * horário da filial ∩ jornada do barbeiro − fechamentos − bloqueios (mesma regra do BE-13).
 * @param {object} input {date, timezone, openingHours, closures, barbers:[{workingHours, timeOff}]}
 */
const availableMinutesForDay = ({ date, timezone, openingHours = [], closures = [], barbers = [] }) => {
  const tz = timezone || time.DEFAULT_TIMEZONE;
  const dayClosures = closures.filter((closure) => String(closure.date) === date);
  if (dayClosures.some((closure) => closure.all_day)) return 0;
  const weekday = time.weekdayOf(date);
  const branchIntervals = toMinuteIntervals(openingHours, weekday, 'opens_at', 'closes_at');
  if (!branchIntervals.length) return 0;
  const toUtc = (minute) => time.localToUtc(date, minute, tz).getTime();
  const closureBlocks = dayClosures.map((closure) => ({
    start: toUtc(time.timeToMinutes(closure.start_time)),
    end: toUtc(time.timeToMinutes(closure.end_time)),
  }));

  let totalMs = 0;
  for (const barber of barbers) {
    const own = barber.workingHours && barber.workingHours.length
      ? toMinuteIntervals(barber.workingHours, weekday, 'start_time', 'end_time')
      : branchIntervals;
    const windows = intersect(own, branchIntervals).map((window) => ({ start: toUtc(window.start), end: toUtc(window.end) }));
    const blocks = closureBlocks.concat(
      (barber.timeOff || []).map((item) => ({ start: +new Date(item.start_at), end: +new Date(item.end_at) }))
    );
    totalMs += subtract(windows, blocks).reduce((sum, piece) => sum + (piece.end - piece.start), 0);
  }
  return Math.round(totalMs / 60000);
};

/** Agrupa valores (centavos) por dia local, preenchendo dias sem movimento com zero. */
const byDay = (rows, days, { instantKey, tzOf, amountOf }) => {
  const totals = new Map(days.map((day) => [day, 0]));
  for (const row of rows) {
    const day = time.toLocalParts(row[instantKey], tzOf(row)).date;
    if (totals.has(day)) totals.set(day, totals.get(day) + amountOf(row));
  }
  return [...totals.entries()].map(([date, cents]) => ({ date, amount: fromCents(cents) }));
};

const rate = (part, whole) => (whole > 0 ? Math.round((part / whole) * 10000) / 10000 : 0);

module.exports = { MAX_RANGE_DAYS, toCents, fromCents, daysBetween, availableMinutesForDay, subtract, byDay, rate };
