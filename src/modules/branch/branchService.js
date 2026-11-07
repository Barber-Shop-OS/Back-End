// Branch service: filiais e seus endereços, sempre dentro do tenant do usuário (BE-03).
const { Op } = require('sequelize');
const { parsePagination, likeContains } = require('../../shared/query');
const { sequelize, Address, Barber } = require('../../models');
const branchRepository = require('./branchRepository');
const addressService = require('../address/addressService');
const { assertCanManageBarbershop, assertCanManageBranch } = require('../../shared/authz');
const { pickFields } = require('../../shared/pickFields');
const { AppError, NotFoundError } = require('../../utils/errorHandler');

// barbershop_id e address_id nunca mudam via update (SEC-03).
const BRANCH_UPDATABLE_FIELDS = ['name'];
const ADDRESS_FIELDS = ['cep', 'number', 'complement', 'city', 'state'];

const isEmpty = (value) => value === undefined || value === null || String(value).trim() === '';

const findAll = async (query = {}) => {
  const { page, pageSize, offset } = parsePagination(query);
  const where = {};

  if (query.barbershop_id) where.barbershop_id = Number(query.barbershop_id);
  if (query.name) where.name = likeContains(query.name);

  const allowedSortFields = ['name', 'created_at'];
  const sortBy = allowedSortFields.includes(String(query.sortBy)) ? String(query.sortBy) : 'created_at';
  const sortDir = String(query.sortDir).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const result = await branchRepository.findAll(where, {
    limit: pageSize,
    offset,
    order: [[sortBy, sortDir]],
    include: [Address],
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
  const branch = await branchRepository.findById(id, [Address, Barber]);
  if (!branch) {
    throw new NotFoundError('Filial não encontrada');
  }
  return branch;
};

const create = async (branchData, addressData, currentUser) => {
  if (isEmpty(branchData.name)) {
    throw new AppError("Campo 'name' é obrigatório", 400);
  }
  if (!Number.isInteger(Number(branchData.barbershop_id)) || Number(branchData.barbershop_id) <= 0) {
    throw new AppError("Campo 'barbershop_id' é obrigatório e deve ser um inteiro positivo", 400);
  }

  await assertCanManageBarbershop(currentUser, branchData.barbershop_id);

  // Endereço e filial juntos: falha em um não deixa endereço órfão.
  const branchId = await sequelize.transaction(async (transaction) => {
    const address = await addressService.create(addressData || {}, { transaction });
    const branch = await branchRepository.create(
      {
        name: String(branchData.name).trim(),
        barbershop_id: Number(branchData.barbershop_id),
        address_id: address.id,
      },
      { transaction }
    );
    return branch.id;
  });

  return branchRepository.findById(branchId, [Address, Barber]);
};

const update = async (id, branchData, addressData, currentUser) => {
  const branch = await assertCanManageBranch(currentUser, id);
  const updateData = pickFields(branchData, BRANCH_UPDATABLE_FIELDS);
  const addressUpdate = addressData ? pickFields(addressData, ADDRESS_FIELDS) : {};

  if ('name' in updateData) {
    if (isEmpty(updateData.name)) throw new AppError("Campo 'name' é obrigatório", 400);
    updateData.name = String(updateData.name).trim();
  }

  await sequelize.transaction(async (transaction) => {
    if (Object.keys(addressUpdate).length) {
      await addressService.update(branch.address_id, addressUpdate, { transaction, partial: true });
    }
    if (Object.keys(updateData).length) {
      await branchRepository.update(id, updateData, { transaction });
    }
  });

  return branchRepository.findById(id, [Address, Barber]);
};

const remove = async (id, currentUser) => {
  await assertCanManageBranch(currentUser, id);
  await branchRepository.delete(id);
  return true;
};

module.exports = {
  findAll,
  findById,
  create,
  update,
  remove,
};
