// BE-38 / SEC-09: validação de entrada com Joi para body, query e params.
// - query/params: campos desconhecidos são descartados; valores convertidos substituem os originais.
// - body: campos desconhecidos são mantidos para que o service os rejeite explicitamente (pickFields),
//   em vez de ignorá-los em silêncio.
const { ValidationError } = require('../utils/errorHandler');

const OPTIONS = {
  body: { abortEarly: false, convert: true, allowUnknown: true, stripUnknown: false },
  query: { abortEarly: false, convert: true, allowUnknown: true, stripUnknown: true },
  params: { abortEarly: false, convert: true, allowUnknown: false },
};

const formatDetails = (error) =>
  error.details.map((detail) => ({
    field: detail.path.join('.'),
    message: detail.message.replace(/"/g, "'"),
  }));

const validate = (schemas = {}) => (req, res, next) => {
  for (const part of ['params', 'query', 'body']) {
    const schema = schemas[part];
    if (!schema) continue;

    const { value, error } = schema.validate(req[part] === undefined ? {} : req[part], OPTIONS[part]);
    if (error) {
      const details = formatDetails(error);
      return next(new ValidationError(details[0].message, details));
    }
    req[part] = value;
  }
  return next();
};

module.exports = validate;
