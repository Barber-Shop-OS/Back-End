// Autenticação opcional para rotas públicas que mostram mais dados a quem gerencia o recurso
// (ex.: serviços inativos para o dono). Token ausente ou inválido → segue como anônimo.
const authMiddleware = require('./authMiddleware');

const optionalAuthMiddleware = (req, res, next) => {
  if (!req.header('Authorization')) return next();
  return authMiddleware(req, res, (error) => {
    if (error) req.user = undefined;
    return next();
  });
};

module.exports = optionalAuthMiddleware;
