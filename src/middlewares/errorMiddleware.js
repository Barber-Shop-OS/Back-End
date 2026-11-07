// Middleware global de erros (registrar após as rotas). Detalhes ficam só no log; o cliente
// recebe { message, code } seguro (BE-37 / SEC-11).
const { toErrorResponse } = require('../utils/errorHandler');
const logger = require('../utils/logger');

module.exports = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  const { status, body } = toErrorResponse(err);
  const context = { method: req.method, url: req.originalUrl, status, code: body.code };

  if (status >= 500) {
    logger.error('Erro não tratado', { ...context, error: err && err.message, stack: err && err.stack });
  } else {
    logger.warn('Requisição rejeitada', { ...context, message: body.message });
  }

  return res.status(status).json(body);
};
