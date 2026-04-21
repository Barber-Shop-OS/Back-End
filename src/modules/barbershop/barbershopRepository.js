// Barbershop repository with CRUD and query support.
const { Barbershop, Branch, Address, User } = require('../../models');

const findAll = async (where = {}, options = {}) => {
  return Barbershop.findAndCountAll({
    where,
    ...options,
    include: options.include || [
      { model: User, as: 'owner', attributes: ['id', 'name', 'email'] },
      { model: Branch, include: [Address] },
    ],
    distinct: true,
  });
};

const findById = async (id, includeOptions = []) => {
  return Barbershop.findByPk(id, {
    include: includeOptions.length ? includeOptions : [
      { model: Branch, include: [Address] },
      { model: User, as: 'owner', attributes: ['id', 'name', 'email'] },
    ],
  });
};

const create = async (data) => Barbershop.create(data);

const update = async (id, data) => {
  const barbershop = await Barbershop.findByPk(id);
  if (!barbershop) return null;
  return barbershop.update(data);
};

const remove = async (id) => {
  const barbershop = await Barbershop.findByPk(id);
  if (!barbershop) return false;
  await barbershop.destroy();
  return true;
};

module.exports = {
  findAll,
  findById,
  create,
  update,
  delete: remove,
};