// BE-38: schemas de pagamento presencial.
const validate = require('../../middlewares/validate');
const { Joi, id, idParams } = require('../../shared/schemas');

module.exports = {
  byId: validate({ params: idParams }),
  byAppointment: validate({ params: Joi.object({ appointment_id: id().required() }) }),
  create: validate({
    body: Joi.object({
      appointment_id: id().required(),
      amount: Joi.number().positive().precision(2).max(100000).required(),
      method: Joi.string().valid('PIX', 'CASH').required(),
    }),
  }),
  updateStatus: validate({
    params: idParams,
    body: Joi.object({ status: Joi.string().valid('PAID', 'FAILED').required() }),
  }),
};
