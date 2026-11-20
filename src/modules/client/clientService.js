// BE-23: clientes da barbearia (CRM) e cliente rápido sem conta.
// Acesso: dono/admin da barbearia e barbeiros ativos lotados em alguma filial dela.
// Escopo estrito: cliente da barbearia A nunca aparece para B (consultas sempre por barbershop_id).
const { Op } = require('sequelize');
const { sequelize, BarbershopClient, Barbershop, Barber, Branch, User, Appointment, Payment } = require('../../models');
const { ownsBarbershop, assertWritable } = require('../../shared/authz');
const { normalizePhone } = require('../../shared/phone');
const { parsePagination, likeMatch } = require('../../shared/query');
const { pickFields } = require('../../shared/pickFields');
const { NotFoundError, ForbiddenError, ConflictError, CODES } = require('../../utils/errorHandler');

const HISTORY_LIMIT = 50;
const accessControl = () => require('../subscription/accessControl');

/** Dono/admin ou barbeiro ativo da barbearia. 404 se a barbearia não existe, 403 para os demais. */
const assertStaffOfBarbershop = async (user, barbershopId) => {
  const barbershop = await Barbershop.findByPk(barbershopId, { attributes: ['id', 'owner_id'] });
  if (!barbershop) throw new NotFoundError('Barbearia não encontrada');
  if (ownsBarbershop(user, barbershop)) return barbershop;
  const barber = await Barber.findOne({
    where: { user_id: user.id, active: true },
    include: [{ model: Branch, attributes: ['id'], where: { barbershop_id: barbershop.id }, required: true }],
  });
  if (!barber) throw new ForbiddenError('Sem permissão para acessar os clientes desta barbearia');
  return barbershop;
};

// Subconsultas de estatística por cliente (mesmo SQL em MySQL e SQLite).
const q = (name) => sequelize.getQueryInterface().quoteIdentifier(name);
const clientIdCol = () => `${q('BarbershopClient')}.${q('id')}`;
const statAttributes = () => [
  [sequelize.literal(`(SELECT COUNT(*) FROM appointments a WHERE a.client_id = ${clientIdCol()} AND a.status = 'concluido')`), 'visits'],
  [sequelize.literal(`(SELECT COUNT(*) FROM appointments a WHERE a.client_id = ${clientIdCol()} AND a.status = 'nao_compareceu')`), 'no_shows'],
  [sequelize.literal(`(SELECT MAX(a.start_at) FROM appointments a WHERE a.client_id = ${clientIdCol()} AND a.status = 'concluido')`), 'last_visit'],
  [
    sequelize.literal(
      `(SELECT COALESCE(SUM(p.amount), 0) FROM payments p JOIN appointments a ON a.id = p.appointment_id WHERE a.client_id = ${clientIdCol()} AND p.status = 'PAID')`
    ),
    'total_spent',
  ],
];

// SQLite devolve DATETIME agregado como texto "2026-03-10 13:00:00.000 +00:00".
const toIso = (value) => {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  const text = String(value).trim().replace(' ', 'T').replace(/\s*([+-]\d\d:?\d\d)$/, '$1');
  const date = new Date(/(Z|[+-]\d\d:?\d\d)$/.test(text) ? text : `${text}Z`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const present = (client) => {
  const json = typeof client.toJSON === 'function' ? client.toJSON() : { ...client };
  return {
    id: json.id,
    barbershop_id: json.barbershop_id,
    user_id: json.user_id,
    has_account: json.user_id !== null && json.user_id !== undefined,
    name: json.name,
    phone: json.phone,
    email: json.email,
    notes: json.notes,
    created_at: json.created_at,
    visits: Number(json.visits || 0),
    no_shows: Number(json.no_shows || 0),
    last_visit: toIso(json.last_visit),
    total_spent: (Math.round(Number(json.total_spent || 0) * 100) / 100).toFixed(2),
  };
};

const SORTS = {
  name: [['name', 'ASC']],
  last_visit: [[sequelize.literal('last_visit'), 'DESC']],
  visits: [[sequelize.literal('visits'), 'DESC']],
  total_spent: [[sequelize.literal('total_spent'), 'DESC']],
  created_at: [['created_at', 'DESC']],
};

/** Busca por nome, e-mail ou telefone (dígitos parciais). */
const searchCondition = (search) => {
  const term = String(search).trim();
  if (!term) return null;
  const or = [likeMatch('BarbershopClient.name', term), likeMatch('BarbershopClient.email', term.toLowerCase())];
  const digits = term.replace(/\D/g, '');
  if (digits.length >= 3) or.push(likeMatch('BarbershopClient.phone', digits));
  return { [Op.or]: or };
};

const list = async (barbershopId, query = {}, user) => {
  await assertStaffOfBarbershop(user, barbershopId);
  // BE-35: sem o recurso clients_crm (plano Essencial) a lista serve só para achar o cliente no
  // balcão — sem estatísticas.
  const crm = await accessControl().hasFeature(barbershopId, 'clients_crm');
  const { page, pageSize, offset, limit } = parsePagination(query);
  const conditions = [{ barbershop_id: barbershopId }];
  if (query.search) {
    const condition = searchCondition(query.search);
    if (condition) conditions.push(condition);
  }
  const where = { [Op.and]: conditions };
  const [total, rows] = await Promise.all([
    BarbershopClient.count({ where }),
    BarbershopClient.findAll({
      where,
      attributes: crm ? { include: statAttributes() } : undefined,
      order: [...((crm && SORTS[query.sortBy]) || SORTS.name), ['id', 'ASC']],
      offset,
      limit,
    }),
  ]);
  const items = rows.map(present).map((item) => (crm ? item : { ...item, visits: null, no_shows: null, last_visit: null, total_spent: null }));
  return { items, page, pageSize, total, totalPages: Math.ceil(total / pageSize), crm };
};

const findInBarbershop = async (barbershopId, clientId, options = {}) => {
  const client = await BarbershopClient.findOne({
    where: { id: clientId, barbershop_id: barbershopId },
    ...options,
  });
  if (!client) throw new NotFoundError('Cliente não encontrado');
  return client;
};

/** Cliente + estatísticas + histórico (últimos 50 agendamentos, com pagamento). */
const getById = async (barbershopId, clientId, user) => {
  await assertStaffOfBarbershop(user, barbershopId);
  await accessControl().assertFeature(barbershopId, 'clients_crm');
  const client = await findInBarbershop(barbershopId, clientId, { attributes: { include: statAttributes() } });
  const appointments = await Appointment.findAll({
    where: { client_id: client.id },
    attributes: ['id', 'start_at', 'end_at', 'status', 'service_name_snapshot', 'price_snapshot', 'branch_id', 'barber_id', 'notes'],
    include: [
      { model: Barber, attributes: ['id', 'display_name'], include: [{ model: User, attributes: ['name'] }] },
      { model: Branch, attributes: ['id', 'name'] },
      { model: Payment, attributes: ['id', 'amount', 'method', 'status', 'paid_at'] },
    ],
    order: [['start_at', 'DESC']],
    limit: HISTORY_LIMIT,
  });
  return {
    ...present(client),
    history: appointments.map((appointment) => {
      const json = appointment.toJSON();
      const barber = json.barber || json.Barber;
      return {
        id: json.id,
        start_at: json.start_at,
        end_at: json.end_at,
        status: json.status,
        service_name: json.service_name_snapshot,
        price: json.price_snapshot,
        notes: json.notes,
        branch: json.Branch,
        barber: barber ? { id: barber.id, name: barber.display_name || (barber.User && barber.User.name) || null } : null,
        payment: json.Payment || null,
      };
    }),
  };
};

const normalizeContact = (data) => {
  const out = { ...data };
  if (out.phone !== undefined) out.phone = normalizePhone(out.phone);
  if (out.email !== undefined) out.email = out.email ? String(out.email).trim().toLowerCase() : null;
  if (out.name !== undefined) out.name = String(out.name).trim();
  if (out.notes !== undefined) out.notes = out.notes ? String(out.notes).trim() : null;
  return out;
};

/** Mesmo telefone ou e-mail já cadastrado nesta barbearia → 409 com o id existente. */
const assertNoDuplicate = async (barbershopId, { phone, email }, exceptId) => {
  const or = [];
  if (phone) or.push({ phone });
  if (email) or.push({ email });
  if (!or.length) return;
  const where = { barbershop_id: barbershopId, [Op.or]: or };
  if (exceptId) where.id = { [Op.ne]: exceptId };
  const existing = await BarbershopClient.findOne({ where, attributes: ['id', 'phone', 'email'] });
  if (existing) {
    throw new ConflictError('Já existe um cliente com este telefone ou e-mail', CODES.CLIENT_ALREADY_EXISTS, {
      client_id: existing.id,
    });
  }
};

const create = async (barbershopId, input, user) => {
  await assertStaffOfBarbershop(user, barbershopId);
  await assertWritable(user, barbershopId);
  const data = normalizeContact(pickFields(input, ['name', 'phone', 'email', 'notes']));
  await assertNoDuplicate(barbershopId, data);
  // Se já existe conta com esse e-mail/telefone, o cliente nasce vinculado.
  const or = [];
  if (data.email) or.push({ email: data.email });
  if (data.phone) or.push({ phone: data.phone });
  const account = or.length ? await User.findOne({ where: { [Op.or]: or }, attributes: ['id'] }) : null;
  if (account && (await BarbershopClient.count({ where: { barbershop_id: barbershopId, user_id: account.id } }))) {
    const existing = await BarbershopClient.findOne({ where: { barbershop_id: barbershopId, user_id: account.id } });
    throw new ConflictError('Este cliente já está cadastrado', CODES.CLIENT_ALREADY_EXISTS, { client_id: existing.id });
  }
  const client = await BarbershopClient.create({
    barbershop_id: Number(barbershopId),
    user_id: account ? account.id : null,
    name: data.name,
    phone: data.phone || null,
    email: data.email || null,
    notes: data.notes || null,
  });
  return present(client);
};

const update = async (barbershopId, clientId, input, user) => {
  await assertStaffOfBarbershop(user, barbershopId);
  await assertWritable(user, barbershopId);
  const client = await findInBarbershop(barbershopId, clientId);
  const data = normalizeContact(pickFields(input, ['name', 'phone', 'email', 'notes']));
  await assertNoDuplicate(barbershopId, data, client.id);
  await client.update(data);
  if (await accessControl().hasFeature(barbershopId, 'clients_crm')) return getById(barbershopId, client.id, user);
  return present(client);
};

/**
 * Cliente da barbearia para um usuário com conta (usado no agendamento, dentro da transação).
 * Ordem: já vinculado → cliente rápido com mesmo e-mail/telefone (vincula) → cria.
 */
const ensureForUser = async (barbershopId, userId, { transaction } = {}) => {
  const linked = await BarbershopClient.findOne({ where: { barbershop_id: barbershopId, user_id: userId }, transaction });
  if (linked) return linked;
  const user = await User.findByPk(userId, { attributes: ['id', 'name', 'email', 'phone'], transaction });
  if (!user) throw new NotFoundError('Cliente não encontrado');
  const or = [{ email: String(user.email).toLowerCase() }];
  if (user.phone) or.push({ phone: user.phone });
  const quick = await BarbershopClient.findOne({
    where: { barbershop_id: barbershopId, user_id: null, [Op.or]: or },
    order: [['id', 'ASC']],
    transaction,
  });
  if (quick) return quick.update({ user_id: user.id }, { transaction });
  return BarbershopClient.create(
    { barbershop_id: barbershopId, user_id: user.id, name: user.name, email: user.email, phone: user.phone || null },
    { transaction }
  );
};

/** Ao criar conta: vincula clientes rápidos (de qualquer barbearia) com o mesmo e-mail/telefone. */
const linkAccount = async (user, { transaction } = {}) => {
  const or = [{ email: String(user.email).toLowerCase() }];
  if (user.phone) or.push({ phone: user.phone });
  const quick = await BarbershopClient.findAll({ where: { user_id: null, [Op.or]: or }, order: [['id', 'ASC']], transaction });
  const linkedShops = new Set();
  for (const client of quick) {
    // Um vínculo por barbearia (índice único barbershop_id + user_id).
    if (linkedShops.has(client.barbershop_id)) continue;
    linkedShops.add(client.barbershop_id);
    await client.update({ user_id: user.id }, { transaction });
  }
  return linkedShops.size;
};

module.exports = {
  list,
  getById,
  create,
  update,
  ensureForUser,
  linkAccount,
  findInBarbershop,
  assertStaffOfBarbershop,
  present,
};
