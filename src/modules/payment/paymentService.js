// Payment service with validation, duplicate checks, and status updates.
const { Appointment } = require('../../models');
const paymentRepository = require('./paymentRepository');
const { AppError, NotFoundError, ValidationError } = require('../../utils/errorHandler');

const create = async (data) => {
  const { appointment_id, amount, method } = data;

  if (!Number.isInteger(Number(appointment_id)) || Number(appointment_id) <= 0) {
    throw new ValidationError('appointment_id deve ser um inteiro positivo');
  }
  if (isNaN(Number(amount)) || Number(amount) <= 0) {
    throw new ValidationError('amount deve ser um número positivo');
  }
  if (!['PIX', 'CASH'].includes(method)) {
    throw new ValidationError('Método inválido. Use PIX ou CASH');
  }

  const appointment = await Appointment.findByPk(appointment_id);
  if (!appointment) {
    throw new NotFoundError('Agendamento não encontrado');
  }

  const existingPayment = await paymentRepository.findByAppointmentId(appointment_id);
  if (existingPayment) {
    throw new AppError('Pagamento já registrado para este agendamento', 409);
  }

  return paymentRepository.create({
    appointment_id,
    amount,
    method,
    status: 'PENDING',
  });
};

const findById = async (id) => {
  const payment = await paymentRepository.findById(id, [Appointment]);
  if (!payment) {
    throw new NotFoundError('Pagamento não encontrado');
  }
  return payment;
};

const updateStatus = async (id, status) => {
  if (!['PAID', 'FAILED'].includes(status)) {
    throw new ValidationError('Status inválido. Use PAID ou FAILED');
  }

  const currentPayment = await paymentRepository.findById(id);
  if (!currentPayment) {
    throw new NotFoundError('Pagamento não encontrado');
  }

  const payload = { status };
  if (status === 'PAID') {
    payload.paid_at = new Date();
  }

  return paymentRepository.update(id, payload);
};

const findByAppointmentId = async (appointmentId) => {
  const payment = await paymentRepository.findByAppointmentId(appointmentId, [Appointment]);
  if (!payment) {
    throw new NotFoundError('Nenhum pagamento encontrado para este agendamento');
  }
  return payment;
};

module.exports = {
  create,
  findById,
  updateStatus,
  findByAppointmentId,
};