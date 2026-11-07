// Address repository used by branch workflows.
const { Address } = require('../../models');

const create = async (data, options = {}) => Address.create(data, options);

const findById = async (id) => Address.findByPk(id);

const update = async (id, data, options = {}) => {
  const address = await Address.findByPk(id, options);
  if (!address) return null;
  return address.update(data, options);
};

module.exports = {
  create,
  findById,
  update,
};
