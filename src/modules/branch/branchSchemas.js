// BE-38: schemas de filial (dados da filial + endereço no mesmo corpo).
const validate = require('../../middlewares/validate');
const { Joi, id, text, idParams, pagination } = require('../../shared/schemas');
const { addressFields, requiredAddress } = require('../address/addressSchemas');

// BE-10: fuso IANA, telefones e ativa.
const extras = {
  timezone: Joi.string().trim().max(64),
  phone: text(20).allow('', null),
  whatsapp: text(20).allow('', null),
  active: Joi.boolean(),
};

module.exports = {
  list: validate({
    query: Joi.object({ ...pagination, barbershop_id: id(), name: text(100), include_inactive: Joi.boolean() }),
  }),
  byId: validate({ params: idParams }),
  create: validate({
    body: Joi.object({
      name: text(120).min(2).required(),
      barbershop_id: id().required(),
      ...extras,
      ...requiredAddress,
    }),
  }),
  update: validate({
    params: idParams,
    body: Joi.object({ name: text(120).min(2), ...extras, ...addressFields }).min(1),
  }),
};
