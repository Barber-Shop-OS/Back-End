// Service service (BE-06): serviços por barbearia, dinheiro em centavos/DECIMAL, ativação e soft delete.
const { parsePagination, likeContains } = require('../../shared/query');
const { Barbershop } = require('../../models');
const serviceRepository = require('./serviceRepository');
const { assertCanManageBarbershop, assertCanManageService, ownsBarbershop } = require('../../shared/authz');
const { pickFields } = require('../../shared/pickFields');
const { ValidationError, NotFoundError } = require('../../utils/errorHandler');

// barbershop_id nunca muda após a criação (SEC-03).
const UPDATABLE_FIELDS = ['name', 'description', 'price', 'duration', 'active'];

const MIN_DURATION = 5;
const MAX_DURATION = 480;

/** Converte reais (número ou "29.9") em centavos inteiros; lança 400 se tiver mais de 2 casas. */
const toCents = (value) => {
  const number = Number(value);
  if (value === null || value === undefined || value === '' || !Number.isFinite(number) || number < 0) {
    throw new ValidationError('Preço deve ser um número maior ou igual a zero');
  }
  const cents = Math.round(number * 100);
  if (Math.abs(cents - number * 100) > 1e-6) {
    throw new ValidationError('Preço deve ter no máximo 2 casas decimais');
  }
  return cents;
};

const centsToDecimal = (cents) => (cents / 100).toFixed(2);

const assertDuration = (value) => {
  const duration = Number(value);
  if (!Number.isInteger(duration) || duration < MIN_DURATION || duration > MAX_DURATION || duration % 5 !== 0) {
    throw new ValidationError(`Duração deve ser múltiplo de 5 entre ${MIN_DURATION} e ${MAX_DURATION} minutos`);
  }
  return duration;
};

const requireText = (value, field) => {
  const text = String(value === undefined || value === null ? '' : value).trim();
  if (!text) throw new ValidationError(`Campo '${field}' é obrigatório`);
  return text;
};

const normalizeServiceData = (data) => {
  const normalized = { ...data };
  if ('name' in normalized) normalized.name = requireText(normalized.name, 'name');
  if ('description' in normalized) normalized.description = requireText(normalized.description, 'description');
  if ('price' in normalized) normalized.price = centsToDecimal(toCents(normalized.price));
  if ('duration' in normalized) normalized.duration = assertDuration(normalized.duration);
  if ('active' in normalized) normalized.active = Boolean(normalized.active);
  return normalized;
};

/**
 * Listagem pública por barbearia (barbershop_id obrigatório — antes listava todas as barbearias).
 * Inativos só aparecem para quem gerencia a barbearia e pede `include_inactive=true`.
 */
const findAll = async (query = {}, currentUser) => {
  if (!query.barbershop_id) {
    throw new ValidationError("Parâmetro 'barbershop_id' é obrigatório");
  }
  const { page, pageSize, offset } = parsePagination(query);
  const where = { barbershop_id: Number(query.barbershop_id) };

  let includeInactive = false;
  if (query.include_inactive && currentUser) {
    const barbershop = await Barbershop.findByPk(where.barbershop_id);
    includeInactive = Boolean(barbershop && ownsBarbershop(currentUser, barbershop));
  }
  if (!includeInactive) where.active = true;
  if (query.name) where.name = likeContains(query.name);

  const allowedSortFields = ['name', 'price', 'duration', 'created_at'];
  const sortBy = allowedSortFields.includes(String(query.sortBy)) ? String(query.sortBy) : 'created_at';
  const sortDir = String(query.sortDir).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const result = await serviceRepository.findAll(where, {
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
  const service = await serviceRepository.findById(id);
  if (!service) {
    throw new NotFoundError('Serviço não encontrado');
  }
  return service;
};

const create = async (data, currentUser) => {
  const barbershopId = Number(data.barbershop_id);
  if (!Number.isInteger(barbershopId) || barbershopId <= 0) {
    throw new ValidationError("Campo 'barbershop_id' é obrigatório e deve ser um inteiro positivo");
  }
  const normalized = normalizeServiceData({
    name: data.name,
    description: data.description,
    price: data.price,
    duration: data.duration,
  });

  await assertCanManageBarbershop(currentUser, barbershopId);

  const service = await serviceRepository.create({
    ...normalized,
    active: data.active === undefined ? true : Boolean(data.active),
    barbershop_id: barbershopId,
  });

  return serviceRepository.findById(service.id);
};

const update = async (id, data, currentUser) => {
  await assertCanManageService(currentUser, id);
  const updateData = normalizeServiceData(pickFields(data, UPDATABLE_FIELDS));
  await serviceRepository.update(id, updateData);
  return serviceRepository.findById(id);
};

/** Soft delete: agendamentos antigos continuam apontando para o serviço. */
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
  toCents,
  assertDuration,
};
