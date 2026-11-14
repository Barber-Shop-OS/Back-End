// Barbershop service responsible for search, ownership checks, and CRUD.
const { parsePagination, likeContains } = require('../../shared/query');
const { AppError, NotFoundError, ConflictError, CODES } = require('../../utils/errorHandler');
const { Barbershop, Branch, Address } = require('../../models');
const barbershopRepository = require('./barbershopRepository');
const { assertCanManageBarbershop } = require('../../shared/authz');
const { pickFields } = require('../../shared/pickFields');
const { normalizePhone } = require('../../shared/phone');
const { isValidSlug } = require('../../shared/slug');
const { ValidationError } = require('../../utils/errorHandler');

const PROFILE_FIELDS = ['slug', 'description', 'phone', 'whatsapp', 'instagram', 'logo_url', 'cover_url'];

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

  // SEC-06: nada de owner/e-mail em rota pública; só barbearias e filiais ativas.
  where.status = 'active';
  const include = [{ model: Branch, where: { active: true }, required: false, include: [{ model: Address }] }];

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
  const barbershop = await barbershopRepository.findById(id, [
    { model: Branch, where: { active: true }, required: false, include: [Address] },
  ]);
  if (!barbershop || barbershop.status !== 'active') return null;
  return barbershop;
};

const INSTAGRAM_RE = /^[a-zA-Z0-9._]{1,30}$/;
const httpsUrl = (value, field) => {
  if (value === null || value === '') return null;
  let url;
  try {
    url = new URL(String(value));
  } catch {
    throw new ValidationError(`Campo '${field}' deve ser uma URL https`);
  }
  if (url.protocol !== 'https:') throw new ValidationError(`Campo '${field}' deve ser uma URL https`);
  return url.toString();
};

/** Normaliza e valida os campos de perfil público (BE-18). */
const normalizeProfile = async (data, currentId) => {
  const out = { ...data };
  if ('slug' in out) {
    const slug = String(out.slug || '').trim().toLowerCase();
    if (!isValidSlug(slug)) {
      throw new ValidationError('Slug inválido: use 3 a 60 letras minúsculas, números e hífen (palavras reservadas não)', undefined, CODES.INVALID_SLUG);
    }
    const taken = await Barbershop.findOne({ where: { slug } });
    if (taken && String(taken.id) !== String(currentId)) {
      throw new ConflictError('Este endereço já está em uso por outra barbearia', CODES.SLUG_TAKEN);
    }
    out.slug = slug;
  }
  if ('description' in out) out.description = out.description ? String(out.description).trim() : null;
  if ('phone' in out) out.phone = normalizePhone(out.phone);
  if ('whatsapp' in out) out.whatsapp = normalizePhone(out.whatsapp);
  if ('instagram' in out) {
    const handle = out.instagram ? String(out.instagram).trim().replace(/^@/, '') : null;
    if (handle && !INSTAGRAM_RE.test(handle)) throw new ValidationError('Instagram inválido');
    out.instagram = handle;
  }
  for (const field of ['logo_url', 'cover_url']) {
    if (field in out) out[field] = httpsUrl(out[field], field);
  }
  return out;
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

  const profile = await normalizeProfile(pickFields(data, ['name', 'owner_id', ...PROFILE_FIELDS]));
  return barbershopRepository.create({ ...profile, name: String(data.name).trim(), owner_id: Number(data.owner_id) });
};

// Campos editáveis pelo dono. owner_id e status nunca vêm do body (SEC-03).
const UPDATABLE_FIELDS = ['name', ...PROFILE_FIELDS];

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

  return barbershopRepository.update(id, await normalizeProfile(updateData, id));
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