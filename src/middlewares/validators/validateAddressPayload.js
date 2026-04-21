// Address payload validation middleware for direct and branch-based address flows.
const { ValidationError } = require('../../utils/errorHandler');

const isEmpty = (value) => value === undefined || value === null || String(value).trim() === '';

module.exports = (req, res, next) => {
  try {
    const { cep, number, city, state } = req.body;
    const errors = [];

    if (isEmpty(cep) || !/^[0-9]{8}(-?[0-9]{3})?$/.test(String(cep))) errors.push('CEP inválido');
    if (isEmpty(number) || !Number.isInteger(Number(number)) || Number(number) <= 0) errors.push('número inválido');
    if (isEmpty(city)) errors.push('cidade obrigatória');
    if (isEmpty(state) || String(state).trim().length !== 2) errors.push('estado inválido');

    if (errors.length) {
      throw new ValidationError('Campos de endereço inválidos: ' + errors.join(', '));
    }

    return next();
  } catch (error) {
    return next(error);
  }
};