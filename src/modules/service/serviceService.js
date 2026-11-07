// Service service with barbershop filtering and CRUD validation.
const { parsePagination, likeContains } = require('../../shared/query');
const { Barbershop } = require('../../models');
const serviceRepository = require('./serviceRepository');
const { assertCanManageBarbershop, assertCanManageService } = require('../../shared/authz');
const { pickFields } = require('../../shared/pickFields');
const { ValidationError, NotFoundError } = require('../../utils/errorHandler');

// barbershop_id nunca muda após a criação (SEC-03).
const UPDATABLE_FIELDS = ['name', 'description', 'price', 'duration'];

const validateServiceFields = (data) => {
  if ('name' in data && String(data.name || '').trim() === '') throw new ValidationError("Campo 'name' é obrigatório");
  if ('description' in data && String(data.description || '').trim() === '') throw new ValidationError("Campo 'description' é obrigatório");
  if ('price' in data && (data.price === null || isNaN(Number(data.price)) || Number(data.price) <= 0)) throw new ValidationError('Preço deve ser um número positivo');
  if ('duration' in data && (data.duration === null || isNaN(Number(data.duration)) || Number(data.duration) <= 0)) throw new ValidationError('Duração deve ser um número positivo');
};

const findAll = async (query = {}) => {
  const { page, pageSize, offset } = parsePagination(query);
  const where = {};

  if (query.name) where.name = likeContains(query.name);
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

const create = async (data, currentUser) => {
  const { name, description, price, duration, barbershop_id } = data;
  if (!name || String(name).trim() === '') throw new ValidationError("Campo 'name' é obrigatório");
  if (!description || String(description).trim() === '') throw new ValidationError("Campo 'description' é obrigatório");
  if (!Number.isInteger(Number(barbershop_id)) || Number(barbershop_id) <= 0) throw new ValidationError("Campo 'barbershop_id' é obrigatório e deve ser um inteiro positivo");
  if (price === undefined || price === null || isNaN(Number(price)) || Number(price) <= 0) throw new ValidationError('Preço deve ser um número positivo');
  if (duration === undefined || duration === null || isNaN(Number(duration)) || Number(duration) <= 0) throw new ValidationError('Duração deve ser um número positivo');

  await assertCanManageBarbershop(currentUser, barbershop_id);

  const service = await serviceRepository.create({
    name: String(name).trim(),
    description: String(description).trim(),
    price: Number(price),
    duration: Number(duration),
    barbershop_id: Number(barbershop_id),
  });

  return serviceRepository.findById(service.id, [Barbershop]);
};

const update = async (id, data, currentUser) => {
  await assertCanManageService(currentUser, id);
  const updateData = pickFields(data, UPDATABLE_FIELDS);
  validateServiceFields(updateData);
  if ('name' in updateData) updateData.name = String(updateData.name).trim();
  if ('description' in updateData) updateData.description = String(updateData.description).trim();
  if ('price' in updateData) updateData.price = Number(updateData.price);
  if ('duration' in updateData) updateData.duration = Number(updateData.duration);

  await serviceRepository.update(id, updateData);
  return serviceRepository.findById(id, [Barbershop]);
};

const remove = async (id, currentUser) => {
  await assertCanManageService(currentUser, id);
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