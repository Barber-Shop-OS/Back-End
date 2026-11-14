// Barbershop controller handling list, detail, create, update, and delete actions.
const barbershopService = require('./barbershopService');
const { success, created } = require('../../utils/responseHandler');
const { NotFoundError } = require('../../utils/errorHandler');

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

const barbershopPublicService = require('./barbershopPublicService');

/** GET /api/barbershop/slug/:slug — perfil público (BE-18). */
const getBySlug = async (req, res, next) => {
  try {
    return success(res, await barbershopPublicService.getBySlug(req.params.slug));
  } catch (error) {
    return next(error);
  }
};

const create = async (req, res, next) => {
  try {
    const barbershop = await barbershopService.create({ ...req.body, owner_id: req.user.id });
    return created(res, { message: 'Barbearia criada com sucesso', barbershop });
  } catch (error) {
    return next(error);
  }
};

const update = async (req, res, next) => {
  try {
    const updated = await barbershopService.update(req.params.id, req.body, req.user);
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
  getBySlug,
  getAll,
  getById,
  create,
  update,
  remove,
};