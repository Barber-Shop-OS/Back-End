const appointmentService = require('../services/appointmentService');
const { success, created, noContent } = require('../utils/responseHandler');

// Função para gerenciar agendamentos
const getAllAppointments = async (req, res, next) => {
    try {
        const result = await appointmentService.getAllAppointments(req.query);
        return success(res, result);
    } catch (err) {
        return next(err);
    }
};

// Função para obter um agendamento por ID
const getAppointmentById = async (req, res, next) => {
    const { id } = req.params;
    try {
        const appointment = await appointmentService.getAppointmentById(id);
        return success(res, appointment);
    } catch (err) {
        return next(err);
    }
};

// Função para criar um novo agendamento
const createAppointment = async (req, res, next) => {
  try {
    const appointment = await appointmentService.createAppointment(req.body);
    return created(res, appointment);
  } catch (err) {
        return next(err);
  }
};

// Função para atualizar o status de um agendamento
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

// Função para remover um agendamento
const deleteAppointment = async (req, res, next) => {
    const { id } = req.params;
    try {
        await appointmentService.deleteAppointment(id);
        return noContent(res);
    } catch (err) {
        return next(err);
    }
};

// Exporta as funções do controlador de agendamento
module.exports = {
    getAllAppointments,
    getAppointmentById,
    createAppointment,
    updateAppointmentStatus,
    deleteAppointment
};