// Sprint 0.4: Appointment controller with Portuguese messages
const appointmentService = require('../services/appointmentService');
const { success, created, noContent } = require('../utils/responseHandler');

// Get all appointments
const getAllAppointments = async (req, res, next) => {
    try {
        const result = await appointmentService.getAllAppointments(req.query);
        return success(res, result);
    } catch (err) {
        return next(err);
    }
};

// Get appointment by ID
const getAppointmentById = async (req, res, next) => {
    const { id } = req.params;
    try {
        const appointment = await appointmentService.getAppointmentById(id);
        return success(res, appointment);
    } catch (err) {
        return next(err);
    }
};

// Create new appointment
const createAppointment = async (req, res, next) => {
  try {
    const appointment = await appointmentService.createAppointment(req.body);
    return created(res, appointment);
  } catch (err) {
        return next(err);
  }
};

// Update appointment status
const updateAppointmentStatus = async (req, res, next) => {
    const { id } = req.params;
    const { status } = req.body;
    try {
        const appointment = await appointmentService.updateAppointmentStatus(id, status);
        return success(res, { message: 'Status do agendamento atualizado com sucesso', appointment });
    } catch (err) {
        return next(err);
    }
};

// Delete appointment
const deleteAppointment = async (req, res, next) => {
    const { id } = req.params;
    try {
        await appointmentService.deleteAppointment(id);
        return noContent(res);
    } catch (err) {
        return next(err);
    }
};

module.exports = {
    getAllAppointments,
    getAppointmentById,
    createAppointment,
    updateAppointmentStatus,
    deleteAppointment
};