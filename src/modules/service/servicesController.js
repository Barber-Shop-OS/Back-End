// Service controller for listing and CRUD operations.
const serviceService = require('./serviceService');
const { success, created, noContent } = require('../../utils/responseHandler');

const createService = async (req, res, next) => {
  try {
    const service = await serviceService.create(req.body);
    return created(res, { message: 'Serviço criado com sucesso', service });
  } catch (error) {
    return next(error);
  }
};

const getAllServices = async (req, res, next) => {
  try {
    const services = await serviceService.findAll(req.query);
    return success(res, services);
  } catch (error) {
    return next(error);
  }
};

const getServiceById = async (req, res, next) => {
  try {
    const service = await serviceService.findById(req.params.id);
    return success(res, service);
  } catch (error) {
    return next(error);
  }
};

const updateService = async (req, res, next) => {
  try {
    const service = await serviceService.update(req.params.id, req.body);
    return success(res, { message: 'Serviço atualizado com sucesso', service });
  } catch (error) {
    return next(error);
  }
};

const deleteService = async (req, res, next) => {
  try {
    await serviceService.remove(req.params.id);
    return noContent(res);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  createService,
  getAllServices,
  getServiceById,
  updateService,
  deleteService,
};