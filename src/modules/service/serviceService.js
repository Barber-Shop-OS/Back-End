// Service service with barbershop filtering and CRUD validation.
const { Op } = require('sequelize');
const { Service, Barbershop } = require('../../models');
const serviceRepository = require('./serviceRepository');
const { ValidationError, NotFoundError } = require('../../utils/errorHandler');

const findAll = async (query = {}) => {
  const page = Number(query.page) > 0 ? Number(query.page) : 1;
  const pageSize = Number(query.pageSize) > 0 ? Number(query.pageSize) : 10;
  const offset = (page - 1) * pageSize;
  const where = {};

  if (query.name) where.name = { [Op.like]: `%${query.name}%` };
  if (query.barbershop_id) where.barbershop_id = Number(query.barbershop_id);

  const allowedSortFields = ['name', 'price', 'duration', 'created_at'];
  const sortBy = allowedSortFields.includes(String(query.sortBy)) ? String(query.sortBy) : 'created_at';
  const sortDir = String(query.sortDir).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const result = await serviceRepository.findAll(where, {
    limit: pageSize,
    offset,
    order: [[sortBy, sortDir]],
    include: [Barbershop],
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
  const service = await serviceRepository.findById(id, [Barbershop]);
  if (!service) {
    throw new NotFoundError('Serviço não encontrado');
  }
  return service;
};

const create = async (data) => {
  const { name, description, price, duration, barbershop_id } = data;
  if (!name || String(name).trim() === '') throw new ValidationError("Campo 'name' é obrigatório");
  if (!description || String(description).trim() === '') throw new ValidationError("Campo 'description' é obrigatório");
  if (!Number.isInteger(Number(barbershop_id)) || Number(barbershop_id) <= 0) throw new ValidationError("Campo 'barbershop_id' é obrigatório e deve ser um inteiro positivo");
  if (price === undefined || price === null || isNaN(Number(price)) || Number(price) <= 0) throw new ValidationError('Preço deve ser um número positivo');
  if (duration === undefined || duration === null || isNaN(Number(duration)) || Number(duration) <= 0) throw new ValidationError('Duração deve ser um número positivo');

  const service = await serviceRepository.create({
    name,
    description,
    price: Number(price),
    duration: Number(duration),
    barbershop_id: Number(barbershop_id),
  });

  return serviceRepository.findById(service.id, [Barbershop]);
};

const update = async (id, data) => {
  const service = await serviceRepository.update(id, data);
  if (!service) {
    throw new NotFoundError('Serviço não encontrado');
  }
  return service;
};

const remove = async (id) => {
  const ok = await serviceRepository.delete(id);
  if (!ok) {
    throw new NotFoundError('Serviço não encontrado');
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