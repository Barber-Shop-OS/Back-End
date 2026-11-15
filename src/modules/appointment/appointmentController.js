// Appointment controller for query, detail, create, update, and delete operations.
const appointmentService = require('./appointmentService');
const { success, created, noContent } = require('../../utils/responseHandler');
const { ValidationError } = require('../../utils/errorHandler');

const getAllAppointments = async (req, res, next) => {
  try {
    const result = await appointmentService.findAll(req.query, req.user);
    return success(res, result);
  } catch (error) {
    return next(error);
  }
};

const getAppointmentById = async (req, res, next) => {
  try {
    const appointment = await appointmentService.findById(req.params.id, req.user);
    return success(res, appointment);
  } catch (error) {
    return next(error);
  }
};

// BE-14: Idempotency-Key opcional (UUID por tentativa no mobile). Repetição devolve a mesma resposta.
const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9_.:-]{8,100}$/;

const createAppointment = async (req, res, next) => {
  try {
    const idempotencyKey = req.get('Idempotency-Key');
    if (idempotencyKey !== undefined && !IDEMPOTENCY_KEY_RE.test(idempotencyKey)) {
      throw new ValidationError('Idempotency-Key deve ter de 8 a 100 caracteres (letras, números, - _ . :)');
    }
    const { appointment, replayed } = await appointmentService.create(req.body, req.user, { idempotencyKey });
    if (replayed) res.set('Idempotent-Replayed', 'true');
    return created(res, { message: 'Agendamento criado com sucesso', appointment });
  } catch (error) {
    return next(error);
  }
};

const updateAppointmentStatus = async (req, res, next) => {
  try {
    const appointment = await appointmentService.updateStatus(req.params.id, req.body.status, req.user);
    return success(res, { message: 'Status do agendamento atualizado com sucesso', appointment });
  } catch (error) {
    return next(error);
  }
};

// BE-15: ações do ciclo de vida. Resposta: { message, appointment } com allowed_actions atualizado.
const action = (run, message) => async (req, res, next) => {
  try {
    const appointment = await run(req);
    return success(res, { message, appointment });
  } catch (error) {
    return next(error);
  }
};

const cancelAppointment = action(
  (req) => appointmentService.cancel(req.params.id, req.body, req.user),
  'Agendamento cancelado'
);
const rescheduleAppointment = action(
  (req) => appointmentService.reschedule(req.params.id, req.body, req.user),
  'Agendamento reagendado'
);
const completeAppointment = action((req) => appointmentService.complete(req.params.id, req.user), 'Atendimento concluído');
const noShowAppointment = action((req) => appointmentService.noShow(req.params.id, req.user), 'Falta registrada');

const listAppointmentEvents = async (req, res, next) => {
  try {
    return success(res, await appointmentService.listEvents(req.params.id, req.user));
  } catch (error) {
    return next(error);
  }
};

const deleteAppointment = async (req, res, next) => {
  try {
    await appointmentService.remove(req.params.id);
    return noContent(res);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getAllAppointments,
  getAppointmentById,
  createAppointment,
  updateAppointmentStatus,
  cancelAppointment,
  rescheduleAppointment,
  completeAppointment,
  noShowAppointment,
  listAppointmentEvents,
  deleteAppointment,
};