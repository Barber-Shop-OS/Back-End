// Address controller para gestão direta de endereços (acesso restrito ao tenant — BE-03).
const addressService = require('./addressService');
const { created, success } = require('../../utils/responseHandler');

const create = async (req, res, next) => {
  try {
    const address = await addressService.create(req.body);
    return created(res, address);
  } catch (error) {
    return next(error);
  }
};

const getById = async (req, res, next) => {
  try {
    const address = await addressService.findById(req.params.id, req.user);
    return success(res, address);
  } catch (error) {
    return next(error);
  }
};

const update = async (req, res, next) => {
  try {
    const address = await addressService.updateAsUser(req.params.id, req.body, req.user);
    return success(res, address);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  create,
  getById,
  update,
};
