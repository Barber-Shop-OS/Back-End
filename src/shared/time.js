// BE-12: única porta de conversão entre o horário local da filial e UTC.
// Banco e API sempre em UTC (ISO 8601 com Z). Regras de agenda (horário de funcionamento, jornada,
// "aberta agora", agrupamento por dia) são calculadas no fuso da filial.
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const customParseFormat = require('dayjs/plugin/customParseFormat');

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

const DEFAULT_TIMEZONE = 'America/Sao_Paulo';
const DATE_FORMAT = 'YYYY-MM-DD';
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

const isValidTimezone = (tz) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return typeof tz === 'string' && tz.length > 0;
  } catch {
    return false;
  }
};

const isValidDate = (value) => dayjs(value, DATE_FORMAT, true).isValid();

/** "HH:mm" ou "HH:mm:ss" → minutos desde 00:00. Lança erro se inválido. */
const timeToMinutes = (value) => {
  const match = TIME_RE.exec(String(value));
  if (!match) throw new Error(`Horário inválido: ${value}`);
  return Number(match[1]) * 60 + Number(match[2]);
};

/** Minutos desde 00:00 → "HH:mm". */
const minutesToTime = (minutes) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

/** Data local ("2026-11-20") + minutos do dia no fuso → instante UTC (Date). */
const localToUtc = (date, minutes, tz = DEFAULT_TIMEZONE) =>
  dayjs.tz(`${date} ${minutesToTime(minutes)}`, `${DATE_FORMAT} HH:mm`, tz).toDate();

/** Instante → partes no fuso da filial. weekday: 0 = domingo. */
const toLocalParts = (instant, tz = DEFAULT_TIMEZONE) => {
  const local = dayjs(instant).tz(tz);
  return {
    date: local.format(DATE_FORMAT),
    time: local.format('HH:mm'),
    minutes: local.hour() * 60 + local.minute(),
    weekday: local.day(),
  };
};

/** Dia da semana (0 = domingo) de uma data local. */
const weekdayOf = (date) => dayjs(date, DATE_FORMAT, true).day();

/** [início, fim) do dia local em UTC. */
const localDayRange = (date, tz = DEFAULT_TIMEZONE) => {
  const start = dayjs.tz(date, DATE_FORMAT, tz);
  return { start: start.toDate(), end: start.add(1, 'day').toDate() };
};

/** Data de hoje no fuso. */
const todayIn = (tz = DEFAULT_TIMEZONE, now = new Date()) => dayjs(now).tz(tz).format(DATE_FORMAT);

const addDays = (date, days) => dayjs(date, DATE_FORMAT, true).add(days, 'day').format(DATE_FORMAT);

const addMinutes = (instant, minutes) => new Date(new Date(instant).getTime() + minutes * 60000);

/** Intervalos [aStart, aEnd) e [bStart, bEnd) se sobrepõem? Aceita Date ou número. */
const overlaps = (aStart, aEnd, bStart, bEnd) => +aStart < +bEnd && +aEnd > +bStart;

module.exports = {
  dayjs,
  DEFAULT_TIMEZONE,
  DATE_FORMAT,
  isValidTimezone,
  isValidDate,
  timeToMinutes,
  minutesToTime,
  localToUtc,
  toLocalParts,
  weekdayOf,
  localDayRange,
  todayIn,
  addDays,
  addMinutes,
  overlaps,
};
