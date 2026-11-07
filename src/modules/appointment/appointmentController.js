// Appointment controller for query, detail, create, update, and delete operations.
const appointmentService = require('./appointmentService');
const { success, created, noContent } = require('../../utils/responseHandler');

const getAllAppointments = async (req, res, next) => {
  try {
    const result = await appointmentService.findAll(req.query, req.user);
    return success(res, result);
  } catch (error) {
    return next(error);
  }
};

const getAppointmentById = async (req, res, next) => {
  try {
    const appointment = await appointmentService.findById(req.params.id, req.user);
    return success(res, appointment);
  } catch (error) {
    return next(error);
  }
};

const createAppointment = async (req, res, next) => {
  try {
    const appointment = await appointmentService.create(req.body, req.user);
    return created(res, { message: 'Agendamento criado com sucesso', appointment });
  } catch (error) {
    return next(error);
  }
};

const updateAppointmentStatus = async (req, res, next) => {
  try {
    const appointment = await appointmentService.updateStatus(req.params.id, req.body.status, req.user);
    return success(res, { message: 'Status do agendamento atualizado com sucesso', appointment });
  } catch (error) {
    return next(error);
  }
};

const deleteAppointment = async (req, res, next) => {
  try {
    await appointmentService.remove(req.params.id);
    return noContent(res);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getAllAppointments,
  getAppointmentById,
  createAppointment,
  updateAppointmentStatus,
  deleteAppointment,
};