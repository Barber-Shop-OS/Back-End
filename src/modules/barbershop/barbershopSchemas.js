// BE-38: schemas de barbearia.
const validate = require('../../middlewares/validate');
const { Joi, text, idParams, pagination } = require('../../shared/schemas');

module.exports = {
  list: validate({ query: Joi.object({ ...pagination, name: text(100), city: text(100) }) }),
  byId: validate({ params: idParams }),
  create: validate({ body: Joi.object({ name: text(120).min(2).required() }) }),
  update: validate({ params: idParams, body: Joi.object({ name: text(120).min(2) }).min(1) }),
};
