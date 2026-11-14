// BE-11: jornada do barbeiro contida no horário da filial; jornada efetiva.
const { validateBarberWeek, effectiveWorkingHours } = require('../../../modules/barberSchedule/barberScheduleService');

const branchHours = [
  { weekday: 1, opens_at: '09:00', closes_at: '12:00' },
  { weekday: 1, opens_at: '13:00', closes_at: '19:00' },
];

describe('BE-11 — validateBarberWeek', () => {
  it('aceita jornada dentro de um intervalo da filial', () => {
    expect(validateBarberWeek([{ weekday: 1, start_time: '14:00', end_time: '19:00' }], branchHours)).toEqual([
      { weekday: 1, start_time: '14:00', end_time: '19:00' },
    ]);
  });

  it.each([
    [{ weekday: 1, start_time: '08:00', end_time: '12:00' }], // começa antes de abrir
    [{ weekday: 1, start_time: '11:00', end_time: '14:00' }], // atravessa o almoço da filial
    [{ weekday: 1, start_time: '18:00', end_time: '20:00' }], // passa do fechamento
    [{ weekday: 2, start_time: '10:00', end_time: '11:00' }], // filial fechada no dia
  ])('jornada fora do horário da filial %p → 400', (interval) => {
    expect(() => validateBarberWeek([interval], branchHours)).toThrow(expect.objectContaining({ statusCode: 400 }));
  });

  it('sobreposição na própria jornada → 400', () => {
    expect(() =>
      validateBarberWeek(
        [
          { weekday: 1, start_time: '13:00', end_time: '16:00' },
          { weekday: 1, start_time: '15:00', end_time: '18:00' },
        ],
        branchHours
      )
    ).toThrow(expect.objectContaining({ statusCode: 400 }));
  });
});

describe('BE-11 — effectiveWorkingHours', () => {
  it('sem jornada própria usa a da filial', () => {
    expect(effectiveWorkingHours([], branchHours)).toEqual({
      uses_branch_hours: true,
      working_hours: [
        { weekday: 1, start_time: '09:00', end_time: '12:00' },
        { weekday: 1, start_time: '13:00', end_time: '19:00' },
      ],
    });
  });

  it('com jornada própria usa só ela', () => {
    const own = [{ weekday: 1, start_time: '14:00', end_time: '18:00', id: 3, barber_id: 1 }];
    expect(effectiveWorkingHours(own, branchHours)).toEqual({
      uses_branch_hours: false,
      working_hours: [{ weekday: 1, start_time: '14:00', end_time: '18:00' }],
    });
  });
});
