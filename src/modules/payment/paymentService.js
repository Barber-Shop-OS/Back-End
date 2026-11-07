// Payment service: pagamento presencial de um agendamento (BE-03; regras completas em BE-07).
// Criar/alterar: equipe da barbearia (dono, barbeiro que atendeu) ou admin.
// Ler: os mesmos + o cliente do agendamento. Qualquer outro usuário recebe 404.
const { Appointment } = require('../../models');
const paymentRepository = require('./paymentRepository');
const { assertCanViewAppointment, assertCanOperateAppointment } = require('../../shared/authz');
const { NotFoundError, ValidationError, ConflictError, CODES } = require('../../utils/errorHandler');

const create = async (data, currentUser) => {
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

  await assertCanOperateAppointment(currentUser, appointment_id);

  const existingPayment = await paymentRepository.findByAppointmentId(appointment_id);
  if (existingPayment) {
    throw new ConflictError('Pagamento já registrado para este agendamento', CODES.PAYMENT_ALREADY_REGISTERED);
  }

  return paymentRepository.create({
    appointment_id: Number(appointment_id),
    amount,
    method,
    status: 'PENDING',
  });
};

const findById = async (id, currentUser) => {
  const payment = await paymentRepository.findById(id, [Appointment]);
  if (!payment) {
    throw new NotFoundError('Pagamento não encontrado');
  }
  try {
    await assertCanViewAppointment(currentUser, payment.appointment_id);
  } catch (error) {
    if (error instanceof NotFoundError) throw new NotFoundError('Pagamento não encontrado');
    throw error;
  }
  return payment;
};

const updateStatus = async (id, status, currentUser) => {
  if (!['PAID', 'FAILED'].includes(status)) {
    throw new ValidationError('Status inválido. Use PAID ou FAILED');
  }

  const currentPayment = await paymentRepository.findById(id);
  if (!currentPayment) {
    throw new NotFoundError('Pagamento não encontrado');
  }
  try {
    await assertCanOperateAppointment(currentUser, currentPayment.appointment_id);
  } catch (error) {
    if (error instanceof NotFoundError) throw new NotFoundError('Pagamento não encontrado');
    throw error;
  }

  const payload = { status };
  if (status === 'PAID') {
    payload.paid_at = new Date();
  }

  return paymentRepository.update(id, payload);
};

const findByAppointmentId = async (appointmentId, currentUser) => {
  await assertCanViewAppointment(currentUser, appointmentId);
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
