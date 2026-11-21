// SEC-27: autenticação em dois fatores (TOTP).
//   setup   → gera segredo pendente e devolve otpauth:// (QR) + o segredo para digitar;
//   enable  → confere um código do app, ativa e devolve 10 códigos de recuperação (só desta vez);
//   disable → senha + código (admin não pode desligar: 2FA é obrigatório para admin).
// Login com 2FA ativo: a senha certa devolve um `challenge_token` (5 min); a sessão só abre em
// POST /auth/2fa/verify com o código do app ou um código de recuperação (uso único).
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { User } = require('../../models');
const totp = require('../../shared/totp');
const secretBox = require('../../shared/secretBox');
const config = require('../../config/config');
const audit = require('../audit/auditService');
const { ValidationError, UnauthorizedError, ConflictError, NotFoundError, CODES } = require('../../utils/errorHandler');

const CHALLENGE_AUDIENCE = 'barberos-2fa';
const CHALLENGE_TTL = '5m';
const RECOVERY_CODES = 10;

const hash = (code) =>
  crypto
    .createHash('sha256')
    .update(String(code).toUpperCase().replace(/[^A-Z0-9]/g, ''))
    .digest('hex');

const newRecoveryCode = () => {
  const raw = crypto.randomBytes(5).toString('hex').toUpperCase();
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
};

const loadUser = async (userId) => {
  const user = await User.findByPk(userId);
  if (!user) throw new NotFoundError('Usuário não encontrado');
  return user;
};

const isEnabled = (user) => Boolean(user && user.totp_enabled_at && user.totp_secret);

const setup = async (userId) => {
  const user = await loadUser(userId);
  if (isEnabled(user)) throw new ConflictError('A verificação em duas etapas já está ativa', CODES.CONFLICT);
  const secret = totp.generateSecret();
  await user.update({ totp_pending_secret: secretBox.seal(secret) });
  return { secret, otpauth_url: totp.otpauthUrl(secret, user.email) };
};

const enable = async (userId, code) => {
  const user = await loadUser(userId);
  if (isEnabled(user)) throw new ConflictError('A verificação em duas etapas já está ativa', CODES.CONFLICT);
  if (!user.totp_pending_secret) throw new ValidationError('Gere o QR code antes de ativar');
  const secret = secretBox.open(user.totp_pending_secret);
  const step = totp.verify(secret, code);
  if (step === null) {
    throw new ValidationError('Código inválido. Confira o horário do celular e tente de novo.', undefined, CODES.TWO_FACTOR_INVALID);
  }
  const codes = Array.from({ length: RECOVERY_CODES }, newRecoveryCode);
  await user.update({
    totp_secret: user.totp_pending_secret,
    totp_pending_secret: null,
    totp_enabled_at: new Date(),
    totp_last_step: step,
    totp_recovery_codes: JSON.stringify(codes.map(hash)),
  });
  await audit.record({ action: 'user.2fa_enabled', entity: 'user', entityId: user.id });
  return { enabled: true, recovery_codes: codes };
};

/**
 * Confere código do app ou de recuperação. Marca o passo usado / consome o código de recuperação.
 * Lança 401 TWO_FACTOR_INVALID se não bater.
 */
const assertCode = async (user, { code, recovery_code: recoveryCode }) => {
  if (code) {
    const lastStep = user.totp_last_step === null || user.totp_last_step === undefined ? null : Number(user.totp_last_step);
    const step = totp.verify(secretBox.open(user.totp_secret), code, { lastStep });
    if (step !== null) {
      await user.update({ totp_last_step: step });
      return 'totp';
    }
  } else if (recoveryCode) {
    const hashes = JSON.parse(user.totp_recovery_codes || '[]');
    const index = hashes.indexOf(hash(recoveryCode));
    if (index !== -1) {
      hashes.splice(index, 1);
      await user.update({ totp_recovery_codes: JSON.stringify(hashes) });
      await audit.record({ action: 'user.2fa_recovery_used', entity: 'user', entityId: user.id, after: { remaining: hashes.length } });
      return 'recovery';
    }
  }
  throw new UnauthorizedError('Código de verificação inválido', CODES.TWO_FACTOR_INVALID);
};

const disable = async (userId, { password, code, recovery_code: recoveryCode }) => {
  const user = await loadUser(userId);
  if (!isEnabled(user)) throw new ConflictError('A verificação em duas etapas não está ativa', CODES.CONFLICT);
  if (user.role === 'admin') {
    throw new ConflictError('A verificação em duas etapas é obrigatória para administradores', CODES.TWO_FACTOR_REQUIRED_FOR_ROLE);
  }
  if (!user.password || !password || !(await bcrypt.compare(String(password), user.password))) {
    throw new UnauthorizedError('Senha incorreta', CODES.INVALID_CURRENT_PASSWORD);
  }
  await assertCode(user, { code, recovery_code: recoveryCode });
  await user.update({ totp_secret: null, totp_pending_secret: null, totp_enabled_at: null, totp_recovery_codes: null, totp_last_step: null });
  await audit.record({ action: 'user.2fa_disabled', entity: 'user', entityId: user.id });
  return { enabled: false };
};

/** Token curto que prova "senha correta" enquanto o segundo fator não chega. */
const issueChallenge = (user) =>
  jwt.sign({ sub: String(user.id), tv: user.token_version || 0, purpose: '2fa' }, config.jwt.secret, {
    algorithm: config.jwt.algorithm,
    expiresIn: CHALLENGE_TTL,
    issuer: config.jwt.issuer,
    audience: CHALLENGE_AUDIENCE,
  });

/** Valida o challenge + segundo fator e devolve o usuário (a sessão é aberta pelo chamador). */
const completeChallenge = async ({ challenge_token: challengeToken, code, recovery_code: recoveryCode }) => {
  let payload;
  try {
    payload = jwt.verify(String(challengeToken || ''), config.jwt.secret, {
      algorithms: [config.jwt.algorithm],
      issuer: config.jwt.issuer,
      audience: CHALLENGE_AUDIENCE,
    });
  } catch {
    throw new UnauthorizedError('A verificação expirou. Entre novamente.', CODES.TOKEN_INVALID_OR_EXPIRED);
  }
  const user = await User.findByPk(payload.sub);
  if (!user || payload.purpose !== '2fa' || Number(user.token_version || 0) !== Number(payload.tv || 0) || !isEnabled(user)) {
    throw new UnauthorizedError('A verificação expirou. Entre novamente.', CODES.TOKEN_INVALID_OR_EXPIRED);
  }
  await assertCode(user, { code, recovery_code: recoveryCode });
  return user;
};

const status = async (userId) => {
  const user = await loadUser(userId);
  return {
    enabled: isEnabled(user),
    enabled_at: user.totp_enabled_at,
    required: user.role === 'admin',
    recovery_codes_left: isEnabled(user) ? JSON.parse(user.totp_recovery_codes || '[]').length : 0,
  };
};

module.exports = { setup, enable, disable, issueChallenge, completeChallenge, status, isEnabled };
