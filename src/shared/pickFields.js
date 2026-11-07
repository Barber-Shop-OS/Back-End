// Whitelist de campos para updates (BE-03). Campo fora da lista → 400, nunca ignorado em silêncio,
// para que o cliente da API perceba que tentou alterar algo proibido.
const { ValidationError } = require('../utils/errorHandler');

const pickFields = (data = {}, allowedFields = []) => {
  const source = data && typeof data === 'object' ? data : {};
  const forbidden = Object.keys(source).filter((key) => !allowedFields.includes(key));
  if (forbidden.length) {
    throw new ValidationError(`Campos não permitidos: ${forbidden.join(', ')}`);
  }
  return Object.fromEntries(Object.entries(source).filter(([, value]) => value !== undefined));
};

module.exports = { pickFields };
