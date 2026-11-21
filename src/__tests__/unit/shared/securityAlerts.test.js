// SEC-28: alertas por pico de eventos, um por tipo e janela de 1 minuto.
jest.mock('../../../utils/logger', () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }));
const logger = require('../../../utils/logger');
const alerts = require('../../../shared/securityAlerts');

describe('securityAlerts', () => {
  beforeEach(() => {
    alerts.reset();
    logger.error.mockClear();
    delete process.env.SECURITY_ALERT_5XX_PER_MIN;
  });

  it('alerta uma única vez ao atingir o limite dentro da janela', () => {
    process.env.SECURITY_ALERT_5XX_PER_MIN = '3';
    const t0 = 1_000_000;
    expect(alerts.record('server_error', {}, t0)).toBe(false);
    expect(alerts.record('server_error', {}, t0 + 1000)).toBe(false);
    expect(alerts.record('server_error', { last_url: '/x' }, t0 + 2000)).toBe(true);
    expect(alerts.record('server_error', {}, t0 + 3000)).toBe(false);
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith('[security] ALERTA: pico de erros 5xx', expect.objectContaining({ alert: 'server_error', count: 3, threshold: 3, last_url: '/x' }));
  });

  it('nova janela zera a contagem e pode alertar de novo', () => {
    process.env.SECURITY_ALERT_5XX_PER_MIN = '2';
    const t0 = 5_000_000;
    alerts.record('server_error', {}, t0);
    expect(alerts.record('server_error', {}, t0 + 10)).toBe(true);
    expect(alerts.record('server_error', {}, t0 + alerts.WINDOW_MS)).toBe(false);
    expect(alerts.record('server_error', {}, t0 + alerts.WINDOW_MS + 10)).toBe(true);
    expect(logger.error).toHaveBeenCalledTimes(2);
  });

  it('classifica status HTTP e ignora os demais', () => {
    expect(alerts.recordResponse(200)).toBe(false);
    expect(alerts.recordResponse(404)).toBe(false);
    for (let i = 0; i < 2; i += 1) alerts.record('webhook_signature');
    expect(alerts.record('webhook_signature')).toBe(true); // limite padrão 3
    expect(alerts.record('desconhecido')).toBe(false);
  });
});
