// BE-47: /api/barbershop/:id/members — gerentes de filial.
const authMiddleware = require('../../middlewares/authMiddleware');
const roleMiddleware = require('../../middlewares/roleMiddleware');
const validate = require('../../middlewares/validate');
const { Joi, id, email, idParams } = require('../../shared/schemas');
const { handle } = require('../branchSchedule/branchScheduleController');
const { success, created } = require('../../utils/responseHandler');
const memberService = require('./memberService');

const memberParams = Joi.object({ id: id().required(), memberId: id().required() });
const branchIds = Joi.array().items(id()).max(50).allow(null);
const owner = [authMiddleware, roleMiddleware(['admin', 'owner'])];

/**
 * @swagger
 * /barbershop/{id}/members:
 *   get:
 *     summary: Gerentes da barbearia (dono)
 *     tags: [Members]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: "{ items: [{ id, user, role, branch_ids }] }" }
 *   post:
 *     summary: Adicionar gerente (conta existente, por e-mail) — plano Rede
 *     description: branch_ids nulo/ausente = todas as filiais. Recurso branch_managers (402 FEATURE_NOT_IN_PLAN fora do plano Rede).
 *     tags: [Members]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties: { email: { type: string }, branch_ids: { type: array, items: { type: integer }, nullable: true } }
 *     responses:
 *       201: { description: Gerente adicionado }
 *       402: { description: FEATURE_NOT_IN_PLAN }
 *       404: { description: USER_NOT_FOUND }
 *       409: { description: Já é gerente }
 * /barbershop/{id}/members/{memberId}:
 *   patch:
 *     summary: Alterar filiais do gerente
 *     tags: [Members]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *       - { in: path, name: memberId, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Atualizado }
 *   delete:
 *     summary: Remover gerente
 *     tags: [Members]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *       - { in: path, name: memberId, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: Removido }
 */
const registerBarbershopRoutes = (router) => {
  router.get('/:id/members', ...owner, validate({ params: idParams }), handle(async (req, res) => success(res, await memberService.list(req.params.id, req.user))));
  router.post(
    '/:id/members',
    ...owner,
    validate({ params: idParams, body: Joi.object({ email: email().required(), branch_ids: branchIds }) }),
    handle(async (req, res) => created(res, { member: await memberService.add(req.params.id, req.body, req.user) }))
  );
  router.patch(
    '/:id/members/:memberId',
    ...owner,
    validate({ params: memberParams, body: Joi.object({ branch_ids: branchIds.required() }) }),
    handle(async (req, res) => success(res, { member: await memberService.update(req.params.id, req.params.memberId, req.body, req.user) }))
  );
  router.delete(
    '/:id/members/:memberId',
    ...owner,
    validate({ params: memberParams }),
    handle(async (req, res) => {
      await memberService.remove(req.params.id, req.params.memberId, req.user);
      return res.status(204).end();
    })
  );
};

module.exports = { registerBarbershopRoutes };
