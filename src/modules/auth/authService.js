// Auth service responsible for registration, login, and profile lookup.
const bcrypt = require('bcryptjs');
const { User } = require('../../models');
const config = require('../../config/config');
const { signAccessToken } = require('../../shared/tokens');
const { sanitizeUser, PRIVATE_USER_FIELDS } = require('../../shared/sanitizeUser');
const { assertStrongPassword } = require('../../shared/passwordPolicy');
const { ValidationError, NotFoundError, UnauthorizedError, ConflictError, CODES } = require('../../utils/errorHandler');

// SEC-10: custo 12 em produção/dev; 4 em teste para a suíte rodar rápido.
const BCRYPT_ROUNDS = config.isTest ? 4 : 12;
// Hash fixo usado quando o e-mail não existe, para o tempo de resposta não revelar contas.
const DUMMY_HASH = bcrypt.hashSync('barberos-dummy-password', BCRYPT_ROUNDS);

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const register = async (data = {}) => {
  const name = String(data.name || '').trim();
  const email = normalizeEmail(data.email);
  const { password } = data;

  if (!name) {
    throw new ValidationError("Campo 'name' é obrigatório");
  }
  if (!email) {
    throw new ValidationError("Campo 'email' é obrigatório");
  }
  assertStrongPassword(password, { email, name });

  const existingUser = await User.findOne({ where: { email } });
  if (existingUser) {
    throw new ConflictError('E-mail já está em uso', CODES.EMAIL_IN_USE);
  }

  const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const user = await User.create({
    name,
    email,
    password: hashedPassword,
    role: 'cliente',
    ...(data.terms_version ? { terms_version: String(data.terms_version).slice(0, 20), terms_accepted_at: new Date() } : {}),
  });
  // BE-27: link de confirmação (o vínculo com clientes de balcão acontece ao confirmar — BE-23).
  await require('./emailVerificationService').afterSignup(user);

  return sanitizeUser(user);
};

const login = async (rawEmail, password) => {
  const email = normalizeEmail(rawEmail);
  if (!email || !password) {
    throw new ValidationError('E-mail e senha são obrigatórios');
  }

  const user = await User.findOne({ where: { email } });
  if (!user) {
    await bcrypt.compare(String(password), DUMMY_HASH);
    throw new UnauthorizedError('Credenciais inválidas', CODES.INVALID_CREDENTIALS);
  }

  // BE-28: conta criada só com Google não tem senha — mesma resposta de credencial inválida.
  if (!user.password) {
    await bcrypt.compare(String(password), DUMMY_HASH);
    throw new UnauthorizedError('Credenciais inválidas', CODES.INVALID_CREDENTIALS);
  }
  const isValidPassword = await bcrypt.compare(password, user.password);
  if (!isValidPassword) {
    throw new UnauthorizedError('Credenciais inválidas', CODES.INVALID_CREDENTIALS);
  }

  const token = signAccessToken(user);

  return {
    token,
    user: sanitizeUser(user),
  };
};

const getMe = async (userId) => {
  const user = await User.findByPk(userId, {
    attributes: { exclude: PRIVATE_USER_FIELDS },
  });

  if (!user) {
    throw new NotFoundError('Usuário não encontrado');
  }

  return user;
};

module.exports = {
  register,
  login,
  getMe,
};