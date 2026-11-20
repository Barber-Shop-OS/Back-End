// BE-28: login/cadastro com Google (ID token do Google Identity Services).
//   1. valida o token com google-auth-library: assinatura, audience = GOOGLE_CLIENT_ID, expiração,
//      emissor; exige email_verified = true;
//   2. identidade já vinculada (provider + sub) → entra;
//   3. conta com o mesmo e-mail → vincula a identidade (e marca o e-mail como verificado);
//   4. sem conta → cria cliente (login/signup-client) ou dono + barbearia + trial (signup-owner).
const { OAuth2Client } = require('google-auth-library');
const { sequelize, User, UserIdentity } = require('../../models');
const { signAccessToken } = require('../../shared/tokens');
const { sanitizeUser } = require('../../shared/sanitizeUser');
const { normalizePhone } = require('../../shared/phone');
const { isValidSlug } = require('../../shared/slug');
const { Barbershop } = require('../../models');
const logger = require('../../utils/logger');
const { AppError, ConflictError, ValidationError, UnauthorizedError, CODES } = require('../../utils/errorHandler');

const PROVIDER = 'google';

let verifier = null;
/** Valida o id_token e devolve o payload. Substituível nos testes (setVerifier). */
const defaultVerifier = async (idToken, audience) => {
  const client = new OAuth2Client(audience);
  const ticket = await client.verifyIdToken({ idToken, audience });
  return ticket.getPayload();
};
const setVerifier = (fn) => {
  verifier = fn;
};

const verifyToken = async (idToken) => {
  const audience = process.env.GOOGLE_CLIENT_ID;
  if (!audience) throw new AppError('Login com Google indisponível', 503, CODES.GOOGLE_LOGIN_UNAVAILABLE);
  let payload;
  try {
    payload = await (verifier || defaultVerifier)(idToken, audience);
  } catch (error) {
    logger.info('[auth] id_token do Google recusado', { reason: error.message });
    throw new UnauthorizedError('Token do Google inválido', CODES.GOOGLE_TOKEN_INVALID);
  }
  // Defesa em profundidade: o verificador já confere a audience, mas um verificador trocado não pode
  // aceitar token emitido para outro app.
  const aud = Array.isArray(payload && payload.aud) ? payload.aud : [payload && payload.aud];
  if (!payload || !aud.includes(audience) || !payload.sub || !payload.email) {
    throw new UnauthorizedError('Token do Google inválido', CODES.GOOGLE_TOKEN_INVALID);
  }
  if (payload.email_verified !== true && payload.email_verified !== 'true') {
    throw new UnauthorizedError('E-mail do Google não verificado', CODES.GOOGLE_TOKEN_INVALID);
  }
  return { sub: String(payload.sub), email: String(payload.email).trim().toLowerCase(), name: payload.name || payload.given_name || null };
};

const linkIdentity = (user, google, transaction) =>
  UserIdentity.create({ user_id: user.id, provider: PROVIDER, provider_user_id: google.sub, email: google.email }, { transaction });

const session = (user, extra = {}) => ({ token: signAccessToken(user), user: sanitizeUser(user), ...extra });

const authenticate = async ({ id_token: idToken, intent = 'login', name, phone, barbershop, plan_code: planCode }) => {
  const google = await verifyToken(idToken);
  const displayName = String(name || google.name || google.email.split('@')[0]).trim().slice(0, 120);

  // 2. Identidade já vinculada
  const identity = await UserIdentity.findOne({ where: { provider: PROVIDER, provider_user_id: google.sub } });
  if (identity) {
    const user = await User.findByPk(identity.user_id);
    if (!user) throw new UnauthorizedError('Conta não encontrada', CODES.GOOGLE_TOKEN_INVALID);
    if (intent === 'signup-owner' && user.role !== 'owner') {
      throw new ConflictError('Já existe uma conta com este e-mail. Entre e cadastre a barbearia pelo painel.', CODES.EMAIL_IN_USE);
    }
    return session(user, { created: false });
  }

  // 3. Conta existente com o mesmo e-mail → vincula
  const existing = await User.findOne({ where: { email: google.email } });
  if (existing) {
    if (intent === 'signup-owner' && existing.role !== 'owner') {
      throw new ConflictError('Já existe uma conta com este e-mail. Entre e cadastre a barbearia pelo painel.', CODES.EMAIL_IN_USE);
    }
    await sequelize.transaction(async (transaction) => {
      await linkIdentity(existing, google, transaction);
      if (!existing.email_verified_at) await existing.update({ email_verified_at: new Date() }, { transaction });
    });
    return session(existing, { created: false, linked: true });
  }

  // 4. Conta nova
  if (intent === 'signup-owner') {
    if (!barbershop || !barbershop.name) throw new ValidationError("Campo 'barbershop.name' é obrigatório para cadastrar a barbearia");
    if (!phone) throw new ValidationError("Campo 'phone' é obrigatório para cadastrar a barbearia");
    if (barbershop.slug && !isValidSlug(barbershop.slug)) throw new ValidationError('Slug inválido', undefined, CODES.INVALID_SLUG);
    if (barbershop.slug && (await Barbershop.count({ where: { slug: barbershop.slug } }))) {
      throw new ConflictError('Este endereço já está em uso por outra barbearia', CODES.SLUG_TAKEN);
    }
    const result = await require('./registerOwnerService').createOwnerAccount({
      name: displayName,
      email: google.email,
      password: null,
      phone: normalizePhone(phone),
      shopName: String(barbershop.name).trim(),
      slug: barbershop.slug,
      planCode,
      emailVerifiedAt: new Date(),
      identity: (user, transaction) => linkIdentity(user, google, transaction),
    });
    return { ...result, created: true };
  }

  const user = await sequelize.transaction(async (transaction) => {
    const created = await User.create(
      {
        name: displayName,
        email: google.email,
        password: null,
        role: 'cliente',
        phone: phone ? normalizePhone(phone) : null,
        email_verified_at: new Date(),
      },
      { transaction }
    );
    await linkIdentity(created, google, transaction);
    return created;
  });
  // E-mail comprovado pelo Google: clientes de balcão com o mesmo e-mail viram desta conta (BE-23).
  await require('../client/clientService').linkAccount(user);
  return session(user, { created: true });
};

module.exports = { authenticate, verifyToken, setVerifier, PROVIDER };
