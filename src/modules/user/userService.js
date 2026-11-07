// User service: listagem (admin), leitura/edição do próprio perfil e troca de papel (admin).
const { Op } = require('sequelize');
const { parsePagination, likeContains } = require('../../shared/query');
const userRepository = require('./userRepository');
const { normalizePhone } = require('../../shared/phone');
const { sanitizeUser, PRIVATE_USER_FIELDS } = require('../../shared/sanitizeUser');
const { ValidationError, NotFoundError, ForbiddenError, ConflictError, CODES } = require('../../utils/errorHandler');

const ROLES = ['cliente', 'barbeiro', 'owner', 'admin'];
// Campos que o próprio usuário pode alterar. E-mail e senha terão fluxos próprios (BE-29).
const SELF_EDITABLE_FIELDS = ['name', 'phone'];
// Admin também corrige e-mail (suporte). Papel só pela rota dedicada.
const ADMIN_EDITABLE_FIELDS = ['name', 'phone', 'email'];

const isAdmin = (currentUser) => Boolean(currentUser) && currentUser.role === 'admin';
const isSelf = (currentUser, id) => Boolean(currentUser) && String(currentUser.id) === String(id);

const findAll = async (query = {}) => {
  const { page, pageSize, offset } = parsePagination(query);
  const where = {};

  if (query.name) where.name = likeContains(query.name);
  if (query.email) where.email = likeContains(query.email);

  const allowedSortFields = ['name', 'email', 'created_at'];
  const sortBy = allowedSortFields.includes(String(query.sortBy)) ? String(query.sortBy) : 'created_at';
  const sortDir = String(query.sortDir).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const result = await userRepository.findAll(where, {
    limit: pageSize,
    offset,
    order: [[sortBy, sortDir]],
    attributes: { exclude: PRIVATE_USER_FIELDS },
  });

  return {
    items: result.rows.map(sanitizeUser),
    page,
    pageSize,
    total: result.count,
    totalPages: Math.ceil(result.count / pageSize),
  };
};

const findById = async (id, currentUser) => {
  // Outro usuário recebe 404 para não revelar quais ids existem.
  if (!isSelf(currentUser, id) && !isAdmin(currentUser)) {
    throw new NotFoundError('Usuário não encontrado');
  }
  const user = await userRepository.findById(id, { attributes: { exclude: PRIVATE_USER_FIELDS } });
  if (!user) {
    throw new NotFoundError('Usuário não encontrado');
  }
  return user;
};

const update = async (id, data = {}, currentUser) => {
  if (!isSelf(currentUser, id) && !isAdmin(currentUser)) {
    throw new NotFoundError('Usuário não encontrado');
  }

  const user = await userRepository.findById(id);
  if (!user) {
    throw new NotFoundError('Usuário não encontrado');
  }

  const allowedFields = isAdmin(currentUser) ? ADMIN_EDITABLE_FIELDS : SELF_EDITABLE_FIELDS;
  const forbidden = Object.keys(data).filter((key) => !allowedFields.includes(key));
  if (forbidden.length) {
    throw new ValidationError(`Campos não permitidos: ${forbidden.join(', ')}`);
  }

  const updateData = { ...data };

  if ('name' in updateData) {
    const name = String(updateData.name || '').trim();
    if (name.length < 2 || name.length > 120) {
      throw new ValidationError("Campo 'name' deve ter entre 2 e 120 caracteres");
    }
    updateData.name = name;
  }

  if ('phone' in updateData) {
    updateData.phone = normalizePhone(updateData.phone);
  }

  if ('email' in updateData) {
    const email = String(updateData.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new ValidationError('E-mail inválido');
    }
    const duplicate = await userRepository.findAll({ email }, { attributes: ['id'] });
    if (duplicate.rows.some((item) => String(item.id) !== String(id))) {
      throw new ConflictError('E-mail já está em uso', CODES.EMAIL_IN_USE);
    }
    updateData.email = email;
  }

  await userRepository.update(id, updateData);
  return findById(id, currentUser);
};

const changeRole = async (id, role, currentUser) => {
  if (!isAdmin(currentUser)) {
    throw new ForbiddenError('Acesso restrito a administradores');
  }
  if (!ROLES.includes(role)) {
    throw new ValidationError(`Papel inválido. Use: ${ROLES.join(', ')}`);
  }
  if (isSelf(currentUser, id) && role !== 'admin') {
    throw new ValidationError('Um administrador não pode remover o próprio acesso de admin');
  }
  const user = await userRepository.findById(id);
  if (!user) {
    throw new NotFoundError('Usuário não encontrado');
  }
  // Incrementar token_version derruba as sessões abertas com o papel antigo.
  await userRepository.update(id, { role, token_version: Number(user.token_version || 0) + 1 });
  return sanitizeUser(await userRepository.findById(id));
};

const remove = async (id) => {
  const ok = await userRepository.delete(id);
  if (!ok) {
    throw new NotFoundError('Usuário não encontrado');
  }
  return true;
};

module.exports = {
  findAll,
  findById,
  update,
  changeRole,
  remove,
  SELF_EDITABLE_FIELDS,
};
