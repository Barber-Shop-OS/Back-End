// Barber controller for listing and CRUD operations.
const barberService = require('./barberService');
const { success, created, noContent } = require('../../utils/responseHandler');

const getAll = async (req, res, next) => {
  try {
    const result = await barberService.findAll(req.query);
    return success(res, result);
  } catch (error) {
    return next(error);
  }
};

const getById = async (req, res, next) => {
  try {
    const barber = await barberService.findById(req.params.id);
    return success(res, barber);
  } catch (error) {
    return next(error);
  }
};

const create = async (req, res, next) => {
  try {
    const barber = await barberService.create(req.body, req.user);
    return created(res, { message: 'Barbeiro criado com sucesso', barber });
  } catch (error) {
    return next(error);
  }
};

const update = async (req, res, next) => {
  try {
    const barber = await barberService.update(req.params.id, req.body, req.user);
    return success(res, { message: 'Barbeiro atualizado com sucesso', barber });
  } catch (error) {
    return next(error);
  }
};

const remove = async (req, res, next) => {
  try {
    await barberService.remove(req.params.id, req.user, { force: req.query.force });
    return noContent(res);
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
/** POST /api/branch/:id/barbers */
const createInBranch = async (req, res, next) => {
  try {
    const result = await barberService.createInBranch(req.params.id, req.body, req.user);
    if (result.invitation) {
      return res.status(202).json({ message: 'Convite enviado', invitation: result.invitation });
    }
    return created(res, { message: 'Barbeiro criado com sucesso', barber: result.barber });
  } catch (error) {
    return next(error);
  }
};

module.exports.createInBranch = createInBranch;

/** PUT /api/barber/:id/services */
module.exports.setServices = async (req, res, next) => {
  try {
    const barber = await barberService.setServices(req.params.id, req.body.service_ids, req.user);
    return success(res, { message: 'Serviços do barbeiro atualizados', barber });
  } catch (error) {
    return next(error);
  }
};
