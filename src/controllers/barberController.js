const barberService = require('../services/barberService');
const { success, created, noContent } = require('../utils/responseHandler');

// Função para gerenciar barbers
const getAllBarbers = async (req, res, next) => {
    try {
        const barbers = await barberService.getAllBarbers(req.query);
        return success(res, barbers);
    } catch (err) {
        return next(err);
    }
};

// Função para obter um barber por ID
const getBarberById = async (req, res, next) => {
    const { id } = req.params;
    try {
        const barber = await barberService.getBarberById(id);
        return success(res, barber);
    } catch (err) {
        return next(err);
    }
};

// Função para criar um novo barber
const createBarber = async (req, res, next) => {
  try {
    const barber = await barberService.createBarber(req.body);
    return created(res, barber);
  } catch (err) {
        return next(err);
  }
};

// Função para atualizar um barber existente
const updateBarber = async (req, res, next) => {
    const { id } = req.params;
    try {
        const barber = await barberService.updateBarber(id, req.body);
        return success(res, barber);
    } catch (err) {
        return next(err);
    }
};

// Função para remover um barber
const deleteBarber = async (req, res, next) => {
    const { id } = req.params;
    try {
        await barberService.deleteBarber(id);
        return noContent(res);
    } catch (err) {
        return next(err);
    }
};

// Exporta as funções do controlador de Barbeiro
module.exports = {
    getAllBarbers,
    getBarberById,
    createBarber,
    updateBarber,
    deleteBarber
};