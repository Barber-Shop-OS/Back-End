// SEC-28: alertas de segurança nos logs (sem Sentry — decisão de 20/11). Conta eventos por janela fixa de
// 1 minuto e, ao passar do limite, emite UM `logger.error('[security] ALERTA ...')` por tipo e janela — a
// plataforma de logs (Railway) dispara o aviso por busca em "[security] ALERTA".
const logger = require('../utils/logger');

const WINDOW_MS = 60 * 1000;

/** Limites por minuto (env para ajustar sem deploy de código). */
const KINDS = {
  unauthorized: { env: 'SECURITY_ALERT_401_PER_MIN', fallback: 60, label: 'pico de 401 (credenciais/tokens inválidos)' },
  forbidden: { env: 'SECURITY_ALERT_403_PER_MIN', fallback: 40, label: 'pico de 403 (acesso negado)' },
  rate_limited: { env: 'SECURITY_ALERT_429_PER_MIN', fallback: 60, label: 'pico de 429 (limite de requisições)' },
  server_error: { env: 'SECURITY_ALERT_5XX_PER_MIN', fallback: 10, label: 'pico de erros 5xx' },
  webhook_signature: { env: 'SECURITY_ALERT_WEBHOOK_PER_MIN', fallback: 3, label: 'falhas de assinatura no webhook da AbacatePay' },
};

const state = new Map();

const thresholdOf = (kind) => {
  const value = Number(process.env[KINDS[kind].env]);
  return Number.isFinite(value) && value > 0 ? value : KINDS[kind].fallback;
};

/** Registra um evento; devolve true quando este evento disparou o alerta da janela. */
const record = (kind, details = {}, now = Date.now()) => {
  if (!KINDS[kind]) return false;
  let entry = state.get(kind);
  if (!entry || now - entry.start >= WINDOW_MS) {
    entry = { start: now, count: 0, alerted: false };
    state.set(kind, entry);
  }
  entry.count += 1;
  const threshold = thresholdOf(kind);
  if (entry.alerted || entry.count < threshold) return false;
  entry.alerted = true;
  logger.error(`[security] ALERTA: ${KINDS[kind].label}`, { alert: kind, count: entry.count, threshold, window_s: WINDOW_MS / 1000, ...details });
  return true;
};

const STATUS_KIND = { 401: 'unauthorized', 403: 'forbidden', 429: 'rate_limited' };

/** Classifica a resposta HTTP (chamado pelo logger de requisições). */
const recordResponse = (statusCode, details) => {
  const kind = statusCode >= 500 ? 'server_error' : STATUS_KIND[statusCode];
  return kind ? record(kind, details) : false;
};

const reset = () => state.clear();

module.exports = { record, recordResponse, reset, KINDS, WINDOW_MS };
