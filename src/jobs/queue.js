// BE-16: fila simples persistida na tabela `jobs`.
//   enqueue(type, payload, { runAt, reference, maxAttempts, transaction })
//   cancelByReference(reference, { types, transaction })   → cancela pendentes (ex.: lembretes)
//   claimDue({ now, limit })   → pega jobs vencidos com FOR UPDATE SKIP LOCKED e marca running
//   markDone / markFailed      → retry exponencial (2^tentativas min) até max_attempts
// Enfileirar dentro da transação do negócio garante que rollback não deixa e-mail órfão.
const { Op } = require('sequelize');
const { Job } = require('../models');
const { lockingTransaction } = require('../shared/transaction');

const DEFAULT_MAX_ATTEMPTS = 5;
const STUCK_AFTER_MS = 10 * 60 * 1000;

const enqueue = (type, payload, { runAt = new Date(), reference = null, maxAttempts = DEFAULT_MAX_ATTEMPTS, transaction } = {}) =>
  Job.create(
    { type, payload, reference, run_at: runAt, status: 'pending', attempts: 0, max_attempts: maxAttempts },
    { transaction }
  );

/** Cancela jobs pendentes de uma referência (opcionalmente só alguns tipos/kinds). Retorna a quantidade. */
const cancelByReference = async (reference, { types, match, transaction } = {}) => {
  const where = { reference, status: 'pending' };
  if (types) where.type = { [Op.in]: types };
  const rows = await Job.findAll({ where, transaction });
  const targets = match ? rows.filter((row) => match(parsePayload(row))) : rows;
  if (!targets.length) return 0;
  await Job.update(
    { status: 'cancelled', finished_at: new Date() },
    { where: { id: { [Op.in]: targets.map((row) => row.id) } }, transaction }
  );
  return targets.length;
};

const parsePayload = (job) => (typeof job.payload === 'string' ? JSON.parse(job.payload) : job.payload);

/**
 * Reserva até `limit` jobs vencidos. No PostgreSQL usa SKIP LOCKED: duas instâncias do worker nunca
 * pegam o mesmo job. A reserva é curta (só marca running); o processamento é fora da transação.
 */
const claimDue = ({ now = new Date(), limit = 20 } = {}) =>
  lockingTransaction(async (transaction) => {
    const rows = await Job.findAll({
      where: { status: 'pending', run_at: { [Op.lte]: now } },
      order: [['run_at', 'ASC'], ['id', 'ASC']],
      limit,
      lock: transaction.LOCK.UPDATE,
      skipLocked: true,
      transaction,
    });
    if (!rows.length) return [];
    await Job.update(
      { status: 'running', locked_at: now },
      { where: { id: { [Op.in]: rows.map((row) => row.id) } }, transaction }
    );
    return rows.map((row) => {
      row.status = 'running';
      row.locked_at = now;
      return row;
    });
  });

const markDone = (job, now = new Date()) =>
  Job.update({ status: 'done', finished_at: now, locked_at: null, last_error: null }, { where: { id: job.id } });

/** Atraso do retry: 2, 4, 8, 16 min… */
const backoffMs = (attempts) => 2 ** attempts * 60 * 1000;

const markFailed = (job, error, now = new Date()) => {
  const attempts = job.attempts + 1;
  const message = String((error && error.message) || error).slice(0, 1000);
  const exhausted = attempts >= job.max_attempts;
  return Job.update(
    {
      attempts,
      last_error: message,
      locked_at: null,
      status: exhausted ? 'failed' : 'pending',
      run_at: exhausted ? job.run_at : new Date(now.getTime() + backoffMs(attempts)),
      finished_at: exhausted ? now : null,
    },
    { where: { id: job.id } }
  );
};

/** Jobs presos em running (instância caiu no meio) voltam para a fila. */
const releaseStuck = (now = new Date()) =>
  Job.update(
    { status: 'pending', locked_at: null },
    { where: { status: 'running', locked_at: { [Op.lt]: new Date(now.getTime() - STUCK_AFTER_MS) } } }
  );

module.exports = {
  enqueue,
  cancelByReference,
  claimDue,
  markDone,
  markFailed,
  releaseStuck,
  backoffMs,
  parsePayload,
  DEFAULT_MAX_ATTEMPTS,
};
