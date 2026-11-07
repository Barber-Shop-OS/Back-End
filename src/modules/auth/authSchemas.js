// BE-38 / SEC-10: cadastro e login. E-mail sempre normalizado (trim + minúsculas).
const validate = require('../../middlewares/validate');
const { Joi, text, email, password } = require('../../shared/schemas');

module.exports = {
  register: validate({
    body: Joi.object({
      name: text(120).min(2).required(),
      email: email().required(),
      password: password().required(),
    }),
  }),
  // Sem mínimo de tamanho no login: contas antigas podem ter senha de 6 caracteres.
  login: validate({
    body: Joi.object({
      email: email().required(),
      password: Joi.string().max(72).required(),
    }),
  }),
};
