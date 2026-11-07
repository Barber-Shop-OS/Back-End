// User controller: delega ao service, sempre repassando o usuário autenticado para autorização.
const userService = require('./userService');
const { success, noContent } = require('../../utils/responseHandler');

const getAllUsers = async (req, res, next) => {
  try {
    const result = await userService.findAll(req.query);
    return success(res, result);
  } catch (error) {
    return next(error);
  }
};

const getUserById = async (req, res, next) => {
  try {
    const user = await userService.findById(req.params.id, req.user);
    return success(res, user);
  } catch (error) {
    return next(error);
  }
};

const updateUser = async (req, res, next) => {
  try {
    const user = await userService.update(req.params.id, req.body, req.user);
    return success(res, { message: 'Usuário atualizado com sucesso', user });
  } catch (error) {
    return next(error);
  }
};

const changeUserRole = async (req, res, next) => {
  try {
    const user = await userService.changeRole(req.params.id, req.body && req.body.role, req.user);
    return success(res, { message: 'Papel do usuário atualizado com sucesso', user });
  } catch (error) {
    return next(error);
  }
};

const deleteUser = async (req, res, next) => {
  try {
    await userService.remove(req.params.id);
    return noContent(res);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getAllUsers,
  getUserById,
  updateUser,
  changeUserRole,
  deleteUser,
};
