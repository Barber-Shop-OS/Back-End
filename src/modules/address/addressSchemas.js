// BE-38: schemas de endereço (também reutilizados pela filial).
const validate = require('../../middlewares/validate');
const { Joi, text, idParams } = require('../../shared/schemas');

const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

const addressFields = {
  cep: Joi.string()
    .trim()
    .pattern(/^\d{5}-?\d{3}$/)
    .messages({ 'string.pattern.base': 'CEP inválido. Use 00000-000' }),
  number: Joi.number().integer().positive().max(999999),
  complement: text(120).allow('', null),
  city: text(100).min(2),
  state: Joi.string().trim().uppercase().valid(...UFS).messages({ 'any.only': 'Estado (UF) inválido' }),
};

const requiredAddress = {
  cep: addressFields.cep.required(),
  number: addressFields.number.required(),
  complement: addressFields.complement,
  city: addressFields.city.required(),
  state: addressFields.state.required(),
};

module.exports = {
  addressFields,
  requiredAddress,
  create: validate({ body: Joi.object(requiredAddress) }),
  update: validate({ params: idParams, body: Joi.object(addressFields).min(1) }),
  byId: validate({ params: idParams }),
};
