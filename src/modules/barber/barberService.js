// Barber service (BE-05): posse por tenant, vínculo com usuário e DTO público sem dados pessoais.
const { parsePagination, likeContains } = require('../../shared/query');
const { sequelize, User } = require('../../models');
const barberRepository = require('./barberRepository');
const { assertCanManageBranch, assertCanManageBarber } = require('../../shared/authz');
const { pickFields } = require('../../shared/pickFields');
const { ValidationError, NotFoundError, ConflictError, CODES } = require('../../utils/errorHandler');

/** Formato exposto em rotas públicas: nada de e-mail, telefone ou user_id. */
const toPublicBarber = (barber) => {
  if (!barber) return null;
  const plain = barber.toJSON ? barber.toJSON() : barber;
  const user = plain.User || plain.user || null;
  return {
    id: plain.id,
    display_name: plain.display_name || (user && user.name) || null,
    bio: plain.bio,
    photo_url: plain.photo_url || null,
    branch_id: plain.branch_id,
    active: plain.active !== false,
    services: (plain.Services || plain.services || []).map((service) => ({ id: service.id, name: service.name })),
  };
};

const findAll = async (query = {}) => {
  const { page, pageSize, offset } = parsePagination(query);
  // Listagem pública: só barbeiros ativos.
  const where = { active: true };

  if (query.branch_id) where.branch_id = Number(query.branch_id);
  if (query.bio) where.bio = likeContains(query.bio);

  const allowedSortFields = ['created_at', 'bio', 'display_name'];
  const sortBy = allowedSortFields.includes(String(query.sortBy)) ? String(query.sortBy) : 'created_at';
  const sortDir = String(query.sortDir).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const result = await barberRepository.findAll(where, {
    limit: pageSize,
    offset,
    order: [[sortBy, sortDir]],
  });

  return {
    items: result.rows.map(toPublicBarber),
    page,
    pageSize,
    total: result.count,
    totalPages: Math.ceil(result.count / pageSize),
  };
};

const findById = async (id) => {
  const barber = await barberRepository.findById(id);
  if (!barber || !barber.active) {
    throw new NotFoundError('Barbeiro não encontrado');
  }
  return toPublicBarber(barber);
};

const cleanText = (value) => (value === undefined || value === null ? value : String(value).trim());

/** Promove cliente → barbeiro. Owner/admin nunca são rebaixados nem alterados. */
const promoteToBarber = async (user, transaction) => {
  if (user.role === 'cliente') {
    await user.update({ role: 'barbeiro' }, { transaction });
  }
};

/**
 * Vincula um usuário existente a uma filial (já autorizada pelo chamador).
 * Vínculo inativo é reativado; vínculo ativo → 409.
 */
const attachUser = async ({ user, branchId, bio, display_name, photo_url }) => {
  const barberId = await sequelize.transaction(async (transaction) => {
    const existing = await barberRepository.findByUserAndBranch(user.id, branchId, { transaction });
    const data = {
      bio: cleanText(bio) || '',
      display_name: cleanText(display_name) || null,
      photo_url: photo_url || null,
    };

    let barber;
    if (existing) {
      if (existing.active) {
        throw new ConflictError('Este usuário já é barbeiro desta filial', CODES.BARBER_ALREADY_EXISTS);
      }
      barber = await existing.update({ ...data, active: true }, { transaction });
    } else {
      barber = await barberRepository.create({ user_id: user.id, branch_id: Number(branchId), ...data }, { transaction });
    }
    await promoteToBarber(user, transaction);
    return barber.id;
  });

  return barberRepository.findById(barberId);
};

const create = async (data, currentUser) => {
  // A filial é checada primeiro para não revelar ids de usuários a quem não gerencia a filial.
  await assertCanManageBranch(currentUser, data.branch_id);
  const user = await User.findByPk(data.user_id);
  if (!user) throw new NotFoundError('Usuário não encontrado', CODES.USER_NOT_FOUND);
  return toPublicBarber(await attachUser({ user, branchId: data.branch_id, ...data }));
};

/**
 * POST /api/branch/:id/barbers — usado pelo painel (FE-11). Aceita `user_id` ou `email`.
 * Se o e-mail ainda não tem conta, `onUnknownEmail` (convite — BE-22) assume.
 */
const createInBranch = async (branchId, data, currentUser, { onUnknownEmail } = {}) => {
  await assertCanManageBranch(currentUser, branchId);

  let user = null;
  if (data.user_id) {
    user = await User.findByPk(data.user_id);
  } else if (data.email) {
    user = await User.findOne({ where: { email: String(data.email).trim().toLowerCase() } });
    if (!user && onUnknownEmail) {
      return { invitation: await onUnknownEmail(branchId, data, currentUser) };
    }
  }
  if (!user) throw new NotFoundError('Usuário não encontrado', CODES.USER_NOT_FOUND);

  return { barber: toPublicBarber(await attachUser({ user, branchId, ...data })) };
};

// user_id nunca muda; troca de filial só dentro da mesma barbearia.
const UPDATABLE_FIELDS = ['bio', 'branch_id', 'display_name', 'photo_url'];

const update = async (id, data, currentUser) => {
  const barber = await assertCanManageBarber(currentUser, id);
  const updateData = pickFields(data, UPDATABLE_FIELDS);

  if ('bio' in updateData) {
    if (String(updateData.bio || '').trim() === '') {
      throw new ValidationError("Campo 'bio' é obrigatório");
    }
    updateData.bio = String(updateData.bio).trim();
  }
  if ('display_name' in updateData) updateData.display_name = cleanText(updateData.display_name) || null;

  if ('branch_id' in updateData) {
    const targetBranch = await assertCanManageBranch(currentUser, updateData.branch_id);
    if (String(targetBranch.barbershop_id) !== String(barber.Branch.barbershop_id)) {
      throw new ValidationError('O barbeiro só pode ser transferido para filiais da mesma barbearia');
    }
    const clash = await barberRepository.findByUserAndBranch(barber.user_id, updateData.branch_id);
    if (clash && String(clash.id) !== String(id)) {
      throw new ConflictError('Este usuário já é barbeiro da filial de destino', CODES.BARBER_ALREADY_EXISTS);
    }
    updateData.branch_id = Number(updateData.branch_id);
  }

  await barberRepository.update(id, updateData);
  return toPublicBarber(await barberRepository.findById(id));
};

/**
 * Desativa o barbeiro (histórico preservado). Com agendamentos futuros → 409, a não ser que
 * `force=cancel`: nesse caso os agendamentos são cancelados (e os clientes notificados — BE-16).
 */
const remove = async (id, currentUser, { force } = {}) => {
  const barber = await assertCanManageBarber(currentUser, id);
  const future = await barberRepository.findFutureAppointments(id);

  if (future.length && force !== 'cancel') {
    throw new ConflictError(
      'Barbeiro possui agendamentos futuros. Use ?force=cancel para cancelá-los.',
      CODES.BARBER_HAS_FUTURE_APPOINTMENTS,
      { future_appointments: future.length, appointment_ids: future.map((appt) => appt.id) }
    );
  }

  await sequelize.transaction(async (transaction) => {
    for (const appointment of future) {
      await appointment.update({ status: 'cancelado' }, { transaction });
    }
    await barber.update({ active: false }, { transaction });

    const remaining = await barberRepository.countActiveProfiles(barber.user_id, { transaction });
    if (remaining === 0) {
      const user = await User.findByPk(barber.user_id, { transaction });
      if (user && user.role === 'barbeiro') {
        await user.update({ role: 'cliente' }, { transaction });
      }
    }
  });

  return { cancelled_appointments: future.map((appt) => appt.id) };
};

module.exports = {
  findAll,
  findById,
  create,
  createInBranch,
  update,
  remove,
  toPublicBarber,
};
