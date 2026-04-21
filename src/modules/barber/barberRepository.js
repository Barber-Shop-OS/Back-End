// Barber repository with CRUD and filtered listing.
const { Barber, User, Branch, Address } = require('../../models');

const findAll = async (where = {}, options = {}) => {
  return Barber.findAndCountAll({
    where,
    ...options,
    include: options.include || [
      { model: User, attributes: { exclude: ['password'] } },
      { model: Branch, include: [Address] },
    ],
    distinct: true,
  });
};

const findById = async (id, includeOptions = []) => {
  return Barber.findByPk(id, {
    include: includeOptions.length ? includeOptions : [
      { model: User, attributes: { exclude: ['password'] } },
      { model: Branch, include: [Address] },
    ],
  });
};

const create = async (data) => Barber.create(data);

const update = async (id, data) => {
  const barber = await Barber.findByPk(id);
  if (!barber) return null;
  return barber.update(data);
};

const remove = async (id) => {
  const barber = await Barber.findByPk(id);
  if (!barber) return false;
  await barber.destroy();
  return true;
};

module.exports = {
  findAll,
  findById,
  create,
  update,
  delete: remove,
};