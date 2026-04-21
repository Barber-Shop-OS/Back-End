// Auth service responsible for registration, login, and profile lookup.
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User } = require('../../models');
const { AppError, ValidationError, NotFoundError } = require('../../utils/errorHandler');

const sanitizeUser = (user) => {
  if (!user) return null;
  const plainUser = user.toJSON ? user.toJSON() : user;
  const { password, ...safeUser } = plainUser;
  return safeUser;
};

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
    throw new AppError('E-mail já está em uso', 409);
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
    throw new AppError('Credenciais inválidas', 401);
  }

  const isValidPassword = await bcrypt.compare(password, user.password);
  if (!isValidPassword) {
    throw new AppError('Credenciais inválidas', 401);
  }

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );

  return {
    token,
    user: sanitizeUser(user),
  };
};

const getMe = async (userId) => {
  const user = await User.findByPk(userId, {
    attributes: { exclude: ['password'] },
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