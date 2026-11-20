// Payment repository: pagamentos presenciais (BE-07).
const { Payment, Appointment, Barber, User, sequelize } = require('../../models');

const create = async (data) => Payment.create(data);

const findById = async (id, includeOptions = []) => {
  return Payment.findByPk(id, {
    include: includeOptions.length ? includeOptions : [Appointment],
  });
};

const update = async (id, data) => {
  const payment = await Payment.findByPk(id);
  if (!payment) return null;
  return payment.update(data);
};

const findByAppointmentId = async (appointmentId, includeOptions = []) => {
  return Payment.findOne({
    where: { appointment_id: appointmentId },
    include: includeOptions.length ? includeOptions : [Appointment],
  });
};

// Barbeiro só vê pagamentos dos próprios atendimentos: filtro pelo vínculo barbers.user_id.
const appointmentInclude = (barberUserId, withAttributes) => ({
  model: Appointment,
  attributes: withAttributes
    ? ['id', 'start_at', 'end_at', 'service_name_snapshot', 'price_snapshot', 'status', 'branch_id', 'barber_id', 'user_id']
    : [],
  required: Boolean(barberUserId),
  include: [
    {
      model: Barber,
      attributes: withAttributes ? ['id', 'display_name', 'user_id'] : [],
      required: Boolean(barberUserId),
      ...(barberUserId ? { where: { user_id: barberUserId } } : {}),
    },
    ...(withAttributes ? [{ model: User, as: 'client', attributes: ['id', 'name'] }] : []),
  ],
});

/** Página de pagamentos + totais agregados sobre o mesmo filtro. */
const list = async ({ where, barberUserId, offset, limit }) => {
  const result = await Payment.findAndCountAll({
    where,
    include: [appointmentInclude(barberUserId, true)],
    order: [['created_at', 'DESC'], ['id', 'DESC']],
    offset,
    limit,
    distinct: true,
  });

  const groups = await Payment.findAll({
    where,
    include: [appointmentInclude(barberUserId, false)],
    attributes: [
      [sequelize.col('Payment.status'), 'status'],
      [sequelize.col('Payment.method'), 'method'],
      [sequelize.fn('COUNT', sequelize.col('Payment.id')), 'count'],
      [sequelize.fn('SUM', sequelize.col('Payment.amount')), 'sum'],
    ],
    group: ['Payment.status', 'Payment.method'],
    raw: true,
  });

  return { result, groups };
};

module.exports = {
  create,
  findById,
  update,
  findByAppointmentId,
  list,
};
