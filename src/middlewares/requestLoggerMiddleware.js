// Logs each HTTP request on response finish without exposing request body.
const logger = require('../utils/logger');

const requestLoggerMiddleware = (req, res, next) => {
  const startTime = Date.now();

  res.on('finish', () => {
    logger.info('HTTP request', {
      method: req.method,
      url: req.originalUrl,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      statusCode: res.statusCode,
      responseTimeMs: Date.now() - startTime,
    });
  });

  next();
};

module.exports = requestLoggerMiddleware;