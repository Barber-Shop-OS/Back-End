// BE-38 / BE-12: schemas de agendamento.
const validate = require('../../middlewares/validate');
const { Joi, id, text, isoDate, idParams, pagination } = require('../../shared/schemas');
const { STATUSES, SOURCES } = require('../../models/appointment');

module.exports = {
  list: validate({
    query: Joi.object({
      ...pagination,
      status: Joi.string().valid(...STATUSES),
      user_id: id(),
      barber_id: id(),
      service_id: id(),
      branch_id: id(),
      from: isoDate(),
      to: isoDate(),
    }),
  }),
  byId: validate({ params: idParams }),
  create: validate({
    body: Joi.object({
      // Ausente = "sem preferência" (BE-14): o servidor escolhe o barbeiro livre.
      barber_id: id(),
      service_id: id().required(),
      branch_id: id().required(),
      start_at: isoDate(),
      // Nome antigo de start_at, aceito por uma release.
      appointment_date: isoDate(),
      notes: text(500).allow(''),
      source: Joi.string().valid(...SOURCES),
      // Só usado quando a barbearia agenda para um cliente (ver appointmentService).
      user_id: id(),
    }).or('start_at', 'appointment_date'),
  }),
  cancel: validate({
    params: idParams,
    body: Joi.object({ reason: text(255).allow('', null) }),
  }),
  reschedule: validate({
    params: idParams,
    body: Joi.object({ start_at: isoDate().required(), barber_id: id() }),
  }),
  updateStatus: validate({
    params: idParams,
    body: Joi.object({ status: Joi.string().valid(...STATUSES).required() }),
  }),
};
