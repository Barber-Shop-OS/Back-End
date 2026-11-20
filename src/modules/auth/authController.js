// Auth controller that delegates registration and login to the auth service.
const authService = require('./authService');
const sessionService = require('./sessionService');
const { User } = require('../../models');
const { created, success } = require('../../utils/responseHandler');

const register = async (req, res, next) => {
  try {
    const user = await authService.register(req.body);
    return created(res, { message: 'Usuário cadastrado com sucesso', user });
  } catch (error) {
    return next(error);
  }
};

const registerOwner = async (req, res, next) => {
  try {
    const result = await require('./registerOwnerService').registerOwner(req.body);
    const session = await sessionService.start(req, res, await User.findByPk(result.user.id));
    return created(res, { message: 'Conta criada com 14 dias de teste', ...result, ...session });
  } catch (error) {
    return next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const result = await authService.login(email, password);
    // BE-30: refresh token em cookie httpOnly (web) ou no corpo (mobile).
    const session = await sessionService.start(req, res, await User.findByPk(result.user.id));
    return success(res, {
      message: 'Login realizado com sucesso',
      ...result,
      ...session,
    });
  } catch (error) {
    return next(error);
  }
};

const getMe = async (req, res, next) => {
  try {
    // BE-20: alias de GET /api/me.
    const user = await require('../me/meService').getMe(req.user.id);
    return success(res, user);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  register,
  registerOwner,
  login,
  getMe,
};