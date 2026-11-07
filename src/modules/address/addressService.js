// Address service: validação de endereço brasileiro e acesso restrito ao tenant da filial (BE-03).
const addressRepository = require('./addressRepository');
const { assertCanAccessAddress } = require('../../shared/authz');
const { pickFields } = require('../../shared/pickFields');
const { ValidationError, NotFoundError } = require('../../utils/errorHandler');

const ADDRESS_FIELDS = ['cep', 'number', 'complement', 'city', 'state'];

const isEmpty = (value) => value === undefined || value === null || String(value).trim() === '';

const fieldErrors = {
  cep: (v) => isEmpty(v),
  number: (v) => isEmpty(v) || !Number.isInteger(Number(v)) || Number(v) <= 0,
  city: (v) => isEmpty(v),
  state: (v) => isEmpty(v) || String(v).trim().length !== 2,
};

/** Valida todos os campos obrigatórios (create) ou apenas os enviados (partial). */
const validateAddress = (data = {}, { partial = false } = {}) => {
  const invalid = Object.entries(fieldErrors)
    .filter(([field]) => !partial || field in data)
    .filter(([field, isInvalid]) => isInvalid(data[field]));
  if (invalid.length) {
    throw new ValidationError('CEP, número, cidade e estado são obrigatórios');
  }
};

const normalize = (data) => {
  const normalized = { ...data };
  if ('state' in normalized) normalized.state = String(normalized.state).trim().toUpperCase();
  if ('city' in normalized) normalized.city = String(normalized.city).trim();
  if ('cep' in normalized) normalized.cep = String(normalized.cep).trim();
  return normalized;
};

const create = async (data, options = {}) => {
  const addressData = pickFields(data, ADDRESS_FIELDS);
  validateAddress(addressData);
  return addressRepository.create(normalize(addressData), options);
};

const findById = async (id, currentUser) => {
  await assertCanAccessAddress(currentUser, id);
  const address = await addressRepository.findById(id);
  if (!address) {
    throw new NotFoundError('Endereço não encontrado');
  }
  return address;
};

/** Atualização direta pela rota /api/address/:id — exige gerenciar a filial que usa o endereço. */
const updateAsUser = async (id, data, currentUser) => {
  await assertCanAccessAddress(currentUser, id);
  return update(id, data);
};

/** Atualização interna (já autorizada pelo chamador, ex.: branchService). */
const update = async (id, data, { transaction, partial = true } = {}) => {
  const addressData = pickFields(data, ADDRESS_FIELDS);
  validateAddress(addressData, { partial });
  const address = await addressRepository.update(id, normalize(addressData), { transaction });
  if (!address) {
    throw new NotFoundError('Endereço não encontrado');
  }
  return address;
};

module.exports = {
  create,
  findById,
  update,
  updateAsUser,
};
