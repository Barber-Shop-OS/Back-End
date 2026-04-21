// Address service with validation for Brazilian address fields.
const addressRepository = require('./addressRepository');
const { ValidationError, NotFoundError } = require('../../utils/errorHandler');

const isEmpty = (value) => value === undefined || value === null || String(value).trim() === '';

const validateAddress = (data = {}) => {
  const errors = [];
  if (isEmpty(data.cep)) errors.push('CEP');
  if (isEmpty(data.number) || !Number.isInteger(Number(data.number)) || Number(data.number) <= 0) errors.push('número');
  if (isEmpty(data.city)) errors.push('cidade');
  if (isEmpty(data.state) || String(data.state).trim().length !== 2) errors.push('estado');

  if (errors.length) {
    throw new ValidationError('CEP, número, cidade e estado são obrigatórios');
  }
};

const create = async (data) => {
  validateAddress(data);
  return addressRepository.create(data);
};

const findById = async (id) => {
  const address = await addressRepository.findById(id);
  if (!address) {
    throw new NotFoundError('Endereço não encontrado');
  }
  return address;
};

const update = async (id, data) => {
  const address = await addressRepository.update(id, data);
  if (!address) {
    throw new NotFoundError('Endereço não encontrado');
  }
  return address;
};

module.exports = {
  create,
  findById,
  update,
};