// Address controller for direct address management.
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
    const address = await addressService.findById(req.params.id);
    return success(res, address);
  } catch (error) {
    return next(error);
  }
};

const update = async (req, res, next) => {
  try {
    const address = await addressService.update(req.params.id, req.body);
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