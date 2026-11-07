// Branch repository that handles direct branch persistence.
const { Branch, Address, Barber } = require('../../models');

const findAll = async (where = {}, options = {}) => {
  return Branch.findAndCountAll({
    where,
    ...options,
    include: options.include || [Address],
    distinct: true,
  });
};

const findById = async (id, includeOptions = []) => {
  return Branch.findByPk(id, {
    include: includeOptions.length ? includeOptions : [Address, Barber],
  });
};

const create = async (data, options = {}) => Branch.create(data, options);

const update = async (id, data, options = {}) => {
  const branch = await Branch.findByPk(id, options);
  if (!branch) return null;
  return branch.update(data, options);
};

const remove = async (id) => {
  const branch = await Branch.findByPk(id);
  if (!branch) return false;
  await branch.destroy();
  return true;
};

module.exports = {
  findAll,
  findById,
  create,
  update,
  delete: remove,
};
