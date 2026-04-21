// Barbershop controller handling list, detail, create, update, and delete actions.
const barbershopService = require('./barbershopService');
const { Barbershop } = require('../../models');
const { success, created, noContent } = require('../../utils/responseHandler');
const { NotFoundError, ForbiddenError } = require('../../utils/errorHandler');

const getAll = async (req, res, next) => {
  try {
    const result = await barbershopService.findAll(req.query);
    return success(res, result);
  } catch (error) {
    return next(error);
  }
};

const getById = async (req, res, next) => {
  try {
    const barbershop = await barbershopService.findById(req.params.id);
    if (!barbershop) {
      throw new NotFoundError('Barbearia não encontrada');
    }
    return success(res, barbershop);
  } catch (error) {
    return next(error);
  }
};

const create = async (req, res, next) => {
  try {
    const barbershop = await barbershopService.create({
      name: req.body.name,
      owner_id: req.user.id,
    });
    return created(res, { message: 'Barbearia criada com sucesso', barbershop });
  } catch (error) {
    return next(error);
  }
};

const update = async (req, res, next) => {
  try {
    const barbershop = await Barbershop.findByPk(req.params.id);
    if (!barbershop) {
      throw new NotFoundError('Barbearia não encontrada');
    }

    if (req.user.role !== 'admin' && String(barbershop.owner_id) !== String(req.user.id)) {
      throw new ForbiddenError('Sem permissão para editar esta barbearia');
    }

    const updated = await barbershopService.update(req.params.id, req.body);
    return success(res, { message: 'Barbearia atualizada com sucesso', barbershop: updated });
  } catch (error) {
    return next(error);
  }
};

const remove = async (req, res, next) => {
  try {
    await barbershopService.remove(req.params.id);
    return success(res, { message: 'Barbearia removida com sucesso' });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getAll,
  getById,
  create,
  update,
  remove,
};