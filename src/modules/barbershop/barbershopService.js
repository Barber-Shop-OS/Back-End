// Barbershop service responsible for search, ownership checks, and CRUD.
const { parsePagination, likeContains } = require('../../shared/query');
const { AppError, NotFoundError, ConflictError, CODES } = require('../../utils/errorHandler');
const { Barbershop, Branch, Address, User } = require('../../models');
const barbershopRepository = require('./barbershopRepository');
const { assertCanManageBarbershop } = require('../../shared/authz');
const { pickFields } = require('../../shared/pickFields');

const findAll = async (query = {}) => {
  const { page, pageSize, offset } = parsePagination(query);
  const where = {};

  if (query.name) where.name = likeContains(query.name);

  // Filtro por cidade em duas etapas: um include aninhado obrigatório + limit faz o Sequelize gerar
  // uma subquery inválida (500). Primeiro achamos as barbearias com filial na cidade, depois paginamos.
  if (query.city) {
    const branches = await Branch.findAll({
      attributes: ['barbershop_id'],
      include: [{ model: Address, attributes: [], where: { city: likeContains(query.city) }, required: true }],
      raw: true,
    });
    where.id = [...new Set(branches.map((branch) => branch.barbershop_id))];
  }

  const include = [
    { model: User, as: 'owner', attributes: ['id', 'name', 'email'] },
    { model: Branch, include: [{ model: Address }] },
  ];

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
    throw new ConflictError('Barbearia com este nome já existe', CODES.BARBERSHOP_NAME_TAKEN);
  }

  return barbershopRepository.create(data);
};

// Campos editáveis pelo dono. owner_id nunca vem do body (SEC-03); BE-18 amplia a lista.
const UPDATABLE_FIELDS = ['name'];

const update = async (id, data, currentUser) => {
  const barbershop = await assertCanManageBarbershop(currentUser, id);
  const updateData = pickFields(data, UPDATABLE_FIELDS);

  if ('name' in updateData) {
    const name = String(updateData.name || '').trim();
    if (!name) throw new AppError("Campo 'name' é obrigatório", 400);
    const duplicate = await Barbershop.findOne({ where: { owner_id: barbershop.owner_id, name } });
    if (duplicate && String(duplicate.id) !== String(id)) {
      throw new ConflictError('Barbearia com este nome já existe', CODES.BARBERSHOP_NAME_TAKEN);
    }
    updateData.name = name;
  }

  return barbershopRepository.update(id, updateData);
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