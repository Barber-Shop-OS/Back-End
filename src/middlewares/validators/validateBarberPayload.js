// Barber payload validation middleware for the module-based structure.
const { ValidationError } = require('../../utils/errorHandler');

const isEmpty = (value) => value === undefined || value === null || String(value).trim() === '';
const isPositiveInt = (value) => Number.isInteger(Number(value)) && Number(value) > 0;

const validateCreate = (req, res, next) => {
  try {
    const { user_id, branch_id, bio } = req.body;

    if (!isPositiveInt(user_id)) throw new ValidationError("Campo 'user_id' é obrigatório e deve ser um inteiro positivo");
    if (!isPositiveInt(branch_id)) throw new ValidationError("Campo 'branch_id' é obrigatório e deve ser um inteiro positivo");
    if (isEmpty(bio)) throw new ValidationError("Campo 'bio' é obrigatório");

    return next();
  } catch (error) {
    return next(error);
  }
};

// Update parcial: valida apenas os campos enviados. Campos proibidos são barrados no service.
const validateUpdate = (req, res, next) => {
  try {
    const body = req.body || {};
    if (!Object.keys(body).length) throw new ValidationError('Nenhum campo para atualizar');
    if ('branch_id' in body && !isPositiveInt(body.branch_id)) {
      throw new ValidationError("Campo 'branch_id' deve ser um inteiro positivo");
    }
    if ('bio' in body && isEmpty(body.bio)) throw new ValidationError("Campo 'bio' é obrigatório");

    return next();
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  validateCreate,
  validateUpdate,
};
