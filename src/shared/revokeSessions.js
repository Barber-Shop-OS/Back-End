// SEC-28: revogação em massa de sessões (incidente: vazamento de JWT_SECRET, conta comprometida em massa...).
// Incrementa token_version (access tokens antigos param na hora) e revoga todos os refresh tokens ativos.
const { Op } = require('sequelize');
const { sequelize, User, RefreshToken } = require('../models');

const ROLES = ['admin', 'owner', 'barbeiro', 'cliente'];

/**
 * @param {{ role?: string, userIds?: number[] }} scope — sem filtros derruba TODOS os usuários.
 * @returns {{ users: number, refreshTokens: number }}
 */
const revokeSessions = async ({ role, userIds } = {}) => {
  if (role && !ROLES.includes(role)) throw new Error(`Papel inválido: ${role} (use ${ROLES.join(', ')})`);
  const where = {};
  if (role) where.role = role;
  if (userIds?.length) where.id = { [Op.in]: userIds };
  return sequelize.transaction(async (transaction) => {
    const ids = (await User.findAll({ where, attributes: ['id'], transaction })).map((user) => user.id);
    if (!ids.length) return { users: 0, refreshTokens: 0 };
    await User.increment('token_version', { by: 1, where: { id: { [Op.in]: ids } }, transaction });
    const [refreshTokens] = await RefreshToken.update(
      { revoked_at: new Date() },
      { where: { user_id: { [Op.in]: ids }, revoked_at: null }, transaction }
    );
    return { users: ids.length, refreshTokens };
  });
};

module.exports = { revokeSessions, ROLES };
