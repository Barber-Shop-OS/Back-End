// BE-16: worker da fila. `runOnce` processa um lote (usado pelos testes e pelo agendador);
// `start` dispara runOnce a cada minuto no processo da API (desligar com JOBS_WORKER=false).
// Com mais de uma instância, SKIP LOCKED (queue.claimDue) evita processamento duplicado.
const queue = require('./queue');
const logger = require('../utils/logger');

const handlers = new Map();
const maintenance = [];

/** Registra o handler de um tipo de job: async (payload, job) => void. Erro = nova tentativa. */
const register = (type, handler) => handlers.set(type, handler);

/** Tarefa de manutenção executada a cada ciclo (ex.: limpar Idempotency-Keys vencidas). */
const addMaintenance = (fn) => maintenance.push(fn);

const runJob = async (job, now) => {
  const handler = handlers.get(job.type);
  try {
    if (!handler) throw new Error(`Sem handler para o tipo ${job.type}`);
    await handler(queue.parsePayload(job), job);
    await queue.markDone(job, now);
    return 'done';
  } catch (error) {
    // Sem payload no log (pode ter e-mail/dados pessoais).
    logger.warn('[jobs] falha ao processar job', { id: job.id, type: job.type, attempt: job.attempts + 1, message: error.message });
    await queue.markFailed(job, error, now);
    return 'failed';
  }
};

/** Processa os jobs vencidos. Retorna { processed, done, failed }. */
const runOnce = async ({ now = new Date(), limit = 20 } = {}) => {
  await queue.releaseStuck(now);
  for (const task of maintenance) {
    try {
      await task(now);
    } catch (error) {
      logger.warn('[jobs] falha na manutenção', { message: error.message });
    }
  }
  const jobs = await queue.claimDue({ now, limit });
  const stats = { processed: jobs.length, done: 0, failed: 0 };
  for (const job of jobs) {
    stats[await runJob(job, now)] += 1;
  }
  return stats;
};

let timer = null;
let running = false;

const tick = async () => {
  if (running) return; // ciclo anterior ainda em andamento
  running = true;
  try {
    await runOnce();
  } catch (error) {
    logger.error('[jobs] ciclo do worker falhou', { message: error.message });
  } finally {
    running = false;
  }
};

/** Inicia o agendador (a cada 60 s). Idempotente. */
const start = ({ intervalMs = 60 * 1000 } = {}) => {
  if (timer) return timer;
  timer = setInterval(tick, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();
  logger.info('[jobs] worker iniciado');
  return timer;
};

const stop = () => {
  if (timer) clearInterval(timer);
  timer = null;
};

module.exports = { register, addMaintenance, runOnce, start, stop, handlers };
