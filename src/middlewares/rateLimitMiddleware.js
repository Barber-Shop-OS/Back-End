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

// SEC-21: cliente cria no máximo 10 agendamentos por hora (por conta). Equipe não tem limite.
const bookingLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => `user:${req.user.id}`,
  message: {
    code: 'RATE_LIMITED',
    message: 'Muitos agendamentos em pouco tempo. Tente novamente mais tarde.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => isTestEnv || !req.user || req.user.role !== 'cliente',
});

module.exports = {
  bookingLimiter,
  authLimiter,
  apiLimiter,
  paymentLimiter,
};