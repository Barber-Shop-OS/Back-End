// Logs each HTTP request on response finish without exposing request body.
const logger = require('../utils/logger');

// SEC-29: tokens nunca vão para o log — caminho de convite e parâmetros sensíveis da query.
const SENSITIVE_QUERY = /([?&](?:token|webhookSecret|secret|code|id_token|refresh_token)=)[^&]*/gi;
const safeUrl = (url) =>
  String(url || '')
    .replace(/(\/invitations\/)[^/?]+/i, '$1[REDACTED]')
    .replace(SENSITIVE_QUERY, '$1[REDACTED]');

const requestLoggerMiddleware = (req, res, next) => {
  const startTime = Date.now();

  res.on('finish', () => {
    logger.info('HTTP request', {
      method: req.method,
      url: safeUrl(req.originalUrl),
      ip: req.ip,
      userAgent: req.get('user-agent'),
      statusCode: res.statusCode,
      responseTimeMs: Date.now() - startTime,
    });
  });

  next();
};

module.exports = requestLoggerMiddleware;
module.exports.safeUrl = safeUrl;