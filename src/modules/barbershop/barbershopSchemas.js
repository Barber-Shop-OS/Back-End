// BE-38: schemas de barbearia.
const validate = require('../../middlewares/validate');
const { Joi, text, idParams, pagination } = require('../../shared/schemas');

// BE-18: campos do perfil público.
const profile = {
  slug: Joi.string().trim().lowercase().min(3).max(60),
  description: text(1000).allow('', null),
  phone: text(20).allow('', null),
  whatsapp: text(20).allow('', null),
  instagram: text(31).allow('', null),
  logo_url: Joi.string().trim().max(500).allow('', null),
  cover_url: Joi.string().trim().max(500).allow('', null),
};

module.exports = {
  bySlug: validate({ params: Joi.object({ slug: Joi.string().trim().lowercase().max(60).required() }) }),
  list: validate({ query: Joi.object({ ...pagination, name: text(100), city: text(100) }) }),
  byId: validate({ params: idParams }),
  create: validate({ body: Joi.object({ name: text(120).min(2).required(), ...profile }) }),
  update: validate({ params: idParams, body: Joi.object({ name: text(120).min(2), ...profile }).min(1) }),
};
