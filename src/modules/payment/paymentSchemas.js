// BE-38 / BE-07: schemas de pagamento presencial.
const validate = require('../../middlewares/validate');
const { Joi, id, isoDate, idParams, pagination } = require('../../shared/schemas');
const { METHODS, STATUSES } = require('../../models/payment');

module.exports = {
  list: validate({
    query: Joi.object({
      ...pagination,
      barbershop_id: id(),
      branch_id: id(),
      status: Joi.string().valid(...STATUSES),
      method: Joi.string().valid(...METHODS),
      from: isoDate(),
      to: isoDate(),
    }),
  }),
  byId: validate({ params: idParams }),
  byAppointment: validate({ params: Joi.object({ appointment_id: id().required() }) }),
  create: validate({
    body: Joi.object({
      appointment_id: id().required(),
      // Ausente = preço registrado no agendamento (price_snapshot).
      amount: Joi.number().positive().precision(2).max(100000),
      method: Joi.string().valid(...METHODS).required(),
      // Registro presencial já pago (PAID) ou a receber (PENDING, padrão).
      status: Joi.string().valid('PENDING', 'PAID'),
    }),
  }),
  updateStatus: validate({
    params: idParams,
    body: Joi.object({ status: Joi.string().valid('PAID', 'FAILED').required() }),
  }),
};
