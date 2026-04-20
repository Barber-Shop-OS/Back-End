// Sprint 0.4: Services controller with Portuguese messages
const serviceService = require('../services/serviceService');
const { success, created, noContent } = require('../utils/responseHandler');

// Create new service
const createService = async (req, res, next) => {
    try {
        const service = await serviceService.createService(req.body);
        return created(res, service);
    } catch (err) {
        return next(err);
    }
};

// Get all services
const getAllServices = async (req, res, next) => {
    try {
        const services = await serviceService.getAllServices(req.query);
        return success(res, services);
    } catch (err) {
        return next(err);
    }
};

// Get service by ID
const getServiceById = async (req, res, next) => {
    const { id } = req.params;
    try {
        const service = await serviceService.getServiceById(id);
        return success(res, service);
    } catch (err) {
        return next(err);
    }
};

// Update service
const updateService = async (req, res, next) => {
    const { id } = req.params;
    try {
        const service = await serviceService.updateService(id, req.body);
        return success(res, { message: 'Serviço atualizado com sucesso', service });
    } catch (err) {
        return next(err);
    }
};

// Delete service
const deleteService = async (req, res, next) => {
    const { id } = req.params;
    try {
        await serviceService.deleteService(id);
        return noContent(res);
    } catch (err) {
        return next(err);
    }
};

module.exports = {
    createService,
    getAllServices,
    getServiceById,
    updateService,
    deleteService,
};