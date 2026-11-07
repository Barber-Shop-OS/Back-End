// BE-38: blocos Joi reutilizáveis. Mensagens em pt-BR.
const Joi = require('joi');

const messages = {
  'any.required': "Campo '{#label}' é obrigatório",
  'string.empty': "Campo '{#label}' é obrigatório",
  'string.base': "Campo '{#label}' deve ser um texto",
  'string.max': "Campo '{#label}' deve ter no máximo {#limit} caracteres",
  'string.min': "Campo '{#label}' deve ter no mínimo {#limit} caracteres",
  'string.email': 'E-mail inválido',
  'number.base': "Campo '{#label}' deve ser um número",
  'number.integer': "Campo '{#label}' deve ser um inteiro",
  'number.positive': "Campo '{#label}' deve ser positivo",
  'number.min': "Campo '{#label}' deve ser no mínimo {#limit}",
  'number.max': "Campo '{#label}' deve ser no máximo {#limit}",
  'any.only': "Campo '{#label}' tem valor inválido",
  'date.base': "Campo '{#label}' deve ser uma data válida (ISO 8601)",
  'object.unknown': "Campo '{#label}' não é permitido",
};

const j = Joi.defaults((schema) => schema.messages(messages));

const id = () => j.number().integer().positive();
const text = (max = 255) => j.string().trim().max(max);
const email = () => j.string().trim().lowercase().max(254).email({ tlds: { allow: false } });
// bcrypt usa só os primeiros 72 bytes: limite máximo evita senhas truncadas em silêncio.
const password = () => j.string().min(8).max(72);
const isoDate = () => j.date().iso();

const idParams = j.object({ id: id().required() });

const MAX_PAGE_SIZE = 100;
const pagination = {
  page: j.number().integer().min(1).default(1),
  // Valores acima do máximo são limitados em parsePagination (não rejeitados).
  pageSize: j.number().integer().min(1).default(10),
  sortBy: j.string().max(50),
  sortDir: j.string().valid('ASC', 'DESC', 'asc', 'desc'),
};

module.exports = {
  Joi: j,
  id,
  text,
  email,
  password,
  isoDate,
  idParams,
  pagination,
  MAX_PAGE_SIZE,
};
