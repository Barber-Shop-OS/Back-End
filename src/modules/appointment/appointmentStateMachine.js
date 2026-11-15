// BE-15: máquina de estados do agendamento (função pura, sem banco).
//
//   confirmado ──cancel────────▶ cancelado        (cliente: até 24 h antes; equipe: até concluir)
//   confirmado ──reschedule────▶ confirmado       (mesmas regras do cancelamento)
//   confirmado ──complete──────▶ concluido        (só equipe, só depois do início)
//   confirmado ──no_show───────▶ nao_compareceu   (só equipe, só depois do início)
// Estados finais (concluido, cancelado, nao_compareceu) são imutáveis.
// O front/mobile só exibe as ações de `allowedActions` (decisão de produto de 2026-10-23).
const { ValidationError, ForbiddenError, ConflictError, CODES } = require('../../utils/errorHandler');
const { STATUS } = require('../../models/appointment');

const ACTIONS = Object.freeze({
  CANCEL: 'cancel',
  RESCHEDULE: 'reschedule',
  COMPLETE: 'complete',
  NO_SHOW: 'no_show',
});
const ROLES = Object.freeze({ CLIENT: 'client', STAFF: 'staff' });

const CLIENT_WINDOW_MS = 24 * 60 * 60 * 1000;
const FINAL_STATUSES = [STATUS.COMPLETED, STATUS.CANCELLED, STATUS.NO_SHOW];

const TARGET_STATUS = Object.freeze({
  [ACTIONS.CANCEL]: STATUS.CANCELLED,
  [ACTIONS.RESCHEDULE]: STATUS.CONFIRMED,
  [ACTIONS.COMPLETE]: STATUS.COMPLETED,
  [ACTIONS.NO_SHOW]: STATUS.NO_SHOW,
});

const isFinal = (status) => FINAL_STATUSES.includes(status);

/** Até quando o cliente pode cancelar/reagendar (início − 24 h). */
const canCancelUntil = (appointment) => new Date(new Date(appointment.start_at).getTime() - CLIENT_WINDOW_MS);

/**
 * Motivo pelo qual `role` não pode executar `action` agora, ou null se pode.
 * Retorna { status, code, message } para virar erro HTTP.
 */
const denial = (appointment, role, action, now = new Date()) => {
  if (!Object.values(ACTIONS).includes(action)) {
    return { status: 400, code: CODES.VALIDATION_ERROR, message: 'Ação inválida' };
  }
  if (isFinal(appointment.status)) {
    return {
      status: 409,
      code: CODES.INVALID_STATUS_TRANSITION,
      message: `Agendamento ${appointment.status} não pode mais ser alterado`,
    };
  }
  const startsAt = new Date(appointment.start_at).getTime();

  if (role === ROLES.STAFF) {
    if ((action === ACTIONS.COMPLETE || action === ACTIONS.NO_SHOW) && now.getTime() < startsAt) {
      return {
        status: 409,
        code: CODES.INVALID_STATUS_TRANSITION,
        message: 'Só é possível concluir ou marcar falta depois do horário de início',
      };
    }
    return null;
  }

  if (role === ROLES.CLIENT) {
    if (action === ACTIONS.COMPLETE || action === ACTIONS.NO_SHOW) {
      return { status: 403, code: CODES.FORBIDDEN, message: 'Apenas a barbearia pode realizar esta ação' };
    }
    if (now.getTime() > canCancelUntil(appointment).getTime()) {
      return {
        status: 409,
        code: CODES.CANCELLATION_WINDOW_CLOSED,
        message: 'O prazo para cancelar ou reagendar terminou (até 24 h antes). Fale com a barbearia.',
      };
    }
    return null;
  }

  return { status: 403, code: CODES.FORBIDDEN, message: 'Sem permissão para alterar este agendamento' };
};

/** Lança o erro correspondente se a ação não for permitida. Retorna o status de destino. */
const assertAction = (appointment, role, action, now = new Date()) => {
  const reason = denial(appointment, role, action, now);
  if (reason) {
    if (reason.status === 403) throw new ForbiddenError(reason.message, reason.code);
    if (reason.status === 409) throw new ConflictError(reason.message, reason.code);
    throw new ValidationError(reason.message);
  }
  return TARGET_STATUS[action];
};

/** Ações que `role` pode executar agora (ordem estável). */
const allowedActions = (appointment, role, now = new Date()) =>
  Object.values(ACTIONS).filter((action) => !denial(appointment, role, action, now));

module.exports = {
  ACTIONS,
  ROLES,
  FINAL_STATUSES,
  TARGET_STATUS,
  CLIENT_WINDOW_MS,
  isFinal,
  canCancelUntil,
  denial,
  assertAction,
  allowedActions,
};
