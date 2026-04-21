// User controller that delegates all persistence work to the user service.
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
    const user = await userService.findById(req.params.id);
    return success(res, user);
  } catch (error) {
    return next(error);
  }
};

const updateUser = async (req, res, next) => {
  try {
    const user = await userService.update(req.params.id, req.body);
    return success(res, { message: 'Usuário atualizado com sucesso', user });
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
  deleteUser,
};