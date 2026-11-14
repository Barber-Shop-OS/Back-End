// Branch controller responsible for combined branch and address operations.
const branchService = require('./branchService');
const { success, created } = require('../../utils/responseHandler');

const { ADDRESS_FIELDS } = require('../address/addressService');

/** Separa os campos de endereço (BE-17) dos campos da filial no mesmo corpo. */
const splitPayload = (body) => {
  const branchData = {};
  const addressData = {};
  Object.entries(body).forEach(([key, value]) => {
    if (ADDRESS_FIELDS.includes(key)) {
      if (value !== undefined) addressData[key] = value;
    } else {
      branchData[key] = value;
    }
  });
  return { branchData, addressData: Object.keys(addressData).length ? addressData : null };
};

const getAll = async (req, res, next) => {
  try {
    const result = await branchService.findAll(req.query, req.user);
    return success(res, result);
  } catch (error) {
    return next(error);
  }
};

const getById = async (req, res, next) => {
  try {
    const branch = await branchService.findById(req.params.id);
    return success(res, branch);
  } catch (error) {
    return next(error);
  }
};

const create = async (req, res, next) => {
  try {
    const { branchData, addressData } = splitPayload(req.body);
    const branch = await branchService.create(branchData, addressData, req.user);
    return created(res, { message: 'Filial criada com sucesso', branch });
  } catch (error) {
    return next(error);
  }
};

const update = async (req, res, next) => {
  try {
    const { branchData, addressData } = splitPayload(req.body);
    const branch = await branchService.update(req.params.id, branchData, addressData, req.user);
    return success(res, { message: 'Filial atualizada com sucesso', branch });
  } catch (error) {
    return next(error);
  }
};

const remove = async (req, res, next) => {
  try {
    await branchService.remove(req.params.id, req.user);
    return success(res, { message: 'Filial removida com sucesso' });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getAll,
  getById,
  create,
  update,
  remove,
};