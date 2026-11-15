// BE-16: convite de calendário (.ics, RFC 5545) anexado à confirmação do agendamento.
const escapeText = (value) =>
  String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');

/** 2026-12-10T14:00:00.000Z → 20261210T140000Z */
const formatUtc = (instant) => new Date(instant).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** Linhas com mais de 75 octetos são dobradas (RFC 5545 §3.1). */
const fold = (line) => {
  const chunks = [];
  let rest = line;
  while (Buffer.byteLength(rest, 'utf8') > 75) {
    let cut = 75;
    while (Buffer.byteLength(rest.slice(0, cut), 'utf8') > 75) cut -= 1;
    chunks.push(rest.slice(0, cut));
    rest = ` ${rest.slice(cut)}`;
  }
  chunks.push(rest);
  return chunks.join('\r\n');
};

/**
 * @param {object} event { uid, start, end, summary, description?, location?, sequence?, method? }
 * @returns {string} conteúdo do arquivo .ics (CRLF)
 */
const buildEvent = ({ uid, start, end, summary, description, location, sequence = 0, now = new Date(), cancelled = false }) =>
  [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BarberOS//Agendamentos//PT-BR',
    'CALSCALE:GREGORIAN',
    `METHOD:${cancelled ? 'CANCEL' : 'PUBLISH'}`,
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `SEQUENCE:${sequence}`,
    `DTSTAMP:${formatUtc(now)}`,
    `DTSTART:${formatUtc(start)}`,
    `DTEND:${formatUtc(end)}`,
    `SUMMARY:${escapeText(summary)}`,
    description ? `DESCRIPTION:${escapeText(description)}` : null,
    location ? `LOCATION:${escapeText(location)}` : null,
    `STATUS:${cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .map(fold)
    .join('\r\n')
    .concat('\r\n');

module.exports = { buildEvent, escapeText, formatUtc };
