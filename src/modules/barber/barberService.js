// Barber service with branch filtering and per-user role downgrade support.
const { Op } = require('sequelize');
const { User, Barber, Branch } = require('../../models');
const barberRepository = require('./barberRepository');
const { ValidationError, NotFoundError } = require('../../utils/errorHandler');

const findAll = async (query = {}) => {
  const page = Number(query.page) > 0 ? Number(query.page) : 1;
  const pageSize = Number(query.pageSize) > 0 ? Number(query.pageSize) : 10;
  const offset = (page - 1) * pageSize;
  const where = {};

  if (query.user_id) where.user_id = Number(query.user_id);
  if (query.branch_id) where.branch_id = Number(query.branch_id);
  if (query.bio) where.bio = { [Op.like]: `%${query.bio}%` };

  const allowedSortFields = ['created_at', 'bio'];
  const sortBy = allowedSortFields.includes(String(query.sortBy)) ? String(query.sortBy) : 'created_at';
  const sortDir = String(query.sortDir).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const result = await barberRepository.findAll(where, {
    limit: pageSize,
    offset,
    order: [[sortBy, sortDir]],
  });

  return {
    items: result.rows,
    page,
    pageSize,
    total: result.count,
    totalPages: Math.ceil(result.count / pageSize),
  };
};

const findById = async (id) => {
  const barber = await barberRepository.findById(id);
  if (!barber) {
    throw new NotFoundError('Barbeiro não encontrado');
  }
  return barber;
};

const create = async (data) => {
  if (!Number.isInteger(Number(data.user_id)) || Number(data.user_id) <= 0) {
    throw new ValidationError("Campo 'user_id' é obrigatório e deve ser um inteiro positivo");
  }
  if (!Number.isInteger(Number(data.branch_id)) || Number(data.branch_id) <= 0) {
    throw new ValidationError("Campo 'branch_id' é obrigatório e deve ser um inteiro positivo");
  }
  if (!data.bio || String(data.bio).trim() === '') {
    throw new ValidationError("Campo 'bio' é obrigatório");
  }

  const barber = await barberRepository.create(data);
  return barberRepository.findById(barber.id);
};

const update = async (id, data) => {
  const barber = await barberRepository.update(id, data);
  if (!barber) {
    throw new NotFoundError('Barbeiro não encontrado');
  }
  return barber;
};

const remove = async (id) => {
  const barber = await Barber.findByPk(id);
  if (!barber) {
    throw new NotFoundError('Barbeiro não encontrado');
  }

  const userId = barber.user_id;
  await barberRepository.delete(id);

  const remainingBarbers = await Barber.count({ where: { user_id: userId } });
  if (remainingBarbers === 0) {
    const user = await User.findByPk(userId);
    if (user && user.role === 'barbeiro') {
      await user.update({ role: 'cliente' });
    }
  }

  return true;
};

module.exports = {
  findAll,
  findById,
  create,
  update,
  remove,
};