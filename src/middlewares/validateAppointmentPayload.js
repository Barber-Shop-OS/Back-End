// Sprint 0.4: Appointment payload validation middleware with Portuguese messages
const { ValidationError } = require('../utils/errorHandler');
const isEmpty = (v) => v === undefined || v === null || String(v).trim() === '';
const isPositiveInt = (v) => Number.isInteger(Number(v)) && Number(v) > 0;
const allowedStatus = ['pendente', 'confirmado', 'cancelado'];

const validateCreate = (req, res, next) => {
  const { user_id, barber_id, service_id, appointment_date, status } = req.body;
  try {
    if (!isPositiveInt(user_id)) throw new ValidationError("Campo 'user_id' é obrigatório e deve ser um inteiro positivo");
    if (!isPositiveInt(barber_id)) throw new ValidationError("Campo 'barber_id' é obrigatório e deve ser um inteiro positivo");
    if (!isPositiveInt(service_id)) throw new ValidationError("Campo 'service_id' é obrigatório e deve ser um inteiro positivo");
    if (isEmpty(appointment_date)) throw new ValidationError("Campo 'appointment_date' é obrigatório");
    if (!allowedStatus.includes(String(status))) throw new ValidationError('Status inválido');
    next();
  } catch (err) {
    return next(err);
  }
};

const validateUpdateStatus = (req, res, next) => {
  const { status } = req.body;
  try {
    if (!allowedStatus.includes(String(status))) throw new ValidationError('Status inválido');
    next();
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  validateCreate,
  validateUpdateStatus,
};
