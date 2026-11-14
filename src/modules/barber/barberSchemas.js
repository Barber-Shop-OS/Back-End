// BE-38 / BE-05: schemas de barbeiro.
const validate = require('../../middlewares/validate');
const { Joi, id, text, email, idParams, pagination } = require('../../shared/schemas');

const profile = {
  bio: text(500).allow(''),
  display_name: text(120).allow('', null),
  photo_url: Joi.string().trim().uri({ scheme: ['https'] }).max(500).allow(null),
};

module.exports = {
  list: validate({
    query: Joi.object({ ...pagination, branch_id: id(), service_id: id(), bio: text(100) }),
  }),
  byId: validate({ params: idParams }),
  create: validate({
    body: Joi.object({ user_id: id().required(), branch_id: id().required(), ...profile }),
  }),
  createInBranch: validate({
    params: idParams,
    body: Joi.object({ user_id: id(), email: email(), name: text(120), ...profile }).xor('user_id', 'email'),
  }),
  update: validate({
    params: idParams,
    body: Joi.object({ branch_id: id(), bio: text(500).min(1), display_name: profile.display_name, photo_url: profile.photo_url }).min(1),
  }),
  setServices: validate({
    params: idParams,
    body: Joi.object({ service_ids: Joi.array().items(id()).max(200).required() }),
  }),
  remove: validate({ params: idParams, query: Joi.object({ force: Joi.string().valid('cancel') }) }),
};
