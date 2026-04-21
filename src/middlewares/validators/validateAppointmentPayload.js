// Appointment payload validation middleware for branch-aware creation and status updates.
const { ValidationError } = require('../../utils/errorHandler');

const isEmpty = (value) => value === undefined || value === null || String(value).trim() === '';
const isPositiveInt = (value) => Number.isInteger(Number(value)) && Number(value) > 0;
const allowedStatus = ['pendente', 'confirmado', 'cancelado'];

const validateCreate = (req, res, next) => {
  try {
    const { user_id, barber_id, service_id, branch_id, appointment_date, status } = req.body;
    if (!isPositiveInt(user_id)) throw new ValidationError("Campo 'user_id' é obrigatório e deve ser um inteiro positivo");
    if (!isPositiveInt(barber_id)) throw new ValidationError("Campo 'barber_id' é obrigatório e deve ser um inteiro positivo");
    if (!isPositiveInt(service_id)) throw new ValidationError("Campo 'service_id' é obrigatório e deve ser um inteiro positivo");
    if (!isPositiveInt(branch_id)) throw new ValidationError("Campo 'branch_id' é obrigatório e deve ser um inteiro positivo");
    if (isEmpty(appointment_date)) throw new ValidationError("Campo 'appointment_date' é obrigatório");
    if (!allowedStatus.includes(String(status))) throw new ValidationError('Status inválido');
    return next();
  } catch (error) {
    return next(error);
  }
};

const validateUpdateStatus = (req, res, next) => {
  try {
    const { status } = req.body;
    if (!allowedStatus.includes(String(status))) throw new ValidationError('Status inválido');
    return next();
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  validateCreate,
  validateUpdateStatus,
};