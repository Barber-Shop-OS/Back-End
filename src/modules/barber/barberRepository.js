// Barber repository with CRUD and filtered listing.
const { Op } = require('sequelize');
const { Barber, User, Appointment, Service, BarberService } = require('../../models');

// Nunca incluir e-mail/senha do usuário: o barbeiro é exibido em páginas públicas (SEC-06).
const publicInclude = () => [
  { model: User, attributes: ['id', 'name'] },
  // BE-19: serviços ativos que o barbeiro executa.
  { model: Service, attributes: ['id', 'name'], through: { attributes: [] }, where: { active: true }, required: false },
];

/** ids de barbeiros que executam o serviço. */
const barberIdsForService = async (serviceId) =>
  (await BarberService.findAll({ where: { service_id: serviceId }, attributes: ['barber_id'], raw: true })).map(
    (row) => row.barber_id
  );

/** Substitui a lista de serviços do barbeiro. */
const replaceServices = async (barberId, serviceIds, options = {}) => {
  await BarberService.destroy({ where: { barber_id: barberId }, ...options });
  if (serviceIds.length) {
    await BarberService.bulkCreate(
      serviceIds.map((serviceId) => ({ barber_id: barberId, service_id: serviceId })),
      options
    );
  }
};

const performsService = async (barberId, serviceId) =>
  (await BarberService.count({ where: { barber_id: barberId, service_id: serviceId } })) > 0;

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
  barberIdsForService,
  replaceServices,
  performsService,
  findAll,
  findById,
  findByUserAndBranch,
  create,
  update,
  countActiveProfiles,
  findFutureAppointments,
};
