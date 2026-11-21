// BE-47: gerentes de filial (recurso branch_managers — plano Rede). Só o dono (ou admin) gerencia.
// BE-49: recepcionistas (atendimento/balcão), vinculados a UMA filial. O dono adiciona em qualquer
// filial; o gerente adiciona/edita/remove recepcionistas só nas filiais que administra. Não há
// limite de membros nos planos, então recepcionista não consome limite e não exige o plano Rede.
const { Op } = require('sequelize');
const { BarbershopMember, User, Branch } = require('../../models');
const { assertWritable, ownsBarbershop, managedBranchIds, membershipFor, MEMBER_ROLES } = require('../../shared/authz');
const { Barbershop } = require('../../models');
const accessControl = () => require('../subscription/accessControl');
const audit = require('../audit/auditService');
const { NotFoundError, ConflictError, ForbiddenError, ValidationError, CODES } = require('../../utils/errorHandler');

/**
 * Quem gerencia a equipe: dono/admin (tudo) ou gerente (só recepcionistas das filiais dele).
 * @returns {{ shop, isOwner: boolean, scope: number[]|null }} scope = filiais do gerente (null = todas)
 */
const resolveActor = async (user, barbershopId, options = {}) => {
  const shop = await Barbershop.findByPk(barbershopId);
  if (!shop) throw new NotFoundError('Barbearia não encontrada');
  if (ownsBarbershop(user, shop)) {
    await assertWritable(user, shop.id, options);
    return { shop, isOwner: true, scope: null };
  }
  if (membershipFor(user, shop.id)) {
    await assertWritable(user, shop.id, options);
    return { shop, isOwner: false, scope: managedBranchIds(user, shop) };
  }
  throw new ForbiddenError('Apenas o dono gerencia a equipe de gestão');
};

const inScope = (scope, branchIds) => scope === null || (Array.isArray(branchIds) && branchIds.length > 0 && branchIds.every((id) => scope.includes(Number(id))));

const validateBranches = async (barbershopId, branchIds) => {
  if (branchIds === null || branchIds === undefined) return null;
  const unique = [...new Set(branchIds.map(Number))];
  if (!unique.length) throw new ValidationError("'branch_ids' não pode ser vazio (use null para todas as filiais)");
  const count = await Branch.count({ where: { id: { [Op.in]: unique }, barbershop_id: barbershopId } });
  if (count !== unique.length) throw new ValidationError('Há filiais que não pertencem a esta barbearia');
  return unique;
};

/** BE-49: recepcionista tem exatamente uma filial (branch_id, ou branch_ids com um item). */
const receptionistBranch = async (barbershopId, { branch_id: branchId, branch_ids: branchIds }) => {
  let target = branchId;
  if ((target === undefined || target === null) && Array.isArray(branchIds)) {
    if (branchIds.length !== 1) throw new ValidationError('Recepcionista é vinculado a exatamente uma filial');
    [target] = branchIds;
  }
  if (target === undefined || target === null) throw new ValidationError("Campo 'branch_id' é obrigatório para recepcionista");
  const [id] = await validateBranches(barbershopId, [target]);
  return id;
};

const present = (row) => {
  const branchIds = row.branch_ids || null;
  return {
    id: row.id,
    user: row.user ? { id: row.user.id, name: row.user.name, email: row.user.email } : { id: row.user_id },
    role: row.role,
    branch_ids: branchIds,
    branch_id: row.role === MEMBER_ROLES.RECEPTIONIST && branchIds ? Number(branchIds[0]) : null,
    created_at: row.created_at,
  };
};

const list = async (barbershopId, user, query = {}) => {
  const actor = await resolveActor(user, barbershopId, { access: 'read' });
  const where = { barbershop_id: actor.shop.id };
  if (!actor.isOwner) where.role = MEMBER_ROLES.RECEPTIONIST;
  else if (query.role) where.role = query.role;
  const rows = await BarbershopMember.findAll({
    where,
    include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email'] }],
    order: [['id', 'ASC']],
  });
  const visible = actor.isOwner ? rows : rows.filter((row) => inScope(actor.scope, row.branch_ids));
  return { items: visible.map(present) };
};

const add = async (barbershopId, input, user) => {
  const role = input.role || MEMBER_ROLES.MANAGER;
  const actor = await resolveActor(user, barbershopId);
  const { shop } = actor;
  let branchIds;
  if (role === MEMBER_ROLES.MANAGER) {
    if (!actor.isOwner) throw new ForbiddenError('Apenas o dono adiciona gerentes');
    await accessControl().assertFeature(shop.id, 'branch_managers');
    branchIds = await validateBranches(shop.id, input.branch_ids);
  } else {
    branchIds = [await receptionistBranch(shop.id, input)];
    if (!inScope(actor.scope, branchIds)) throw new ForbiddenError('Sem permissão para esta filial');
  }
  const target = await User.findOne({ where: { email: String(input.email).trim().toLowerCase() } });
  if (!target) throw new NotFoundError('Nenhuma conta com este e-mail. Peça para a pessoa se cadastrar primeiro.', CODES.USER_NOT_FOUND);
  if (String(target.id) === String(shop.owner_id)) throw new ValidationError('O dono já administra a barbearia');
  if (await BarbershopMember.count({ where: { barbershop_id: shop.id, user_id: target.id } })) {
    throw new ConflictError('Esta pessoa já faz parte da equipe da barbearia', CODES.CONFLICT);
  }
  const row = await BarbershopMember.create({
    barbershop_id: shop.id,
    user_id: target.id,
    role,
    branch_ids: branchIds,
    created_by: user.id,
  });
  await audit.record({ action: 'member.added', entity: 'barbershop_member', entityId: row.id, barbershopId: shop.id, after: { user_id: target.id, role, branch_ids: row.branch_ids } });
  row.user = target;
  // SEC-27: aviso ao dono (não bloqueia).
  await require('../../shared/teamAlerts').notifyOwnerOfNewMember({ barbershopId: shop.id, person: target, role, actorId: user.id });
  return present(row);
};

/** Linha que o ator pode alterar: dono altera qualquer uma; gerente só recepcionistas das filiais dele. */
const findEditable = async (actor, memberId) => {
  const row = await BarbershopMember.findOne({ where: { id: memberId, barbershop_id: actor.shop.id } });
  if (!row) throw new NotFoundError('Membro não encontrado');
  if (!actor.isOwner && (row.role !== MEMBER_ROLES.RECEPTIONIST || !inScope(actor.scope, row.branch_ids))) {
    throw new NotFoundError('Membro não encontrado');
  }
  return row;
};

const update = async (barbershopId, memberId, input, user) => {
  const actor = await resolveActor(user, barbershopId);
  const row = await findEditable(actor, memberId);
  const before = { branch_ids: row.branch_ids };
  let branchIds;
  if (row.role === MEMBER_ROLES.RECEPTIONIST) {
    branchIds = [await receptionistBranch(actor.shop.id, input)];
    if (!inScope(actor.scope, branchIds)) throw new ForbiddenError('Sem permissão para esta filial');
  } else {
    if (input.branch_ids === undefined) throw new ValidationError("Campo 'branch_ids' é obrigatório para gerente");
    branchIds = await validateBranches(actor.shop.id, input.branch_ids);
  }
  await row.update({ branch_ids: branchIds });
  await audit.record({ action: 'member.updated', entity: 'barbershop_member', entityId: row.id, barbershopId: actor.shop.id, before, after: { branch_ids: row.branch_ids } });
  return present(row);
};

const remove = async (barbershopId, memberId, user) => {
  const actor = await resolveActor(user, barbershopId, { access: 'read' });
  const row = await findEditable(actor, memberId);
  await row.destroy();
  await audit.record({ action: 'member.removed', entity: 'barbershop_member', entityId: memberId, barbershopId: actor.shop.id, before: { user_id: row.user_id, role: row.role } });
};

module.exports = { list, add, update, remove };
