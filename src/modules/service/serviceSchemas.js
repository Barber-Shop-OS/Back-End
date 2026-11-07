// BE-38: schemas de serviço.
const validate = require('../../middlewares/validate');
const { Joi, id, text, idParams, pagination } = require('../../shared/schemas');

const fields = {
  name: text(120).min(2),
  description: text(500).min(1),
  price: Joi.number().positive().precision(2).max(100000),
  duration: Joi.number().integer().min(5).max(480),
};

module.exports = {
  list: validate({ query: Joi.object({ ...pagination, name: text(100), barbershop_id: id() }) }),
  byId: validate({ params: idParams }),
  create: validate({
    body: Joi.object({
      name: fields.name.required(),
      description: fields.description.required(),
      price: fields.price.required(),
      duration: fields.duration.required(),
      barbershop_id: id().required(),
    }),
  }),
  update: validate({ params: idParams, body: Joi.object(fields).min(1) }),
};
