// Branch service that creates and updates address records together with branches.
const { Op } = require('sequelize');
const { Branch, Address, Barbershop, Barber } = require('../../models');
const branchRepository = require('./branchRepository');
const addressService = require('../address/addressService');
const { AppError, NotFoundError, ForbiddenError } = require('../../utils/errorHandler');

const canManageBarbershop = async (barbershopId, currentUser) => {
  if (currentUser.role === 'admin') return true;
  const barbershop = await Barbershop.findByPk(barbershopId);
  if (!barbershop) {
    throw new NotFoundError('Barbearia não encontrada');
  }
  if (String(barbershop.owner_id) !== String(currentUser.id)) {
    throw new ForbiddenError('Sem permissão para gerenciar esta filial');
  }
  return true;
};

const isEmpty = (value) => value === undefined || value === null || String(value).trim() === '';

const findAll = async (query = {}) => {
  const page = Number(query.page) > 0 ? Number(query.page) : 1;
  const pageSize = Number(query.pageSize) > 0 ? Number(query.pageSize) : 10;
  const offset = (page - 1) * pageSize;
  const where = {};

  if (query.barbershop_id) where.barbershop_id = Number(query.barbershop_id);
  if (query.name) where.name = { [Op.like]: `%${query.name}%` };

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

  await canManageBarbershop(branchData.barbershop_id, currentUser);

  const address = await addressService.create(addressData);
  const branch = await branchRepository.create({
    name: branchData.name,
    barbershop_id: branchData.barbershop_id,
    address_id: address.id,
  });

  return branchRepository.findById(branch.id, [Address, Barber]);
};

const update = async (id, branchData, addressData, currentUser) => {
  const branch = await Branch.findByPk(id);
  if (!branch) {
    throw new NotFoundError('Filial não encontrada');
  }

  await canManageBarbershop(branch.barbershop_id, currentUser);

  if (addressData && Object.values(addressData).some((value) => value !== undefined)) {
    const filteredAddressData = Object.fromEntries(
      Object.entries(addressData).filter(([, value]) => value !== undefined)
    );
    await Address.update(filteredAddressData, { where: { id: branch.address_id } });
  }

  await branchRepository.update(id, branchData);
  return branchRepository.findById(id, [Address, Barber]);
};

const remove = async (id, currentUser) => {
  const branch = await Branch.findByPk(id);
  if (!branch) {
    throw new NotFoundError('Filial não encontrada');
  }

  await canManageBarbershop(branch.barbershop_id, currentUser);
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