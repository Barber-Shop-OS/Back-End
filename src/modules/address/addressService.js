// Address service: validação de endereço brasileiro e acesso restrito ao tenant da filial (BE-03).
const addressRepository = require('./addressRepository');
const { assertCanAccessAddress } = require('../../shared/authz');
const { pickFields } = require('../../shared/pickFields');
const { ValidationError, NotFoundError } = require('../../utils/errorHandler');

// BE-17: street, neighborhood e coordenadas (opcionais).
const ADDRESS_FIELDS = ['cep', 'street', 'number', 'complement', 'neighborhood', 'city', 'state', 'latitude', 'longitude'];
const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
const CEP_RE = /^\d{5}-?\d{3}$/;

const isEmpty = (value) => value === undefined || value === null || String(value).trim() === '';

const fieldErrors = {
  cep: (v) => isEmpty(v) || !CEP_RE.test(String(v).trim()),
  number: (v) => isEmpty(v) || !Number.isInteger(Number(v)) || Number(v) <= 0,
  city: (v) => isEmpty(v),
  state: (v) => isEmpty(v) || !UFS.includes(String(v).trim().toUpperCase()),
};

const isCoordinate = (value, limit) =>
  value === null || (Number.isFinite(Number(value)) && Math.abs(Number(value)) <= limit);

/** Valida todos os campos obrigatórios (create) ou apenas os enviados (partial). */
const validateAddress = (data = {}, { partial = false } = {}) => {
  const invalid = Object.entries(fieldErrors)
    .filter(([field]) => !partial || field in data)
    .filter(([field, isInvalid]) => isInvalid(data[field]));
  if (invalid.length) {
    throw new ValidationError('CEP (00000-000), número, cidade e UF válidos são obrigatórios', invalid.map(([field]) => ({ field, message: 'inválido' })));
  }
  if ('latitude' in data && !isCoordinate(data.latitude, 90)) throw new ValidationError('Latitude inválida');
  if ('longitude' in data && !isCoordinate(data.longitude, 180)) throw new ValidationError('Longitude inválida');
  if (('latitude' in data) !== ('longitude' in data)) {
    throw new ValidationError('Informe latitude e longitude juntas');
  }
};

const normalize = (data) => {
  const normalized = { ...data };
  if ('state' in normalized) normalized.state = String(normalized.state).trim().toUpperCase();
  if ('city' in normalized) normalized.city = String(normalized.city).trim();
  if ('cep' in normalized) {
    // Sempre 00000-000.
    const digits = String(normalized.cep).replace(/\D/g, '');
    normalized.cep = `${digits.slice(0, 5)}-${digits.slice(5)}`;
  }
  for (const field of ['street', 'neighborhood', 'complement']) {
    if (field in normalized) normalized[field] = normalized[field] ? String(normalized[field]).trim() : null;
  }
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
  ADDRESS_FIELDS,
  create,
  findById,
  update,
  updateAsUser,
};
