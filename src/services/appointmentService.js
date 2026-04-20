// Sprint 0.4: Appointment service with Portuguese messages
const User = require('../models/user');
const Barber = require('../models/barber');
const Service = require('../models/service');
const AppointmentRepository = require('../repositories/appointmentRepository');
const { ValidationError, NotFoundError } = require('../utils/errorHandler');
const { Op } = require('sequelize');

// Allowed appointment statuses
const allowedStatus = ['pendente', 'confirmado', 'cancelado'];

// Enrich appointment data with related entities
const enrichAppointment = async (appointment) => {
  if (!appointment) return null;
  const user = await User.findByPk(appointment.user_id, {
    attributes: { exclude: ['password'] }
  });
  const barber = await Barber.findByPk(appointment.barber_id);
  const service = await Service.findByPk(appointment.service_id);
  appointment.dataValues.user = user || null;
  appointment.dataValues.barber = barber || null;
  appointment.dataValues.service = service || null;
  return appointment;
};

// Get appointments with filters and pagination
const getAllAppointments = async (query = {}) => {
  const page = Number(query.page) > 0 ? Number(query.page) : 1;
  const pageSize = Number(query.pageSize) > 0 ? Number(query.pageSize) : 10;
  const offset = (page - 1) * pageSize;

  const where = {};
  if (query.status) where.status = query.status;
  if (query.user_id) where.user_id = Number(query.user_id);
  if (query.barber_id) where.barber_id = Number(query.barber_id);
  if (query.service_id) where.service_id = Number(query.service_id);

  // Date range filter
  if (query.from || query.to) {
    where.appointment_date = {};
    if (query.from) where.appointment_date[Op.gte] = new Date(query.from);
    if (query.to) where.appointment_date[Op.lte] = new Date(query.to);
  }

  // Dynamic sorting with whitelist
  const allowedSortFields = ['appointment_date', 'status', 'created_at'];
  const sortBy = allowedSortFields.includes(String(query.sortBy)) ? String(query.sortBy) : 'appointment_date';
  const sortDir = String(query.sortDir).toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

  const { rows, count } = await AppointmentRepository.findAndCount({
    where,
    limit: pageSize,
    offset,
    order: [[sortBy, sortDir]],
  });

  return {
    items: rows,
    page,
    pageSize,
    total: count,
    totalPages: Math.ceil(count / pageSize),
  };
};

// Get appointment by ID
const getAppointmentById = async (id) => {
  const appointment = await AppointmentRepository.findById(id);
  if (!appointment) throw new NotFoundError('Agendamento não encontrado');
  return enrichAppointment(appointment);
};

// Create new appointment
const createAppointment = async (payload) => {
  const { user_id, barber_id, service_id, appointment_date, status } = payload;

  if (!user_id) throw new ValidationError("Campo 'user_id' é obrigatório");
  if (!barber_id) throw new ValidationError("Campo 'barber_id' é obrigatório");
  if (!service_id) throw new ValidationError("Campo 'service_id' é obrigatório");
  if (!appointment_date) throw new ValidationError("Campo 'appointment_date' é obrigatório");
  if (!status) throw new ValidationError("Campo 'status' é obrigatório");
  if (!allowedStatus.includes(status)) throw new ValidationError('Status inválido');

  // Verify all related entities exist
  const user = await User.findByPk(user_id);
  if (!user) throw new NotFoundError('Usuário não encontrado');

  const barber = await Barber.findByPk(barber_id);
  if (!barber) throw new NotFoundError('Barbeiro não encontrado');

  const service = await Service.findByPk(service_id);
  if (!service) throw new NotFoundError('Serviço não encontrado');

  // Create appointment
  const appointment = await AppointmentRepository.create({
    user_id,
    barber_id,
    service_id,
    appointment_date,
    status,
  });

  appointment.dataValues.user = user;
  appointment.dataValues.barber = barber;
  appointment.dataValues.service = service;
  return appointment;
};

// Update appointment status
const updateAppointmentStatus = async (id, status) => {
  if (!status) throw new ValidationError("Campo 'status' é obrigatório");
  if (!allowedStatus.includes(status)) throw new ValidationError('Status inválido');

  const updated = await AppointmentRepository.updateStatus(id, status);
  if (!updated) throw new NotFoundError('Agendamento não encontrado');
  return enrichAppointment(updated);
};

// Delete appointment
const deleteAppointment = async (id) => {
  const ok = await AppointmentRepository.remove(id);
  if (!ok) throw new NotFoundError('Agendamento não encontrado');
  return true;
};

module.exports = {
  getAllAppointments,
  getAppointmentById,
  createAppointment,
  updateAppointmentStatus,
  deleteAppointment,
};
