// Payment repository for appointment payment operations.
const { Payment, Appointment } = require('../../models');

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

module.exports = {
  create,
  findById,
  update,
  findByAppointmentId,
};