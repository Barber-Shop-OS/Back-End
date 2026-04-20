// Sprint 0.4: Service payload validation middleware with Portuguese messages
const { ValidationError } = require('../utils/errorHandler');
const isEmpty = (v) => v === undefined || v === null || String(v).trim() === '';

// Validate payload for service creation and update
const validateCreate = (req, res, next) => {
  const { name, description, price, duration } = req.body;
  try {
    if (isEmpty(name)) throw new ValidationError("Campo 'name' é obrigatório");
    if (isEmpty(description)) throw new ValidationError("Campo 'description' é obrigatório");
    if (price === undefined || price === null || isNaN(Number(price)) || Number(price) <= 0) {
      throw new ValidationError('Preço deve ser um número positivo');
    }
    if (duration === undefined || duration === null || isNaN(Number(duration)) || Number(duration) <= 0) {
      throw new ValidationError('Duração deve ser um número positivo');
    }
    next();
  } catch (err) {
    return next(err);
  }
};

// Validate payload for service update
const validateUpdate = (req, res, next) => {
  const { name, description, price, duration } = req.body;
  try {
    if (isEmpty(name)) throw new ValidationError("Campo 'name' é obrigatório");
    if (isEmpty(description)) throw new ValidationError("Campo 'description' é obrigatório");
    if (price === undefined || price === null || isNaN(Number(price)) || Number(price) <= 0) {
      throw new ValidationError('Preço deve ser um número positivo');
    }
    if (duration === undefined || duration === null || isNaN(Number(duration)) || Number(duration) <= 0) {
      throw new ValidationError('Duração deve ser um número positivo');
    }
    next();
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  validateCreate,
  validateUpdate,
};
