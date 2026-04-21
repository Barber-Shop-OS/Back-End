// Auth controller that delegates registration and login to the auth service.
const authService = require('./authService');
const { created, success } = require('../../utils/responseHandler');

const register = async (req, res, next) => {
  try {
    const user = await authService.register(req.body);
    return created(res, { message: 'Usuário cadastrado com sucesso', user });
  } catch (error) {
    return next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const result = await authService.login(email, password);
    return success(res, {
      message: 'Login realizado com sucesso',
      ...result,
    });
  } catch (error) {
    return next(error);
  }
};

const getMe = async (req, res, next) => {
  try {
    const user = await authService.getMe(req.user.id);
    return success(res, user);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  register,
  login,
  getMe,
};