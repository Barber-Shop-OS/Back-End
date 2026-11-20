// Appointment repository. Includes com allowlist de atributos: nunca expõe senha/token_version.
const { Appointment, User, Barber, Service, Branch, Barbershop, BarbershopClient } = require('../../models');

const defaultInclude = () => [
  // paranoid: false → conta/filial excluída (BE-36) continua visível no histórico.
  { model: User, as: 'client', attributes: ['id', 'name', 'email', 'phone'], paranoid: false },
  // BE-23: cliente da barbearia (inclui cliente rápido sem conta).
  { model: BarbershopClient, as: 'customer', attributes: ['id', 'name', 'phone', 'email', 'user_id'] },
  {
    model: Barber,
    attributes: ['id', 'user_id', 'branch_id', 'bio'],
    include: [{ model: User, attributes: ['id', 'name'] }],
  },
  // paranoid: false → serviço excluído (soft delete) continua visível no histórico (BE-06).
  { model: Service, attributes: ['id', 'name', 'price', 'duration', 'barbershop_id'], paranoid: false },
  // Barbershop.owner_id só para calcular allowed_actions (BE-15); o presenter remove da resposta.
  {
    model: Branch,
    attributes: ['id', 'name', 'barbershop_id', 'timezone'],
    paranoid: false,
    include: [{ model: Barbershop, attributes: ['id', 'owner_id'], paranoid: false }],
  },
];

const findAll = async (where = {}, options = {}) =>
  Appointment.findAndCountAll({
    where,
    ...options,
    include: options.include || defaultInclude(),
    distinct: true,
  });

const findById = async (id, includeOptions = [], options = {}) =>
  Appointment.findByPk(id, {
    ...options,
    include: includeOptions.length ? includeOptions : defaultInclude(),
  });

const create = async (data) => Appointment.create(data);

const update = async (id, data, options = {}) => {
  const appointment = await Appointment.findByPk(id, options);
  if (!appointment) return null;
  return appointment.update(data, options);
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
  update,
  delete: remove,
};
