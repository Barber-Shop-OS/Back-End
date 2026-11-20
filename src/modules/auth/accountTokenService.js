// BE-26 / SEC-26: tokens de uso único da conta. O token só existe no link do e-mail; no banco fica o
// SHA-256. Consumo atômico (UPDATE ... WHERE used_at IS NULL) impede uso duplo em corrida.
const { Op } = require('sequelize');
const { UserToken } = require('../../models');
const { generateToken, hashToken } = require('../../shared/oneTimeToken');
const { AppError, CODES } = require('../../utils/errorHandler');

const gone = (message = 'Link inválido, expirado ou já utilizado') => new AppError(message, 410, CODES.TOKEN_INVALID_OR_EXPIRED);

/** Emite um token novo e invalida os anteriores do mesmo propósito (só o último link vale). */
const issue = async (userId, purpose, { ttlMs, payload = null, now = new Date(), transaction } = {}) => {
  await UserToken.update(
    { used_at: now },
    { where: { user_id: userId, purpose, used_at: null }, transaction }
  );
  const { token, hash } = generateToken();
  await UserToken.create(
    { user_id: userId, purpose, token_hash: hash, payload, expires_at: new Date(now.getTime() + ttlMs) },
    { transaction }
  );
  return token;
};

/** Valida e consome. Inexistente, expirado ou usado → 410. Retorna a linha (com user_id e payload). */
const consume = async (token, purpose, { now = new Date(), transaction } = {}) => {
  if (!token || typeof token !== 'string' || token.length > 200) throw gone();
  const row = await UserToken.findOne({ where: { token_hash: hashToken(token), purpose }, transaction });
  if (!row || row.used_at || new Date(row.expires_at) <= now) throw gone();
  const [updated] = await UserToken.update(
    { used_at: now },
    { where: { id: row.id, used_at: null }, transaction }
  );
  if (!updated) throw gone();
  return row;
};

/** Invalida todos os tokens pendentes do usuário (ex.: após trocar a senha). */
const revokeAll = (userId, purposes, { now = new Date(), transaction } = {}) =>
  UserToken.update(
    { used_at: now },
    { where: { user_id: userId, used_at: null, ...(purposes ? { purpose: { [Op.in]: purposes } } : {}) }, transaction }
  );

module.exports = { issue, consume, revokeAll, gone };
