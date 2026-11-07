// BE-38: schemas de usuário. Campos permitidos no update são decididos no service (por papel).
const validate = require('../../middlewares/validate');
const { Joi, text, idParams, pagination } = require('../../shared/schemas');

module.exports = {
  list: validate({ query: Joi.object({ ...pagination, name: text(100), email: text(100) }) }),
  byId: validate({ params: idParams }),
  update: validate({ params: idParams, body: Joi.object().min(1) }),
  changeRole: validate({
    params: idParams,
    body: Joi.object({ role: Joi.string().valid('cliente', 'barbeiro', 'owner', 'admin').required() }),
  }),
};
