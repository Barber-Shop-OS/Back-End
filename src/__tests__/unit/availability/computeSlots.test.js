// BE-13: regras do motor de disponibilidade (função pura, sem banco).
const { computeSlots, intersect } = require('../../../modules/availability/availabilityService');

// 2026-12-07 é segunda-feira (weekday 1). São Paulo = UTC-3, Manaus = UTC-4 (sem horário de verão).
const DATE = '2026-12-07';
const NOW = new Date('2026-12-01T12:00:00.000Z');
const weekdays = (opens, closes, days = [0, 1, 2, 3, 4, 5, 6]) =>
  days.map((weekday) => ({ weekday, opens_at: opens, closes_at: closes }));

const base = (overrides = {}) => ({
  date: DATE,
  timezone: 'America/Sao_Paulo',
  durationMin: 30,
  openingHours: weekdays('09:00', '12:00'),
  closures: [],
  barbers: [{ id: 1, workingHours: [], busy: [] }],
  now: NOW,
  ...overrides,
});

const starts = (slots) => slots.map((slot) => slot.start_at);

describe('BE-13 — computeSlots', () => {
  it('grade de 15 min dentro do horário da filial, convertida para UTC', () => {
    const slots = computeSlots(base());
    // 09:00–12:00 local, serviço de 30 min: 09:00 … 11:30 → 11 horários.
    expect(slots).toHaveLength(11);
    expect(slots[0]).toEqual({ start_at: '2026-12-07T12:00:00.000Z', end_at: '2026-12-07T12:30:00.000Z', barber_ids: [1] });
    expect(slots[slots.length - 1].start_at).toBe('2026-12-07T14:30:00.000Z');
  });

  it('dia sem horário de funcionamento (fechado na semana) → vazio', () => {
    expect(computeSlots(base({ openingHours: weekdays('09:00', '12:00', [2, 3, 4]) }))).toEqual([]);
  });

  it('feriado (fechamento o dia todo) → vazio', () => {
    expect(computeSlots(base({ closures: [{ date: DATE, all_day: true }] }))).toEqual([]);
    // Fechamento de outro dia não afeta.
    expect(computeSlots(base({ closures: [{ date: '2026-12-08', all_day: true }] }))).toHaveLength(11);
  });

  it('fechamento parcial remove só o intervalo', () => {
    const slots = computeSlots(
      base({ closures: [{ date: DATE, all_day: false, start_time: '10:00', end_time: '11:00' }] })
    );
    // Livres: 09:00, 09:15, 09:30 (termina 10:00) e 11:00, 11:15, 11:30.
    expect(starts(slots)).toEqual([
      '2026-12-07T12:00:00.000Z',
      '2026-12-07T12:15:00.000Z',
      '2026-12-07T12:30:00.000Z',
      '2026-12-07T14:00:00.000Z',
      '2026-12-07T14:15:00.000Z',
      '2026-12-07T14:30:00.000Z',
    ]);
  });

  it('almoço (bloqueio do barbeiro) e agendamento confirmado ocupam a agenda', () => {
    const slots = computeSlots(
      base({
        openingHours: weekdays('11:00', '14:00'),
        barbers: [
          {
            id: 1,
            workingHours: [],
            busy: [
              { start_at: '2026-12-07T15:00:00.000Z', end_at: '2026-12-07T16:00:00.000Z' }, // almoço 12–13 local
              { start_at: '2026-12-07T14:00:00.000Z', end_at: '2026-12-07T14:30:00.000Z' }, // agendamento 11:00
            ],
          },
        ],
      })
    );
    expect(starts(slots)).toEqual([
      '2026-12-07T14:30:00.000Z', // 11:30
      '2026-12-07T16:00:00.000Z', // 13:00
      '2026-12-07T16:15:00.000Z',
      '2026-12-07T16:30:00.000Z',
    ]);
  });

  it('nenhum slot se sobrepõe a ocupações', () => {
    const busy = [
      { start_at: '2026-12-07T12:10:00.000Z', end_at: '2026-12-07T12:50:00.000Z' },
      { start_at: '2026-12-07T13:40:00.000Z', end_at: '2026-12-07T13:45:00.000Z' },
    ];
    const slots = computeSlots(base({ barbers: [{ id: 1, workingHours: [], busy }] }));
    for (const slot of slots) {
      for (const item of busy) {
        expect(+new Date(slot.start_at) < +new Date(item.end_at) && +new Date(slot.end_at) > +new Date(item.start_at)).toBe(false);
      }
    }
    expect(slots.length).toBeGreaterThan(0);
  });

  it('serviço de 45 min no fim do expediente só entra se couber inteiro', () => {
    const slots = computeSlots(base({ durationMin: 45, openingHours: weekdays('09:00', '10:00') }));
    // 09:00 (→09:45) e 09:15 (→10:00). 09:30 terminaria 10:15.
    expect(starts(slots)).toEqual(['2026-12-07T12:00:00.000Z', '2026-12-07T12:15:00.000Z']);
    expect(slots[1].end_at).toBe('2026-12-07T13:00:00.000Z');
  });

  it('fuso diferente (America/Manaus, UTC-4) converte corretamente', () => {
    const slots = computeSlots(base({ timezone: 'America/Manaus', openingHours: weekdays('09:00', '10:00') }));
    expect(slots[0].start_at).toBe('2026-12-07T13:00:00.000Z');
    expect(slots).toHaveLength(3);
  });

  it('slots no passado e com menos de 30 min de antecedência são descartados', () => {
    // Agora = 10:10 local do próprio dia → primeiro slot válido 10:45 (10:40 + grade).
    const now = new Date('2026-12-07T13:10:00.000Z');
    const slots = computeSlots(base({ now }));
    expect(slots[0].start_at).toBe('2026-12-07T13:45:00.000Z');
    // Dia anterior a hoje → vazio.
    expect(computeSlots(base({ now: new Date('2026-12-08T12:00:00.000Z') }))).toEqual([]);
  });

  it('horizonte de 30 dias', () => {
    expect(computeSlots(base({ date: '2026-12-31' })).length).toBeGreaterThan(0); // hoje + 30
    expect(computeSlots(base({ date: '2027-01-01' }))).toEqual([]); // hoje + 31
  });

  it('jornada do barbeiro é limitada pelo horário da filial', () => {
    const slots = computeSlots(
      base({
        barbers: [{ id: 1, workingHours: [{ weekday: 1, start_time: '10:00', end_time: '13:00' }], busy: [] }],
      })
    );
    // Interseção 10:00–12:00.
    expect(slots[0].start_at).toBe('2026-12-07T13:00:00.000Z');
    expect(slots[slots.length - 1].start_at).toBe('2026-12-07T14:30:00.000Z');
  });

  it('jornada do barbeiro sem o dia → barbeiro indisponível', () => {
    const slots = computeSlots(
      base({ barbers: [{ id: 1, workingHours: [{ weekday: 2, start_time: '09:00', end_time: '12:00' }], busy: [] }] })
    );
    expect(slots).toEqual([]);
  });

  it('"sem preferência" = união com os barbeiros livres em cada horário', () => {
    const slots = computeSlots(
      base({
        openingHours: weekdays('09:00', '10:00'),
        barbers: [
          { id: 2, workingHours: [], busy: [{ start_at: '2026-12-07T12:00:00.000Z', end_at: '2026-12-07T12:30:00.000Z' }] },
          { id: 1, workingHours: [], busy: [] },
        ],
      })
    );
    expect(slots.map((slot) => [slot.start_at, slot.barber_ids])).toEqual([
      ['2026-12-07T12:00:00.000Z', [1]],
      ['2026-12-07T12:15:00.000Z', [1]],
      ['2026-12-07T12:30:00.000Z', [1, 2]],
    ]);
  });

  it('múltiplos intervalos no dia e alinhamento da grade', () => {
    const slots = computeSlots(
      base({
        openingHours: [
          { weekday: 1, opens_at: '09:10', closes_at: '10:00' },
          { weekday: 1, opens_at: '14:00', closes_at: '14:30' },
        ],
      })
    );
    // 09:10 alinha para 09:15; 09:15 e 09:30 cabem. 14:00 cabe.
    expect(starts(slots)).toEqual(['2026-12-07T12:15:00.000Z', '2026-12-07T12:30:00.000Z', '2026-12-07T17:00:00.000Z']);
  });

  it('política pode ser ajustada (usada pela equipe no balcão)', () => {
    const now = new Date('2026-12-07T13:10:00.000Z');
    const slots = computeSlots(base({ now, policy: { minNoticeMin: 0, stepMin: 5 } }));
    expect(slots[0].start_at).toBe('2026-12-07T13:10:00.000Z');
  });

  it('entrada inválida → vazio', () => {
    expect(computeSlots(base({ date: '07/12/2026' }))).toEqual([]);
    expect(computeSlots(base({ durationMin: 0 }))).toEqual([]);
    expect(computeSlots(base({ barbers: [] }))).toEqual([]);
  });

  it('desempenho: 10 barbeiros com agenda cheia em < 300 ms', () => {
    const barbers = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      workingHours: [],
      busy: Array.from({ length: 20 }, (__, j) => ({
        start_at: new Date(Date.UTC(2026, 11, 7, 11, j * 30)).toISOString(),
        end_at: new Date(Date.UTC(2026, 11, 7, 11, j * 30 + 15)).toISOString(),
      })),
    }));
    const started = Date.now();
    computeSlots(base({ openingHours: weekdays('08:00', '20:00'), barbers }));
    expect(Date.now() - started).toBeLessThan(300);
  });

  it('intersect', () => {
    expect(intersect([{ start: 0, end: 100 }], [{ start: 50, end: 150 }, { start: 200, end: 300 }])).toEqual([
      { start: 50, end: 100 },
    ]);
  });
});
