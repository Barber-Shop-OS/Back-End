const { handleErrorResponse } = require('../utils/errorHandler');
const logger = require('../utils/logger');

// Middleware global de tratamento de erros
// Deve ser registrado após as rotas no app
module.exports = (err, req, res, next) => {
  // Se já foi enviado, apenas passa adiante
  if (res.headersSent) {
    return next(err);
  }
  logger.error({ message: err.message, stack: err.stack });
  return handleErrorResponse(res, err);
};
