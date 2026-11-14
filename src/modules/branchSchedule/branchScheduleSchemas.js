// BE-10: schemas de horário de funcionamento e fechamentos.
const validate = require('../../middlewares/validate');
const { Joi, id, text, idParams } = require('../../shared/schemas');

const hhmm = () =>
  Joi.string()
    .trim()
    .pattern(/^([01]\d|2[0-3]):[0-5]\d$/)
    .messages({ 'string.pattern.base': "Campo '{#label}' deve estar no formato HH:mm" });
const localDate = () =>
  Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .messages({ 'string.pattern.base': "Campo '{#label}' deve estar no formato YYYY-MM-DD" });

const interval = Joi.object({
  weekday: Joi.number().integer().min(0).max(6).required(),
  opens_at: hhmm().required(),
  closes_at: hhmm().required(),
});

const closureFields = {
  date: localDate(),
  reason: text(255).allow('', null),
  all_day: Joi.boolean(),
  start_time: hhmm().allow(null),
  end_time: hhmm().allow(null),
};

const closureParams = Joi.object({ id: id().required(), closureId: id().required() });

module.exports = {
  byBranch: validate({ params: idParams }),
  replaceHours: validate({
    params: idParams,
    // Semana inteira; lista vazia = filial sem horário (fechada).
    body: Joi.object({ opening_hours: Joi.array().items(interval).max(70).required() }),
  }),
  listClosures: validate({ params: idParams, query: Joi.object({ from: localDate(), to: localDate() }) }),
  createClosure: validate({
    params: idParams,
    body: Joi.object({ ...closureFields, date: closureFields.date.required() }),
  }),
  updateClosure: validate({ params: closureParams, body: Joi.object(closureFields).min(1) }),
  removeClosure: validate({ params: closureParams }),
  hhmm,
  localDate,
};
