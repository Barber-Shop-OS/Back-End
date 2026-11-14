// Barber repository with CRUD and filtered listing.
const { Op } = require('sequelize');
const { Barber, User, Appointment } = require('../../models');

// Nunca incluir e-mail/senha do usuário: o barbeiro é exibido em páginas públicas (SEC-06).
const publicInclude = () => [{ model: User, attributes: ['id', 'name'] }];

const findAll = async (where = {}, options = {}) =>
  Barber.findAndCountAll({
    where,
    ...options,
    include: options.include || publicInclude(),
    distinct: true,
  });

const findById = async (id, options = {}) =>
  Barber.findByPk(id, { include: options.include || publicInclude(), transaction: options.transaction });

const findByUserAndBranch = async (userId, branchId, options = {}) =>
  Barber.findOne({ where: { user_id: userId, branch_id: branchId }, ...options });

const create = async (data, options = {}) => Barber.create(data, options);

const update = async (id, data, options = {}) => {
  const barber = await Barber.findByPk(id, options);
  if (!barber) return null;
  return barber.update(data, options);
};

const countActiveProfiles = async (userId, options = {}) =>
  Barber.count({ where: { user_id: userId, active: true }, ...options });

/** Agendamentos ainda por acontecer (confirmados) do barbeiro. */
const findFutureAppointments = async (barberId, options = {}) =>
  Appointment.findAll({
    where: {
      barber_id: barberId,
      status: 'confirmado',
      start_at: { [Op.gt]: new Date() },
    },
    ...options,
  });

module.exports = {
  findAll,
  findById,
  findByUserAndBranch,
  create,
  update,
  countActiveProfiles,
  findFutureAppointments,
};
