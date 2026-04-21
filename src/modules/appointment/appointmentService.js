// Appointment service with branch validation and related entity lookup.
const { Op } = require('sequelize');
const { Appointment, User, Barber, Service, Branch } = require('../../models');
const appointmentRepository = require('./appointmentRepository');
const { ValidationError, NotFoundError } = require('../../utils/errorHandler');

const allowedStatus = ['pendente', 'confirmado', 'cancelado'];

const findAll = async (query = {}) => {
  const page = Number(query.page) > 0 ? Number(query.page) : 1;
  const pageSize = Number(query.pageSize) > 0 ? Number(query.pageSize) : 10;
  const offset = (page - 1) * pageSize;
  const where = {};

  if (query.status) where.status = query.status;
  if (query.user_id) where.user_id = Number(query.user_id);
  if (query.barber_id) where.barber_id = Number(query.barber_id);
  if (query.service_id) where.service_id = Number(query.service_id);
  if (query.branch_id) where.branch_id = Number(query.branch_id);

  if (query.from || query.to) {
    where.appointment_date = {};
    if (query.from) where.appointment_date[Op.gte] = new Date(query.from);
    if (query.to) where.appointment_date[Op.lte] = new Date(query.to);
  }

  const allowedSortFields = ['appointment_date', 'status', 'created_at'];
  const sortBy = allowedSortFields.includes(String(query.sortBy)) ? String(query.sortBy) : 'appointment_date';
  const sortDir = String(query.sortDir).toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

  const result = await appointmentRepository.findAll(where, {
    limit: pageSize,
    offset,
    order: [[sortBy, sortDir]],
  });

  return {
    items: result.rows,
    page,
    pageSize,
    total: result.count,
    totalPages: Math.ceil(result.count / pageSize),
  };
};

const findById = async (id) => {
  const appointment = await appointmentRepository.findById(id);
  if (!appointment) {
    throw new NotFoundError('Agendamento não encontrado');
  }
  return appointment;
};

const create = async (payload) => {
  const { user_id, barber_id, service_id, branch_id, appointment_date, status } = payload;

  if (!Number.isInteger(Number(user_id)) || Number(user_id) <= 0) throw new ValidationError("Campo 'user_id' é obrigatório e deve ser um inteiro positivo");
  if (!Number.isInteger(Number(barber_id)) || Number(barber_id) <= 0) throw new ValidationError("Campo 'barber_id' é obrigatório e deve ser um inteiro positivo");
  if (!Number.isInteger(Number(service_id)) || Number(service_id) <= 0) throw new ValidationError("Campo 'service_id' é obrigatório e deve ser um inteiro positivo");
  if (!Number.isInteger(Number(branch_id)) || Number(branch_id) <= 0) throw new ValidationError("Campo 'branch_id' é obrigatório e deve ser um inteiro positivo");
  if (!appointment_date) throw new ValidationError("Campo 'appointment_date' é obrigatório");
  if (!allowedStatus.includes(status)) throw new ValidationError('Status inválido');

  const user = await User.findByPk(user_id, { attributes: { exclude: ['password'] } });
  if (!user) throw new NotFoundError('Usuário não encontrado');

  const barber = await Barber.findByPk(barber_id);
  if (!barber) throw new NotFoundError('Barbeiro não encontrado');

  const service = await Service.findByPk(service_id);
  if (!service) throw new NotFoundError('Serviço não encontrado');

  const branch = await Branch.findByPk(branch_id);
  if (!branch) throw new NotFoundError('Filial não encontrada');

  if (String(barber.branch_id) !== String(branch_id)) {
    throw new ValidationError('Este barbeiro não pertence à filial selecionada');
  }

  const appointment = await appointmentRepository.create({
    user_id,
    barber_id,
    service_id,
    branch_id,
    appointment_date,
    status,
  });

  appointment.dataValues.user = user;
  appointment.dataValues.barber = barber;
  appointment.dataValues.service = service;
  appointment.dataValues.branch = branch;

  return appointment;
};

const updateStatus = async (id, status) => {
  if (!allowedStatus.includes(status)) {
    throw new ValidationError('Status inválido');
  }

  const updated = await appointmentRepository.updateStatus(id, status);
  if (!updated) {
    throw new NotFoundError('Agendamento não encontrado');
  }
  return updated;
};

const remove = async (id) => {
  const ok = await appointmentRepository.delete(id);
  if (!ok) {
    throw new NotFoundError('Agendamento não encontrado');
  }
  return true;
};

module.exports = {
  findAll,
  findById,
  create,
  updateStatus,
  remove,
};