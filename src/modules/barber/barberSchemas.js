// BE-38: schemas de barbeiro.
const validate = require('../../middlewares/validate');
const { Joi, id, text, idParams, pagination } = require('../../shared/schemas');

module.exports = {
  list: validate({
    query: Joi.object({ ...pagination, user_id: id(), branch_id: id(), bio: text(100) }),
  }),
  byId: validate({ params: idParams }),
  create: validate({
    body: Joi.object({
      user_id: id().required(),
      branch_id: id().required(),
      bio: text(500).min(1).required(),
    }),
  }),
  update: validate({
    params: idParams,
    body: Joi.object({ branch_id: id(), bio: text(500).min(1) }).min(1),
  }),
};
