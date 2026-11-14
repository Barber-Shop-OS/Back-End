// BE-12: conversões de fuso da filial ↔ UTC.
const time = require('../../../shared/time');

describe('BE-12 — shared/time', () => {
  it('horário local de São Paulo (UTC-3) vira UTC', () => {
    expect(time.localToUtc('2026-11-20', 9 * 60, 'America/Sao_Paulo').toISOString()).toBe('2026-11-20T12:00:00.000Z');
  });

  it('Manaus (UTC-4) é diferente de São Paulo', () => {
    expect(time.localToUtc('2026-11-20', 9 * 60, 'America/Manaus').toISOString()).toBe('2026-11-20T13:00:00.000Z');
  });

  it('toLocalParts devolve data, hora, minutos e dia da semana no fuso', () => {
    // 02:30 UTC de sábado = 23:30 de sexta em São Paulo.
    expect(time.toLocalParts(new Date('2026-11-21T02:30:00Z'), 'America/Sao_Paulo')).toEqual({
      date: '2026-11-20',
      time: '23:30',
      minutes: 23 * 60 + 30,
      weekday: 5,
    });
  });

  it('localDayRange cobre exatamente 24 h do dia local', () => {
    const { start, end } = time.localDayRange('2026-11-20', 'America/Sao_Paulo');
    expect(start.toISOString()).toBe('2026-11-20T03:00:00.000Z');
    expect(end.toISOString()).toBe('2026-11-21T03:00:00.000Z');
  });

  it('timeToMinutes / minutesToTime', () => {
    expect(time.timeToMinutes('08:30')).toBe(510);
    expect(time.timeToMinutes('23:59:00')).toBe(1439);
    expect(time.minutesToTime(510)).toBe('08:30');
    expect(() => time.timeToMinutes('24:00')).toThrow();
    expect(() => time.timeToMinutes('8h')).toThrow();
  });

  it('validações de data e fuso', () => {
    expect(time.isValidDate('2026-02-28')).toBe(true);
    expect(time.isValidDate('2026-02-30')).toBe(false);
    expect(time.isValidTimezone('America/Manaus')).toBe(true);
    expect(time.isValidTimezone('Marte/Olympus')).toBe(false);
    expect(time.weekdayOf('2026-11-22')).toBe(0);
    expect(time.addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(time.todayIn('America/Sao_Paulo', new Date('2026-11-21T02:00:00Z'))).toBe('2026-11-20');
  });

  it('overlaps trata intervalos semiabertos', () => {
    expect(time.overlaps(0, 10, 10, 20)).toBe(false);
    expect(time.overlaps(0, 11, 10, 20)).toBe(true);
    expect(time.overlaps(new Date(5), new Date(6), new Date(0), new Date(10))).toBe(true);
    expect(time.addMinutes(new Date('2026-01-01T00:00:00Z'), 45).toISOString()).toBe('2026-01-01T00:45:00.000Z');
  });
});
