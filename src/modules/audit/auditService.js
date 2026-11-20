// BE-36: trilha de auditoria. `record` pega ator, IP e request_id do contexto da requisição; falha
// ao gravar nunca derruba a operação de negócio (só vai para o log).
const { Op } = require('sequelize');
const { AuditLog, User } = require('../../models');
const requestContext = require('../../shared/requestContext');
const { assertCanManageBarbershop, isAdmin } = require('../../shared/authz');
const { parsePagination, paginated } = require('../../shared/query');
const logger = require('../../utils/logger');
const { ValidationError } = require('../../utils/errorHandler');

const plain = (value) => {
  if (value === null || value === undefined) return null;
  const json = typeof value.toJSON === 'function' ? value.toJSON() : value;
  const copy = JSON.parse(JSON.stringify(json));
  for (const key of ['password', 'token_version', 'token_hash']) delete copy[key];
  return copy;
};

/** Só os campos que mudaram (para updates). */
const diff = (before, after) => {
  const b = plain(before) || {};
  const a = plain(after) || {};
  // Só colunas (valores simples); associações incluídas na consulta não entram no diff.
  const isColumn = (value) => value === null || value === undefined || typeof value !== 'object';
  const changed = Object.keys({ ...b, ...a }).filter(
    (key) => isColumn(b[key]) && isColumn(a[key]) && JSON.stringify(b[key]) !== JSON.stringify(a[key])
  );
  if (!changed.length) return null;
  return {
    before: Object.fromEntries(changed.map((key) => [key, b[key] === undefined ? null : b[key]])),
    after: Object.fromEntries(changed.map((key) => [key, a[key] === undefined ? null : a[key]])),
  };
};

const record = async ({ action, entity, entityId, barbershopId = null, before = null, after = null, actor, transaction } = {}) => {
  const context = requestContext.get() || {};
  const who = actor || context.user || null;
  try {
    return await AuditLog.create(
      {
        actor_id: who ? who.id : null,
        actor_role: who ? who.role : 'system',
        barbershop_id: barbershopId,
        action,
        entity,
        entity_id: entityId === undefined || entityId === null ? null : String(entityId),
        before: plain(before),
        after: plain(after),
        ip: context.ip ? String(context.ip).slice(0, 64) : null,
        request_id: context.requestId || null,
      },
      { transaction }
    );
  } catch (error) {
    logger.warn('[audit] falha ao registrar', { action, entity, message: error.message });
    return null;
  }
};

/** Registra update só se algo mudou. */
const recordChange = async ({ before, after, ...rest }) => {
  const changes = diff(before, after);
  if (!changes) return null;
  return record({ ...rest, ...changes });
};

/** GET /api/audit-logs — dono vê a própria barbearia; admin vê tudo (barbershop_id opcional). */
const list = async (query, user) => {
  const where = {};
  if (query.barbershop_id) {
    await assertCanManageBarbershop(user, query.barbershop_id, { access: 'read' });
    where.barbershop_id = query.barbershop_id;
  } else if (!isAdmin(user)) {
    throw new ValidationError("Campo 'barbershop_id' é obrigatório");
  }
  if (query.entity) where.entity = query.entity;
  if (query.action) where.action = query.action;
  if (query.from || query.to) {
    where.created_at = {};
    if (query.from) where.created_at[Op.gte] = new Date(query.from);
    if (query.to) where.created_at[Op.lt] = new Date(query.to);
  }
  const pagination = parsePagination(query);
  const result = await AuditLog.findAndCountAll({
    where,
    include: [{ model: User, as: 'actor', attributes: ['id', 'name', 'email'], paranoid: false }],
    order: [['created_at', 'DESC'], ['id', 'DESC']],
    offset: pagination.offset,
    limit: pagination.limit,
  });
  return paginated(result, pagination);
};

module.exports = { record, recordChange, diff, list };
