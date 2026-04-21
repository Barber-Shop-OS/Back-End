// Service payload validation middleware for the module-based structure.
const { ValidationError } = require('../../utils/errorHandler');

const isEmpty = (value) => value === undefined || value === null || String(value).trim() === '';

const validateCreate = (req, res, next) => {
  try {
    const { name, description, price, duration, barbershop_id } = req.body;
    if (isEmpty(name)) throw new ValidationError("Campo 'name' é obrigatório");
    if (isEmpty(description)) throw new ValidationError("Campo 'description' é obrigatório");
    if (!Number.isInteger(Number(barbershop_id)) || Number(barbershop_id) <= 0) {
      throw new ValidationError("Campo 'barbershop_id' é obrigatório e deve ser um inteiro positivo");
    }
    if (price === undefined || price === null || isNaN(Number(price)) || Number(price) <= 0) {
      throw new ValidationError('Preço deve ser um número positivo');
    }
    if (duration === undefined || duration === null || isNaN(Number(duration)) || Number(duration) <= 0) {
      throw new ValidationError('Duração deve ser um número positivo');
    }
    return next();
  } catch (error) {
    return next(error);
  }
};

const validateUpdate = (req, res, next) => {
  try {
    const { name, description, price, duration, barbershop_id } = req.body;
    if (isEmpty(name)) throw new ValidationError("Campo 'name' é obrigatório");
    if (isEmpty(description)) throw new ValidationError("Campo 'description' é obrigatório");
    if (!Number.isInteger(Number(barbershop_id)) || Number(barbershop_id) <= 0) {
      throw new ValidationError("Campo 'barbershop_id' é obrigatório e deve ser um inteiro positivo");
    }
    if (price === undefined || price === null || isNaN(Number(price)) || Number(price) <= 0) {
      throw new ValidationError('Preço deve ser um número positivo');
    }
    if (duration === undefined || duration === null || isNaN(Number(duration)) || Number(duration) <= 0) {
      throw new ValidationError('Duração deve ser um número positivo');
    }
    return next();
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  validateCreate,
  validateUpdate,
};