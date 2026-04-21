// Payment payload validation middleware for appointment payments.
const { ValidationError } = require('../../utils/errorHandler');

const isEmpty = (value) => value === undefined || value === null || String(value).trim() === '';

module.exports = (req, res, next) => {
  try {
    const { appointment_id, amount, method } = req.body;
    const errors = [];

    if (isEmpty(appointment_id) || !Number.isInteger(Number(appointment_id)) || Number(appointment_id) <= 0) errors.push('appointment_id inválido');
    if (isEmpty(amount) || isNaN(Number(amount)) || Number(amount) <= 0) errors.push('amount inválido');
    if (!['PIX', 'CASH'].includes(method)) errors.push('method deve ser PIX ou CASH');

    if (errors.length) {
      throw new ValidationError('Campos de pagamento inválidos: ' + errors.join(', '));
    }

    return next();
  } catch (error) {
    return next(error);
  }
};