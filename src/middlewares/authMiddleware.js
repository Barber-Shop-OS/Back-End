// BE-02 / SEC-05: autenticação por Bearer token. O papel vem sempre do banco (nunca só do token)
// e tokens emitidos antes de uma troca de papel/senha são rejeitados via token_version.
const { verifyAccessToken } = require('../shared/tokens');
const { UnauthorizedError } = require('../utils/errorHandler');

const BEARER = /^Bearer ([A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+)$/;

const authMiddleware = async (req, res, next) => {
  const header = req.header('Authorization');
  if (!header) {
    return next(new UnauthorizedError('Token não fornecido'));
  }

  const match = BEARER.exec(header.trim());
  if (!match) {
    return next(new UnauthorizedError('Token inválido ou expirado'));
  }

  let payload;
  try {
    payload = verifyAccessToken(match[1]);
  } catch {
    return next(new UnauthorizedError('Token inválido ou expirado'));
  }

  try {
    // require tardio para evitar ciclo models → config durante o boot.
    const { User } = require('../models');
    const user = await User.findByPk(payload.sub, {
      attributes: ['id', 'email', 'role', 'token_version'],
    });
    if (!user || Number(user.token_version || 0) !== Number(payload.tv || 0)) {
      return next(new UnauthorizedError('Token inválido ou expirado'));
    }

    // BE-47: gerências (papel por barbearia) — usadas pelo authz e pelo roleMiddleware.
    const { BarbershopMember } = require('../models');
    const memberships = await BarbershopMember.findAll({
      where: { user_id: user.id },
      attributes: ['barbershop_id', 'role', 'branch_ids'],
    });
    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      memberships: memberships.map((row) => ({ barbershop_id: row.barbershop_id, role: row.role, branch_ids: row.branch_ids || null })),
      session_id: payload.sid || null,
    };
    // BE-36: a auditoria descobre quem está agindo pelo contexto da requisição.
    const context = require('../shared/requestContext').get();
    if (context) context.user = req.user;
    return next();
  } catch (error) {
    return next(error);
  }
};

module.exports = authMiddleware;
