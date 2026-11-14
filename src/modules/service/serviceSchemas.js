// BE-38 / BE-06: schemas de serviço. Casas decimais do preço são checadas no service (sem arredondar).
const validate = require('../../middlewares/validate');
const { Joi, id, text, idParams, pagination } = require('../../shared/schemas');

const fields = {
  name: text(120).min(2),
  description: text(500).min(1),
  price: Joi.number().min(0).max(100000),
  duration: Joi.number().integer().min(5).max(480).multiple(5).messages({
    'number.multiple': "Campo 'duration' deve ser múltiplo de 5",
  }),
  active: Joi.boolean(),
};

module.exports = {
  list: validate({
    query: Joi.object({
      ...pagination,
      name: text(100),
      barbershop_id: id().required(),
      include_inactive: Joi.boolean(),
    }),
  }),
  byId: validate({ params: idParams }),
  create: validate({
    body: Joi.object({
      name: fields.name.required(),
      description: fields.description.required(),
      price: fields.price.required(),
      duration: fields.duration.required(),
      active: fields.active,
      barbershop_id: id().required(),
    }),
  }),
  update: validate({ params: idParams, body: Joi.object(fields).min(1) }),
};
