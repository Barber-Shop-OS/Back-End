// Barbershop service responsible for search, ownership checks, and CRUD.
const { Op } = require('sequelize');
const { AppError, NotFoundError } = require('../../utils/errorHandler');
const { Barbershop, Branch, Address, User } = require('../../models');
const barbershopRepository = require('./barbershopRepository');

const findAll = async (query = {}) => {
  const page = Number(query.page) > 0 ? Number(query.page) : 1;
  const pageSize = Number(query.pageSize) > 0 ? Number(query.pageSize) : 10;
  const offset = (page - 1) * pageSize;
  const where = {};

  if (query.name) where.name = { [Op.like]: `%${query.name}%` };

  const include = [
    { model: User, as: 'owner', attributes: ['id', 'name', 'email'] },
    {
      model: Branch,
      include: [{ model: Address }],
      required: Boolean(query.city),
    },
  ];

  if (query.city) {
    include[1].include[0].where = { city: { [Op.like]: `%${query.city}%` } };
  }

  const allowedSortFields = ['name', 'created_at'];
  const sortBy = allowedSortFields.includes(String(query.sortBy)) ? String(query.sortBy) : 'created_at';
  const sortDir = String(query.sortDir).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const result = await barbershopRepository.findAll(where, {
    limit: pageSize,
    offset,
    order: [[sortBy, sortDir]],
    include,
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
  return barbershopRepository.findById(id, [
    { model: Branch, include: [Address] },
    { model: User, as: 'owner', attributes: ['id', 'name', 'email'] },
  ]);
};

const create = async (data) => {
  if (!data.name || String(data.name).trim() === '') {
    throw new AppError("Campo 'name' é obrigatório", 400);
  }
  if (!Number.isInteger(Number(data.owner_id)) || Number(data.owner_id) <= 0) {
    throw new AppError("Campo 'owner_id' é obrigatório e deve ser um inteiro positivo", 400);
  }

  const duplicate = await Barbershop.findOne({
    where: { owner_id: data.owner_id, name: data.name },
  });

  if (duplicate) {
    throw new AppError('Barbearia com este nome já existe', 409);
  }

  return barbershopRepository.create(data);
};

const update = async (id, data) => {
  const barbershop = await Barbershop.findByPk(id);
  if (!barbershop) {
    throw new NotFoundError('Barbearia não encontrada');
  }
  return barbershopRepository.update(id, data);
};

const remove = async (id) => {
  const barbershop = await Barbershop.findByPk(id);
  if (!barbershop) {
    throw new NotFoundError('Barbearia não encontrada');
  }
  return barbershopRepository.delete(id);
};

module.exports = {
  findAll,
  findById,
  create,
  update,
  remove,
};