// BE-20: dados do próprio usuário. Tudo é escopado por req.user.id — não há id na rota.
const { Op } = require('sequelize');
const { User, Barbershop, Barber, Branch, Appointment, Service } = require('../../models');
const userService = require('../user/userService');
const { parsePagination, paginated } = require('../../shared/query');
const { PRIVATE_USER_FIELDS } = require('../../shared/sanitizeUser');
const { NotFoundError } = require('../../utils/errorHandler');
const { present } = require('../appointment/appointmentPresenter');

// Extensões de /api/me registradas por outros módulos (ex.: billing_banner — BE-35).
const profileExtensions = [];
const addProfileExtension = (fn) => profileExtensions.push(fn);

const listBarbershops = async (userId) => {
  const rows = await Barbershop.findAll({
    where: { owner_id: userId, status: { [Op.ne]: 'deleted' } },
    attributes: ['id', 'name', 'slug', 'status', 'logo_url'],
    order: [['id', 'ASC']],
  });
  // BE-47: barbearias onde a pessoa é gerente (com as filiais que administra).
  const { BarbershopMember } = require('../../models');
  const memberships = await BarbershopMember.findAll({
    where: { user_id: userId },
    include: [{ model: Barbershop, attributes: ['id', 'name', 'slug', 'status', 'logo_url'], where: { status: { [Op.ne]: 'deleted' } } }],
  });
  return [
    ...rows.map((row) => ({ ...row.toJSON(), membership: 'owner', branch_ids: null })),
    ...memberships.map((row) => ({ ...row.Barbershop.toJSON(), membership: row.role, branch_ids: row.branch_ids || null })),
  ];
};

const listBarberProfiles = async (userId) => {
  const rows = await Barber.findAll({
    where: { user_id: userId, active: true },
    attributes: ['id', 'branch_id', 'display_name'],
    include: [{ model: Branch, attributes: ['id', 'name', 'barbershop_id'] }],
    order: [['id', 'ASC']],
  });
  return rows.map((row) => ({
    id: row.id,
    branch_id: row.branch_id,
    display_name: row.display_name,
    branch: row.Branch ? { id: row.Branch.id, name: row.Branch.name, barbershop_id: row.Branch.barbershop_id } : null,
  }));
};

const getMe = async (userId) => {
  const user = await User.findByPk(userId, { attributes: { exclude: PRIVATE_USER_FIELDS } });
  if (!user) throw new NotFoundError('Usuário não encontrado');
  const [barbershops, barberProfiles] = await Promise.all([listBarbershops(userId), listBarberProfiles(userId)]);
  const profile = {
    ...user.toJSON(),
    roles: [user.role, ...(barberProfiles.length && user.role !== 'barbeiro' ? ['barbeiro'] : [])],
    barbershops,
    barber_profiles: barberProfiles,
  };
  for (const extend of profileExtensions) {
    Object.assign(profile, await extend(user, profile));
  }
  return profile;
};

const updateMe = (userId, data, currentUser) => userService.update(userId, data, currentUser);

/** Agendamentos do próprio usuário como cliente. upcoming = start_at ≥ agora (ASC); past = antes (DESC). */
const listAppointments = async (userId, query = {}, currentUser = { id: userId }) => {
  const pagination = parsePagination(query);
  const now = new Date();
  const upcoming = query.scope !== 'past';
  const result = await Appointment.findAndCountAll({
    where: { user_id: userId, start_at: upcoming ? { [Op.gte]: now } : { [Op.lt]: now } },
    include: [
      {
        model: Branch,
        attributes: ['id', 'name', 'timezone', 'barbershop_id'],
        include: [{ model: Barbershop, attributes: ['id', 'owner_id'] }],
      },
      { model: Barber, attributes: ['id', 'display_name', 'user_id'] },
      { model: Service, attributes: ['id', 'name'], paranoid: false },
    ],
    order: [['start_at', upcoming ? 'ASC' : 'DESC']],
    limit: pagination.limit,
    offset: pagination.offset,
    distinct: true,
  });
  // BE-15: can_cancel_until e allowed_actions também na lista do cliente.
  const page = paginated(result, pagination);
  return { ...page, items: page.items.map((row) => present(row, currentUser, now)) };
};

module.exports = { getMe, updateMe, listBarbershops, listAppointments, addProfileExtension };
