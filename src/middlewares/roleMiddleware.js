// Controle de acesso por papel. Depende do authMiddleware, que já carrega o papel atual do banco.
const { ForbiddenError, UnauthorizedError } = require('../utils/errorHandler');

const roleMiddleware = (allowedRoles = []) => (req, res, next) => {
  if (!req.user) {
    return next(new UnauthorizedError('Usuário não autenticado'));
  }
  if (!allowedRoles.includes(req.user.role)) {
    return next(new ForbiddenError(`Acesso restrito. Permissão necessária: ${allowedRoles.join(', ')}`));
  }
  return next();
};

// Export legado mantido por compatibilidade.
const verificaAdm = roleMiddleware(['admin']);

module.exports = roleMiddleware;
module.exports.verificaAdm = verificaAdm;
