// Sprint 0.4: Barber controller with Portuguese messages
const barberService = require('../services/barberService');
const { success, created, noContent } = require('../utils/responseHandler');

// Get all barbers
const getAllBarbers = async (req, res, next) => {
    try {
        const barbers = await barberService.getAllBarbers(req.query);
        return success(res, barbers);
    } catch (err) {
        return next(err);
    }
};

// Get barber by ID
const getBarberById = async (req, res, next) => {
    const { id } = req.params;
    try {
        const barber = await barberService.getBarberById(id);
        return success(res, barber);
    } catch (err) {
        return next(err);
    }
};

// Create new barber
const createBarber = async (req, res, next) => {
  try {
    const barber = await barberService.createBarber(req.body);
    return created(res, barber);
  } catch (err) {
        return next(err);
  }
};

// Update barber
const updateBarber = async (req, res, next) => {
    const { id } = req.params;
    try {
        const barber = await barberService.updateBarber(id, req.body);
        return success(res, { message: 'Barbeiro atualizado com sucesso', barber });
    } catch (err) {
        return next(err);
    }
};

// Delete barber
const deleteBarber = async (req, res, next) => {
    const { id } = req.params;
    try {
        await barberService.deleteBarber(id);
        return noContent(res);
    } catch (err) {
        return next(err);
    }
};

module.exports = {
    getAllBarbers,
    getBarberById,
    createBarber,
    updateBarber,
    deleteBarber
};