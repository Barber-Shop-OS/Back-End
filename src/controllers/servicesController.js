const serviceService = require('../services/serviceService');
const { success, created, noContent } = require('../utils/responseHandler');

// Função para gerenciar serviços
const createService = async (req, res, next) => {
    try {
        const service = await serviceService.createService(req.body);
        return created(res, service);
    } catch (err) {
        return next(err);
    }
};

// Função para obter todos os serviços
const getAllServices = async (req, res, next) => {
    try {
        const services = await serviceService.getAllServices(req.query);
        return success(res, services);
    } catch (err) {
        return next(err);
    }
};

// Função para obter um serviço por ID
const getServiceById = async (req, res, next) => {
    const { id } = req.params;
    try {
        const service = await serviceService.getServiceById(id);
        return success(res, service);
    } catch (err) {
        return next(err);
    }
};

// Função para atualizar um serviço existente
const updateService = async (req, res, next) => {
    const { id } = req.params;
    try {
        const service = await serviceService.updateService(id, req.body);
        return success(res, { message: 'Serviço atualizado com sucesso', service });
    } catch (err) {
        return next(err);
    }
};

// Função para remover um serviço
const deleteService = async (req, res, next) => {
    const { id } = req.params;
    try {
        await serviceService.deleteService(id);
        return noContent(res);
    } catch (err) {
        return next(err);
    }
};

// Exporta as funções do controlador de serviços
module.exports = {
    createService,
    getAllServices,
    getServiceById,
    updateService,
    deleteService,
};