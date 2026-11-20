// BE-47: gerentes de filial (recurso branch_managers — plano Rede). Só o dono (ou admin) gerencia.
const { Op } = require('sequelize');
const { BarbershopMember, User, Branch } = require('../../models');
const { assertCanManageBarbershop, ownsBarbershop } = require('../../shared/authz');
const accessControl = () => require('../subscription/accessControl');
const audit = require('../audit/auditService');
const { NotFoundError, ConflictError, ForbiddenError, ValidationError, CODES } = require('../../utils/errorHandler');

/** Dono/admin da barbearia (gerente não promove outros gerentes). */
const assertOwner = async (user, barbershopId, options) => {
  const shop = await assertCanManageBarbershop(user, barbershopId, options);
  if (!ownsBarbershop(user, shop)) throw new ForbiddenError('Apenas o dono gerencia a equipe de gestão');
  return shop;
};

const validateBranches = async (barbershopId, branchIds) => {
  if (branchIds === null || branchIds === undefined) return null;
  const unique = [...new Set(branchIds.map(Number))];
  if (!unique.length) throw new ValidationError("'branch_ids' não pode ser vazio (use null para todas as filiais)");
  const count = await Branch.count({ where: { id: { [Op.in]: unique }, barbershop_id: barbershopId } });
  if (count !== unique.length) throw new ValidationError('Há filiais que não pertencem a esta barbearia');
  return unique;
};

const present = (row) => ({
  id: row.id,
  user: row.user ? { id: row.user.id, name: row.user.name, email: row.user.email } : { id: row.user_id },
  role: row.role,
  branch_ids: row.branch_ids || null,
  created_at: row.created_at,
});

const list = async (barbershopId, user) => {
  await assertOwner(user, barbershopId, { access: 'read' });
  const rows = await BarbershopMember.findAll({
    where: { barbershop_id: barbershopId },
    include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email'] }],
    order: [['id', 'ASC']],
  });
  return { items: rows.map(present) };
};

const add = async (barbershopId, { email, branch_ids: branchIds }, user) => {
  const shop = await assertOwner(user, barbershopId);
  await accessControl().assertFeature(shop.id, 'branch_managers');
  const target = await User.findOne({ where: { email: String(email).trim().toLowerCase() } });
  if (!target) throw new NotFoundError('Nenhuma conta com este e-mail. Peça para a pessoa se cadastrar primeiro.', CODES.USER_NOT_FOUND);
  if (String(target.id) === String(shop.owner_id)) throw new ValidationError('O dono já administra a barbearia');
  if (await BarbershopMember.count({ where: { barbershop_id: shop.id, user_id: target.id } })) {
    throw new ConflictError('Esta pessoa já é gerente da barbearia', CODES.CONFLICT);
  }
  const row = await BarbershopMember.create({
    barbershop_id: shop.id,
    user_id: target.id,
    role: 'manager',
    branch_ids: await validateBranches(shop.id, branchIds),
    created_by: user.id,
  });
  await audit.record({ action: 'member.added', entity: 'barbershop_member', entityId: row.id, barbershopId: shop.id, after: { user_id: target.id, branch_ids: row.branch_ids } });
  row.user = target;
  return present(row);
};

const update = async (barbershopId, memberId, { branch_ids: branchIds }, user) => {
  const shop = await assertOwner(user, barbershopId);
  const row = await BarbershopMember.findOne({ where: { id: memberId, barbershop_id: shop.id } });
  if (!row) throw new NotFoundError('Gerente não encontrado');
  const before = { branch_ids: row.branch_ids };
  await row.update({ branch_ids: await validateBranches(shop.id, branchIds) });
  await audit.record({ action: 'member.updated', entity: 'barbershop_member', entityId: row.id, barbershopId: shop.id, before, after: { branch_ids: row.branch_ids } });
  return present(row);
};

const remove = async (barbershopId, memberId, user) => {
  const shop = await assertOwner(user, barbershopId, { access: 'read' });
  const row = await BarbershopMember.findOne({ where: { id: memberId, barbershop_id: shop.id } });
  if (!row) throw new NotFoundError('Gerente não encontrado');
  await row.destroy();
  await audit.record({ action: 'member.removed', entity: 'barbershop_member', entityId: memberId, barbershopId: shop.id, before: { user_id: row.user_id } });
};

module.exports = { list, add, update, remove };
