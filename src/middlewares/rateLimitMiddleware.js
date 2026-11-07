// Defines dedicated rate limit policies for auth, general API, and payment endpoints.
const rateLimit = require('express-rate-limit');
const isTestEnv = process.env.NODE_ENV === 'test';

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    code: 'RATE_LIMITED',
    message: 'Muitas tentativas. Tente novamente em 15 minutos.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTestEnv,
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: {
    code: 'RATE_LIMITED',
    message: 'Limite de requisições atingido. Tente novamente em instantes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTestEnv,
});

const paymentLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  message: {
    code: 'RATE_LIMITED',
    message: 'Muitas requisições de pagamento. Aguarde alguns minutos.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTestEnv,
});

module.exports = {
  authLimiter,
  apiLimiter,
  paymentLimiter,
};