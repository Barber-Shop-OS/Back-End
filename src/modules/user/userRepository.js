// User repository with pagination and basic CRUD operations.
const { User } = require('../../models');

const findAll = async (where = {}, options = {}) => {
  return User.findAndCountAll({
    where,
    ...options,
  });
};

const findById = async (id, options = {}) => {
  return User.findByPk(id, options);
};

const update = async (id, data) => {
  const user = await User.findByPk(id);
  if (!user) return null;
  return user.update(data);
};

const remove = async (id) => {
  const user = await User.findByPk(id);
  if (!user) return false;
  await user.destroy();
  return true;
};

module.exports = {
  findAll,
  findById,
  update,
  delete: remove,
};