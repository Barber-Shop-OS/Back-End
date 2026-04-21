// Appointment repository with list, lookup, creation, and status updates.
const { Appointment, User, Barber, Service, Branch } = require('../../models');

const findAll = async (where = {}, options = {}) => {
  return Appointment.findAndCountAll({
    where,
    ...options,
    include: options.include || [User, Barber, Service, Branch],
    distinct: true,
  });
};

const findById = async (id, includeOptions = []) => {
  return Appointment.findByPk(id, {
    include: includeOptions.length ? includeOptions : [User, Barber, Service, Branch],
  });
};

const create = async (data) => Appointment.create(data);

const updateStatus = async (id, status) => {
  const appointment = await Appointment.findByPk(id);
  if (!appointment) return null;
  appointment.status = status;
  await appointment.save();
  return appointment;
};

const remove = async (id) => {
  const appointment = await Appointment.findByPk(id);
  if (!appointment) return false;
  await appointment.destroy();
  return true;
};

module.exports = {
  findAll,
  findById,
  create,
  updateStatus,
  delete: remove,
};