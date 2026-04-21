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

const create = async (data) => Branch.create(data);

const update = async (id, data) => {
  const branch = await Branch.findByPk(id);
  if (!branch) return null;
  return branch.update(data);
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