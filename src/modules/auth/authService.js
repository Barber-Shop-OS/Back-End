// Auth service responsible for registration, login, and profile lookup.
const bcrypt = require('bcryptjs');
const { User } = require('../../models');
const { signAccessToken } = require('../../shared/tokens');
const { sanitizeUser, PRIVATE_USER_FIELDS } = require('../../shared/sanitizeUser');
const { ValidationError, NotFoundError, UnauthorizedError, ConflictError, CODES } = require('../../utils/errorHandler');

const register = async (data = {}) => {
  const { name, email, password } = data;

  if (!name || String(name).trim() === '') {
    throw new ValidationError("Campo 'name' é obrigatório");
  }
  if (!email || String(email).trim() === '') {
    throw new ValidationError("Campo 'email' é obrigatório");
  }
  if (!password || String(password).trim().length < 6) {
    throw new ValidationError('Senha deve ter no mínimo 6 caracteres');
  }

  const existingUser = await User.findOne({ where: { email } });
  if (existingUser) {
    throw new ConflictError('E-mail já está em uso', CODES.EMAIL_IN_USE);
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = await User.create({
    name,
    email,
    password: hashedPassword,
    role: 'cliente',
  });

  return sanitizeUser(user);
};

const login = async (email, password) => {
  if (!email || !password) {
    throw new ValidationError('E-mail e senha são obrigatórios');
  }

  const user = await User.findOne({ where: { email } });
  if (!user) {
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