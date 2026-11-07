// Service payload validation middleware for the module-based structure.
const { ValidationError } = require('../../utils/errorHandler');

const isEmpty = (value) => value === undefined || value === null || String(value).trim() === '';
const isPositiveNumber = (value) => value !== null && value !== undefined && !isNaN(Number(value)) && Number(value) > 0;

const validateCreate = (req, res, next) => {
  try {
    const { name, description, price, duration, barbershop_id } = req.body;

    if (isEmpty(name)) throw new ValidationError("Campo 'name' é obrigatório");
    if (isEmpty(description)) throw new ValidationError("Campo 'description' é obrigatório");
    if (!Number.isInteger(Number(barbershop_id)) || Number(barbershop_id) <= 0) {
      throw new ValidationError("Campo 'barbershop_id' é obrigatório e deve ser um inteiro positivo");
    }
    if (!isPositiveNumber(price)) throw new ValidationError('Preço deve ser um número positivo');
    if (!isPositiveNumber(duration)) throw new ValidationError('Duração deve ser um número positivo');

    return next();
  } catch (error) {
    return next(error);
  }
};

// Update parcial: valida apenas os campos enviados. barbershop_id é barrado no service (imutável).
const validateUpdate = (req, res, next) => {
  try {
    const body = req.body || {};
    if (!Object.keys(body).length) throw new ValidationError('Nenhum campo para atualizar');
    if ('name' in body && isEmpty(body.name)) throw new ValidationError("Campo 'name' é obrigatório");
    if ('description' in body && isEmpty(body.description)) throw new ValidationError("Campo 'description' é obrigatório");
    if ('price' in body && !isPositiveNumber(body.price)) throw new ValidationError('Preço deve ser um número positivo');
    if ('duration' in body && !isPositiveNumber(body.duration)) throw new ValidationError('Duração deve ser um número positivo');

    return next();
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  validateCreate,
  validateUpdate,
};
