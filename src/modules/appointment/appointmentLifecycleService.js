// BE-15: cancelar, reagendar, concluir e marcar falta.
// Regras na máquina de estados (appointmentStateMachine.js); aqui ficam autorização, transação e
// histórico. A linha do agendamento é travada (FOR UPDATE) e a regra é conferida de novo dentro da
// transação, então duas ações simultâneas não passam as duas.
const { Barber, Appointment, AppointmentEvent } = require('../../models');
const { assertCanViewAppointment } = require('../../shared/authz');
const { performsService } = require('../barber/barberRepository');
const availability = require('../availability/availabilityService');
const booking = require('./bookingService');
const stateMachine = require('./appointmentStateMachine');
const { present, roleFor } = require('./appointmentPresenter');
const appointmentRepository = require('./appointmentRepository');
const time = require('../../shared/time');
const { pickFields } = require('../../shared/pickFields');
const { ValidationError, NotFoundError } = require('../../utils/errorHandler');

const { ACTIONS } = stateMachine;

// Ganchos executados dentro da transação após cada transição (BE-16: e-mails e lembretes).
const hooks = [];
const onTransition = (fn) => hooks.push(fn);

const recordEvent = (appointment, { type, from, to, actor, role, payload }, transaction) =>
  AppointmentEvent.create(
    {
      appointment_id: appointment.id,
      actor_user_id: actor ? actor.id : null,
      actor_role: role || null,
      type,
      from_status: from || null,
      to_status: to || null,
      payload: payload || null,
    },
    { transaction }
  );

const EVENT_TYPE = {
  [ACTIONS.CANCEL]: 'cancelled',
  [ACTIONS.RESCHEDULE]: 'rescheduled',
  [ACTIONS.COMPLETE]: 'completed',
  [ACTIONS.NO_SHOW]: 'no_show',
};

/** Novo horário/barbeiro do reagendamento, validado com as mesmas regras da criação (BE-14). */
const applyReschedule = async (row, context, role, input, now, transaction) => {
  const start = booking.parseFutureDate(input.start_at, now);
  const targetBarberId = input.barber_id ? Number(input.barber_id) : row.barber_id;

  if (targetBarberId !== row.barber_id) {
    const barber = await Barber.findByPk(targetBarberId, { transaction });
    if (!barber || !barber.active) throw new NotFoundError('Barbeiro não encontrado');
    if (String(barber.branch_id) !== String(row.branch_id)) {
      throw new ValidationError('Este barbeiro não pertence à filial do agendamento');
    }
    if (!(await performsService(barber.id, row.service_id))) {
      throw new ValidationError('Este barbeiro não realiza o serviço agendado');
    }
  }

  await booking.lockBarbers([targetBarberId], transaction);
  await booking.freeBarbersAt({
    branch: context.Branch,
    service: { duration: row.duration_min },
    barberIds: [targetBarberId],
    start,
    policy: role === stateMachine.ROLES.STAFF ? booking.STAFF_POLICY : availability.POLICY,
    now,
    excludeAppointmentId: row.id,
    transaction,
  });
  const end = time.addMinutes(start, row.duration_min);
  await booking.assertNoOverlap(targetBarberId, start, end, { excludeAppointmentId: row.id, transaction });

  const payload = {
    from: { start_at: new Date(row.start_at).toISOString(), barber_id: row.barber_id },
    to: { start_at: start.toISOString(), barber_id: targetBarberId },
  };
  return { changes: { start_at: start, end_at: end, barber_id: targetBarberId }, payload };
};

/**
 * Executa uma ação. 404 para quem não vê o agendamento; 403/409 conforme a máquina de estados.
 * @returns agendamento apresentado (com can_cancel_until e allowed_actions)
 */
const transition = async (id, action, currentUser, input = {}, now = new Date()) => {
  const context = await assertCanViewAppointment(currentUser, id);
  const role = roleFor(currentUser, context);
  // Falha rápido fora da transação; a mesma regra é conferida de novo com a linha travada.
  stateMachine.assertAction(context, role, action, now);

  await booking.lockingTransaction(async (transaction) => {
    const row = await Appointment.findByPk(id, { lock: transaction.LOCK.UPDATE, transaction });
    const from = row.status;
    const to = stateMachine.assertAction(row, role, action, now);

    let changes = { status: to };
    let payload = null;
    if (action === ACTIONS.CANCEL) {
      changes = {
        ...changes,
        cancelled_at: now,
        cancelled_by: currentUser.id,
        cancel_reason: input.reason ? String(input.reason).trim() : null,
      };
      payload = input.reason ? { reason: changes.cancel_reason } : null;
    }
    if (action === ACTIONS.RESCHEDULE) {
      const result = await applyReschedule(row, context, role, input, now, transaction);
      changes = { ...changes, ...result.changes };
      payload = result.payload;
    }

    await row.update(changes, { transaction });
    await recordEvent(row, { type: EVENT_TYPE[action], from, to, actor: currentUser, role, payload }, transaction);
    for (const hook of hooks) {
      await hook({ action, appointment: row, from, to, actor: currentUser, role, payload, transaction });
    }
  });

  return present(await appointmentRepository.findById(id), currentUser, now);
};

// Campos fora da lista → 400 (mesma convenção das demais rotas de escrita — SEC-23).
const cancel = (id, input, user, now) => transition(id, ACTIONS.CANCEL, user, pickFields(input, ['reason']), now);
const reschedule = (id, input, user, now) =>
  transition(id, ACTIONS.RESCHEDULE, user, pickFields(input, ['start_at', 'barber_id']), now);
const complete = (id, user, now) => transition(id, ACTIONS.COMPLETE, user, {}, now);
const noShow = (id, user, now) => transition(id, ACTIONS.NO_SHOW, user, {}, now);

/** Histórico do agendamento (mesma visibilidade do detalhe). */
const listEvents = async (id, currentUser) => {
  await assertCanViewAppointment(currentUser, id);
  const rows = await AppointmentEvent.findAll({ where: { appointment_id: id }, order: [['created_at', 'ASC'], ['id', 'ASC']] });
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    from_status: row.from_status,
    to_status: row.to_status,
    actor_user_id: row.actor_user_id,
    actor_role: row.actor_role,
    payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
    created_at: row.created_at,
  }));
};

module.exports = { transition, cancel, reschedule, complete, noShow, listEvents, recordEvent, onTransition };
