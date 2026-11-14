// BE-10: regras puras de semana de funcionamento, fechamentos e "aberta agora".
const { validateWeek, validateClosure, isOpenAt } = require('../../../modules/branchSchedule/branchScheduleService');

describe('BE-10 — validateWeek', () => {
  it('aceita vários intervalos por dia e ordena', () => {
    expect(
      validateWeek([
        { weekday: 1, opens_at: '13:00', closes_at: '19:00' },
        { weekday: 1, opens_at: '09:00', closes_at: '12:00' },
        { weekday: 0, opens_at: '10:00', closes_at: '14:00' },
      ])
    ).toEqual([
      { weekday: 0, opens_at: '10:00', closes_at: '14:00' },
      { weekday: 1, opens_at: '09:00', closes_at: '12:00' },
      { weekday: 1, opens_at: '13:00', closes_at: '19:00' },
    ]);
  });

  it('intervalos encostados (12:00–12:00) não são sobreposição', () => {
    expect(() =>
      validateWeek([
        { weekday: 2, opens_at: '09:00', closes_at: '12:00' },
        { weekday: 2, opens_at: '12:00', closes_at: '18:00' },
      ])
    ).not.toThrow();
  });

  it('sobreposição no mesmo dia → 400', () => {
    expect(() =>
      validateWeek([
        { weekday: 2, opens_at: '09:00', closes_at: '13:00' },
        { weekday: 2, opens_at: '12:00', closes_at: '18:00' },
      ])
    ).toThrow(expect.objectContaining({ statusCode: 400 }));
  });

  it('mesmo horário em dias diferentes não é sobreposição', () => {
    expect(() =>
      validateWeek([
        { weekday: 2, opens_at: '09:00', closes_at: '18:00' },
        { weekday: 3, opens_at: '09:00', closes_at: '18:00' },
      ])
    ).not.toThrow();
  });

  it.each([
    [{ weekday: 1, opens_at: '18:00', closes_at: '09:00' }],
    [{ weekday: 1, opens_at: '09:00', closes_at: '09:00' }],
    [{ weekday: 7, opens_at: '09:00', closes_at: '10:00' }],
    [{ weekday: 1, opens_at: '9h', closes_at: '10:00' }],
  ])('intervalo inválido %p → 400', (interval) => {
    expect(() => validateWeek([interval])).toThrow(expect.objectContaining({ statusCode: 400 }));
  });
});

describe('BE-10 — validateClosure', () => {
  it('dia inteiro zera horários', () => {
    expect(validateClosure({ date: '2026-12-25', start_time: '10:00' })).toMatchObject({
      all_day: true,
      start_time: null,
      end_time: null,
    });
  });

  it('parcial exige início < fim', () => {
    expect(validateClosure({ date: '2026-12-24', all_day: false, start_time: '14:00', end_time: '18:00' })).toMatchObject({
      all_day: false,
      start_time: '14:00',
      end_time: '18:00',
    });
    expect(() => validateClosure({ date: '2026-12-24', all_day: false, start_time: '18:00', end_time: '14:00' })).toThrow();
    expect(() => validateClosure({ date: '2026-12-24', all_day: false })).toThrow();
    expect(() => validateClosure({ date: '2026-02-30' })).toThrow();
  });
});

describe('BE-10 — isOpenAt', () => {
  const openingHours = [
    { weekday: 5, opens_at: '09:00', closes_at: '12:00' },
    { weekday: 5, opens_at: '13:00', closes_at: '19:00' },
  ];
  // Sexta 2026-11-20. São Paulo = UTC-3.
  const at = (iso) => new Date(iso);

  it('aberta dentro do intervalo, fechada no almoço e após o expediente', () => {
    const tz = 'America/Sao_Paulo';
    expect(isOpenAt({ openingHours, timezone: tz }, at('2026-11-20T13:00:00Z'))).toBe(true); // 10:00
    expect(isOpenAt({ openingHours, timezone: tz }, at('2026-11-20T15:30:00Z'))).toBe(false); // 12:30
    expect(isOpenAt({ openingHours, timezone: tz }, at('2026-11-20T22:00:00Z'))).toBe(false); // 19:00
  });

  it('respeita o fuso: 12:30 UTC é 09:30 em SP (aberta) e 08:30 em Manaus (fechada)', () => {
    expect(isOpenAt({ openingHours, timezone: 'America/Sao_Paulo' }, at('2026-11-20T12:30:00Z'))).toBe(true);
    expect(isOpenAt({ openingHours, timezone: 'America/Manaus' }, at('2026-11-20T12:30:00Z'))).toBe(false);
  });

  it('fechamento do dia (inteiro ou parcial) prevalece', () => {
    const tz = 'America/Sao_Paulo';
    const allDay = [{ date: '2026-11-20', all_day: true }];
    const partial = [{ date: '2026-11-20', all_day: false, start_time: '09:00', end_time: '11:00' }];
    expect(isOpenAt({ openingHours, closures: allDay, timezone: tz }, at('2026-11-20T13:00:00Z'))).toBe(false);
    expect(isOpenAt({ openingHours, closures: partial, timezone: tz }, at('2026-11-20T13:00:00Z'))).toBe(false);
    expect(isOpenAt({ openingHours, closures: partial, timezone: tz }, at('2026-11-20T14:30:00Z'))).toBe(true);
  });
});
