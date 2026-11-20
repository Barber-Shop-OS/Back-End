// BE-38 / SEC-10: cadastro e login. E-mail sempre normalizado (trim + minúsculas).
const validate = require('../../middlewares/validate');
const { Joi, text, email, password } = require('../../shared/schemas');
const { PLAN_CODES } = require('../../shared/plans');

module.exports = {
  // BE-21: cadastro do dono com barbearia e trial.
  registerOwner: validate({
    body: Joi.object({
      name: text(120).min(2).required(),
      email: email().required(),
      password: password().required(),
      phone: text(20).required(),
      // BE-40: versão dos termos aceita na tela de cadastro.
      terms_version: text(20),
      barbershop: Joi.object({
        name: text(120).min(2).required(),
        slug: Joi.string().trim().lowercase().min(3).max(60),
      }).required(),
      plan_code: Joi.string().valid(...PLAN_CODES),
    }),
  }),
  register: validate({
    body: Joi.object({
      name: text(120).min(2).required(),
      email: email().required(),
      password: password().required(),
      terms_version: text(20),
    }),
  }),
  // Sem mínimo de tamanho no login: contas antigas podem ter senha de 6 caracteres.
  login: validate({
    body: Joi.object({
      email: email().required(),
      password: Joi.string().max(72).required(),
    }),
  }),
  // BE-28
  google: validate({
    body: Joi.object({
      id_token: Joi.string().max(4096).required(),
      intent: Joi.string().valid('login', 'signup-owner', 'signup-client').default('login'),
      name: text(120).min(2),
      phone: text(20),
      barbershop: Joi.object({ name: text(120).min(2).required(), slug: Joi.string().trim().lowercase().min(3).max(60) }),
      plan_code: Joi.string().valid(...PLAN_CODES),
      terms_version: text(20),
    }),
  }),
  // BE-27
  verifyEmail: validate({ body: Joi.object({ token: Joi.string().max(200).required() }) }),
  // BE-26
  forgotPassword: validate({ body: Joi.object({ email: email().required() }) }),
  resetPassword: validate({
    body: Joi.object({ token: Joi.string().max(200).required(), password: password().required() }),
  }),
};
