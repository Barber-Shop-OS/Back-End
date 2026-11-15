// BE-15: máquina de estados para cada papel × estado × ação.
const sm = require('../../../modules/appointment/appointmentStateMachine');

const NOW = new Date('2026-12-01T12:00:00.000Z');
const hours = (h) => new Date(NOW.getTime() + h * 3600000).toISOString();
const appt = (status, startInHours) => ({ status, start_at: hours(startInHours) });
const { CANCEL, RESCHEDULE, COMPLETE, NO_SHOW } = sm.ACTIONS;
const { CLIENT, STAFF } = sm.ROLES;
const code = (appointment, role, action, now = NOW) => {
  const reason = sm.denial(appointment, role, action, now);
  return reason ? reason.code : 'OK';
};

describe('BE-15 — máquina de estados do agendamento', () => {
  describe('estados finais são imutáveis para todos os papéis', () => {
    const cases = [];
    for (const status of ['concluido', 'cancelado', 'nao_compareceu']) {
      for (const role of [CLIENT, STAFF]) {
        for (const action of [CANCEL, RESCHEDULE, COMPLETE, NO_SHOW]) cases.push([status, role, action]);
      }
    }
    it.each(cases)('%s × %s × %s → 409 INVALID_STATUS_TRANSITION', (status, role, action) => {
      expect(code(appt(status, 48), role, action)).toBe('INVALID_STATUS_TRANSITION');
      expect(code(appt(status, -2), role, action)).toBe('INVALID_STATUS_TRANSITION');
      expect(sm.allowedActions(appt(status, 48), role, NOW)).toEqual([]);
    });
  });

  describe('cliente (confirmado)', () => {
    it('cancela e reagenda com mais de 24 h', () => {
      expect(code(appt('confirmado', 48), CLIENT, CANCEL)).toBe('OK');
      expect(code(appt('confirmado', 48), CLIENT, RESCHEDULE)).toBe('OK');
      expect(sm.allowedActions(appt('confirmado', 48), CLIENT, NOW)).toEqual([CANCEL, RESCHEDULE]);
    });

    it('exatamente 24 h antes ainda pode; 23h59 antes → 409 CANCELLATION_WINDOW_CLOSED', () => {
      expect(code(appt('confirmado', 24), CLIENT, CANCEL)).toBe('OK');
      const almost = { status: 'confirmado', start_at: new Date(NOW.getTime() + (23 * 60 + 59) * 60000).toISOString() };
      expect(code(almost, CLIENT, CANCEL)).toBe('CANCELLATION_WINDOW_CLOSED');
      expect(code(almost, CLIENT, RESCHEDULE)).toBe('CANCELLATION_WINDOW_CLOSED');
      expect(sm.allowedActions(almost, CLIENT, NOW)).toEqual([]);
    });

    it('nunca conclui nem marca falta (403)', () => {
      for (const start of [48, 1, -2]) {
        expect(code(appt('confirmado', start), CLIENT, COMPLETE)).toBe('FORBIDDEN');
        expect(code(appt('confirmado', start), CLIENT, NO_SHOW)).toBe('FORBIDDEN');
      }
    });
  });

  describe('equipe (confirmado)', () => {
    it('cancela e reagenda a qualquer momento, inclusive dentro de 24 h e depois do início', () => {
      for (const start of [48, 1, -2]) {
        expect(code(appt('confirmado', start), STAFF, CANCEL)).toBe('OK');
        expect(code(appt('confirmado', start), STAFF, RESCHEDULE)).toBe('OK');
      }
    });

    it('conclui e marca falta só depois do início', () => {
      expect(code(appt('confirmado', 1), STAFF, COMPLETE)).toBe('INVALID_STATUS_TRANSITION');
      expect(code(appt('confirmado', 1), STAFF, NO_SHOW)).toBe('INVALID_STATUS_TRANSITION');
      expect(code(appt('confirmado', 0), STAFF, COMPLETE)).toBe('OK');
      expect(code(appt('confirmado', -2), STAFF, NO_SHOW)).toBe('OK');
      expect(sm.allowedActions(appt('confirmado', 1), STAFF, NOW)).toEqual([CANCEL, RESCHEDULE]);
      expect(sm.allowedActions(appt('confirmado', -1), STAFF, NOW)).toEqual([CANCEL, RESCHEDULE, COMPLETE, NO_SHOW]);
    });
  });

  it('sem papel (nem cliente nem equipe) → 403 em tudo', () => {
    expect(code(appt('confirmado', 48), null, CANCEL)).toBe('FORBIDDEN');
    expect(sm.allowedActions(appt('confirmado', 48), null, NOW)).toEqual([]);
  });

  it('ação desconhecida → 400', () => {
    expect(code(appt('confirmado', 48), STAFF, 'reopen')).toBe('VALIDATION_ERROR');
    expect(() => sm.assertAction(appt('confirmado', 48), STAFF, 'reopen', NOW)).toThrow('Ação inválida');
  });

  it('assertAction devolve o status de destino ou lança o erro HTTP certo', () => {
    expect(sm.assertAction(appt('confirmado', 48), CLIENT, CANCEL, NOW)).toBe('cancelado');
    expect(sm.assertAction(appt('confirmado', 48), CLIENT, RESCHEDULE, NOW)).toBe('confirmado');
    expect(sm.assertAction(appt('confirmado', -1), STAFF, COMPLETE, NOW)).toBe('concluido');
    expect(sm.assertAction(appt('confirmado', -1), STAFF, NO_SHOW, NOW)).toBe('nao_compareceu');
    expect(() => sm.assertAction(appt('confirmado', 1), CLIENT, CANCEL, NOW)).toThrow(expect.objectContaining({ statusCode: 409 }));
    expect(() => sm.assertAction(appt('confirmado', 48), CLIENT, COMPLETE, NOW)).toThrow(expect.objectContaining({ statusCode: 403 }));
  });

  it('can_cancel_until = início − 24 h', () => {
    expect(sm.canCancelUntil(appt('confirmado', 48)).toISOString()).toBe(hours(24));
  });
});
