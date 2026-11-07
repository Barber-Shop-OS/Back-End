// BE-38: schemas de agendamento.
const validate = require('../../middlewares/validate');
const { Joi, id, isoDate, idParams, pagination } = require('../../shared/schemas');

const STATUS = ['pendente', 'confirmado', 'cancelado'];

module.exports = {
  list: validate({
    query: Joi.object({
      ...pagination,
      status: Joi.string().valid(...STATUS),
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
      barber_id: id().required(),
      service_id: id().required(),
      branch_id: id().required(),
      appointment_date: isoDate().required(),
      // Só usado quando a barbearia agenda para um cliente (ver appointmentService).
      user_id: id(),
    }),
  }),
  updateStatus: validate({
    params: idParams,
    body: Joi.object({ status: Joi.string().valid(...STATUS).required() }),
  }),
};
