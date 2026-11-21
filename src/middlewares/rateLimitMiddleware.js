// Defines dedicated rate limit policies for auth, general API, and payment endpoints.
const rateLimit = require('express-rate-limit');
const isTestEnv = process.env.NODE_ENV === 'test';

const limitersInTests = () => process.env.RATE_LIMIT_IN_TESTS === 'true';

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    code: 'RATE_LIMITED',
    message: 'Muitas tentativas. Tente novamente em 15 minutos.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTestEnv && !limitersInTests(),
});

// /auth/refresh roda a cada carregamento do app e a cada 15 min (access token curto, FE-37): não pode
// dividir a cota de 10 do login, senão quem recarrega a página algumas vezes perde a sessão (429).
// 600/15 min por IP: vários aparelhos da barbearia (balcão, barbeiros) costumam sair pelo mesmo IP.
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  message: { code: 'RATE_LIMITED', message: 'Muitas renovações de sessão. Tente novamente em instantes.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTestEnv && !limitersInTests(),
});

// Geral por IP. 300/min: cada tela do painel faz ~10 chamadas e a barbearia costuma ter vários aparelhos
// (balcão, barbeiros, dono) atrás do mesmo IP; 100/min derrubava uso normal (SEC-31).
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
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

// BE-26/27: pedidos que disparam e-mail (redefinição de senha, reenvio de verificação).
// Por IP: 5 a cada 15 min. Por e-mail/usuário: 3 por hora — evita bombardear a caixa de alguém.
const emailIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { code: 'RATE_LIMITED', message: 'Muitas solicitações. Tente novamente em alguns minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTestEnv,
});

const emailTargetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  keyGenerator: (req) =>
    req.user ? `user:${req.user.id}` : `email:${String((req.body && req.body.email) || '').trim().toLowerCase()}`,
  message: { code: 'RATE_LIMITED', message: 'Muitas solicitações para esta conta. Tente novamente mais tarde.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTestEnv,
});

// SEC-07: brute force distribuído numa mesma conta — 5 falhas de login por e-mail a cada 15 min
// (logins com sucesso não contam). Store em memória: com várias instâncias, usar store compartilhado.
const loginAccountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `login:${String((req.body && req.body.email) || '').trim().toLowerCase()}`,
  message: { code: 'RATE_LIMITED', message: 'Muitas tentativas para esta conta. Tente novamente em 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTestEnv && process.env.RATE_LIMIT_IN_TESTS !== 'true',
});

module.exports = {
  loginAccountLimiter,
  emailIpLimiter,
  emailTargetLimiter,
  bookingLimiter,
  authLimiter,
  refreshLimiter,
  apiLimiter,
  paymentLimiter,
};