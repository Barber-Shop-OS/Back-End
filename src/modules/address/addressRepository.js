// Address repository used by branch and payment-related workflows.
const { Address } = require('../../models');

const create = async (data) => Address.create(data);

const findById = async (id) => Address.findByPk(id);

const update = async (id, data) => {
  const address = await Address.findByPk(id);
  if (!address) return null;
  return address.update(data);
};

module.exports = {
  create,
  findById,
  update,
};