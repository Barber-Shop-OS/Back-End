// BE-10: controller de horário de funcionamento e fechamentos (rotas montadas em /api/branch/:id/...).
const service = require('./branchScheduleService');
const { success, created, noContent } = require('../../utils/responseHandler');

const handle = (fn) => async (req, res, next) => {
  try {
    return await fn(req, res);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getOpeningHours: handle(async (req, res) => success(res, await service.getOpeningHours(req.params.id))),
  replaceOpeningHours: handle(async (req, res) =>
    success(res, await service.replaceOpeningHours(req.params.id, req.body.opening_hours, req.user))
  ),
  listClosures: handle(async (req, res) => success(res, { items: await service.listClosures(req.params.id, req.query) })),
  createClosure: handle(async (req, res) =>
    created(res, { message: 'Fechamento criado', closure: await service.createClosure(req.params.id, req.body, req.user) })
  ),
  updateClosure: handle(async (req, res) =>
    success(res, {
      message: 'Fechamento atualizado',
      closure: await service.updateClosure(req.params.id, req.params.closureId, req.body, req.user),
    })
  ),
  removeClosure: handle(async (req, res) => {
    await service.removeClosure(req.params.id, req.params.closureId, req.user);
    return noContent(res);
  }),
  handle,
};
