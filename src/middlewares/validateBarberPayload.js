// Sprint 0.4: Barber payload validation middleware with Portuguese messages
const { ValidationError } = require('../utils/errorHandler');
const isEmpty = (v) => v === undefined || v === null || String(v).trim() === '';
const isPositiveInt = (v) => Number.isInteger(Number(v)) && Number(v) > 0;

// Validate payload for barber creation
const validateCreate = (req, res, next) => {
  const { user_id, bio } = req.body;
  try {
    if (!isPositiveInt(user_id)) throw new ValidationError("Campo 'user_id' é obrigatório e deve ser um inteiro positivo");
    if (isEmpty(bio)) throw new ValidationError("Campo 'bio' é obrigatório");
    next();
  } catch (err) {
    return next(err);
  }
};

// Validate payload for barber update
const validateUpdate = (req, res, next) => {
  const { bio } = req.body;
  try {
    if (isEmpty(bio)) throw new ValidationError("Campo 'bio' é obrigatório");
    next();
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  validateCreate,
  validateUpdate,
};
