// User service responsible for pagination, lookup, update, and delete.
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const userRepository = require('./userRepository');
const { AppError, ValidationError, NotFoundError } = require('../../utils/errorHandler');

const sanitizeUser = (user) => {
  if (!user) return null;
  const plainUser = user.toJSON ? user.toJSON() : user;
  const { password, ...safeUser } = plainUser;
  return safeUser;
};

const sanitizeList = (result) => ({
  ...result,
  rows: result.rows.map(sanitizeUser),
});

const findAll = async (query = {}) => {
  const page = Number(query.page) > 0 ? Number(query.page) : 1;
  const pageSize = Number(query.pageSize) > 0 ? Number(query.pageSize) : 10;
  const offset = (page - 1) * pageSize;
  const where = {};

  if (query.name) where.name = { [Op.like]: `%${query.name}%` };
  if (query.email) where.email = { [Op.like]: `%${query.email}%` };

  const allowedSortFields = ['name', 'email', 'created_at'];
  const sortBy = allowedSortFields.includes(String(query.sortBy)) ? String(query.sortBy) : 'created_at';
  const sortDir = String(query.sortDir).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const result = await userRepository.findAll(where, {
    limit: pageSize,
    offset,
    order: [[sortBy, sortDir]],
    attributes: { exclude: ['password'] },
  });

  const sanitized = sanitizeList(result);
  return {
    items: sanitized.rows,
    page,
    pageSize,
    total: sanitized.count,
    totalPages: Math.ceil(sanitized.count / pageSize),
  };
};

const findById = async (id) => {
  const user = await userRepository.findById(id, {
    attributes: { exclude: ['password'] },
  });

  if (!user) {
    throw new NotFoundError('Usuário não encontrado');
  }

  return user;
};

const update = async (id, data = {}) => {
  const user = await userRepository.findById(id);
  if (!user) {
    throw new NotFoundError('Usuário não encontrado');
  }

  const updateData = { ...data };
  if (updateData.password) {
    if (String(updateData.password).trim().length < 6) {
      throw new ValidationError('Senha deve ter no mínimo 6 caracteres');
    }
    updateData.password = await bcrypt.hash(updateData.password, 10);
  }

  if (updateData.email) {
    const duplicate = await userRepository.findAll(
      { email: updateData.email },
      { attributes: ['id'] }
    );
    const foundDuplicate = duplicate.rows.find((item) => String(item.id) !== String(id));
    if (foundDuplicate) {
      throw new AppError('E-mail já está em uso', 409);
    }
  }

  await userRepository.update(id, updateData);
  return findById(id);
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
  remove,
};