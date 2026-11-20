// Controle de acesso por papel. Depende do authMiddleware, que já carrega o papel atual do banco.
const { ForbiddenError, UnauthorizedError } = require('../utils/errorHandler');

const roleMiddleware = (allowedRoles = []) => (req, res, next) => {
  if (!req.user) {
    return next(new UnauthorizedError('Usuário não autenticado'));
  }
  // BE-47: gerente de filial passa nas rotas de dono; o authz limita às filiais dele.
  // BE-49: recepcionista só passa nas rotas que declaram 'receptionist' (balcão).
  const memberships = Array.isArray(req.user.memberships) ? req.user.memberships : [];
  const isManager = memberships.some((item) => item.role !== 'receptionist');
  const isReceptionist = memberships.some((item) => item.role === 'receptionist');
  const allowed =
    allowedRoles.includes(req.user.role) ||
    (isManager && allowedRoles.includes('owner')) ||
    (isReceptionist && allowedRoles.includes('receptionist'));
  if (!allowed) {
    return next(new ForbiddenError(`Acesso restrito. Permissão necessária: ${allowedRoles.join(', ')}`));
  }
  return next();
};

// Export legado mantido por compatibilidade.
const verificaAdm = roleMiddleware(['admin']);

module.exports = roleMiddleware;
module.exports.verificaAdm = verificaAdm;
