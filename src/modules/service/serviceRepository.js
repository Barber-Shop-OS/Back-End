// Service repository with filtered queries and CRUD operations.
const { Service, Barbershop } = require('../../models');

const findAll = async (where = {}, options = {}) => {
  return Service.findAndCountAll({
    where,
    ...options,
    include: options.include || [{ model: Barbershop, attributes: ['id', 'name'] }],
    distinct: true,
  });
};

const findById = async (id, includeOptions = []) => {
  return Service.findByPk(id, {
    include: includeOptions.length ? includeOptions : [{ model: Barbershop, attributes: ['id', 'name'] }],
  });
};

const create = async (data, options = {}) => Service.create(data, options);

const update = async (id, data) => {
  const service = await Service.findByPk(id);
  if (!service) return null;
  return service.update(data);
};

const remove = async (id) => {
  const service = await Service.findByPk(id);
  if (!service) return false;
  await service.destroy();
  return true;
};

module.exports = {
  findAll,
  findById,
  create,
  update,
  delete: remove,
};