// BE-47: /api/barbershop/:id/members — gerentes de filial. BE-49: + recepcionistas (atendimento).
const authMiddleware = require('../../middlewares/authMiddleware');
const roleMiddleware = require('../../middlewares/roleMiddleware');
const validate = require('../../middlewares/validate');
const { Joi, id, email, idParams } = require('../../shared/schemas');
const { handle } = require('../branchSchedule/branchScheduleController');
const { success, created } = require('../../utils/responseHandler');
const memberService = require('./memberService');

const memberParams = Joi.object({ id: id().required(), memberId: id().required() });
const branchIds = Joi.array().items(id()).max(50).allow(null);
const memberRole = Joi.string().valid('manager', 'receptionist');
const owner = [authMiddleware, roleMiddleware(['admin', 'owner'])];

/**
 * @swagger
 * /barbershop/{id}/members:
 *   get:
 *     summary: Equipe de gestão e atendimento (gerentes e recepcionistas)
 *     description: Dono vê todos (filtro opcional role). Gerente vê só os recepcionistas das filiais dele.
 *     tags: [Members]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *       - { in: query, name: role, schema: { type: string, enum: [manager, receptionist] } }
 *     responses:
 *       200: { description: "{ items: [{ id, user: { id, name, email }, role, branch_ids, branch_id, created_at }] }" }
 *   post:
 *     summary: Adicionar gerente (dono, plano Rede) ou recepcionista (dono ou gerente da filial) — conta existente, por e-mail
 *     description: >
 *       role manager (padrão): branch_ids nulo/ausente = todas as filiais; recurso branch_managers (402 FEATURE_NOT_IN_PLAN fora do plano Rede).
 *       role receptionist: branch_id obrigatório (uma filial); gerente só nas filiais dele (403); disponível em todos os planos.
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
 *             properties:
 *               email: { type: string }
 *               role: { type: string, enum: [manager, receptionist], default: manager }
 *               branch_ids: { type: array, items: { type: integer }, nullable: true }
 *               branch_id: { type: integer }
 *     responses:
 *       201: { description: "{ member: { id, user, role, branch_ids, branch_id, created_at } }" }
 *       402: { description: FEATURE_NOT_IN_PLAN }
 *       403: { description: Gerente tentando adicionar gerente ou filial fora do escopo }
 *       404: { description: USER_NOT_FOUND }
 *       409: { description: Já faz parte da equipe }
 * /barbershop/{id}/members/{memberId}:
 *   patch:
 *     summary: Alterar filiais do gerente (branch_ids) ou a filial do recepcionista (branch_id)
 *     tags: [Members]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *       - { in: path, name: memberId, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Atualizado }
 *   delete:
 *     summary: Remover gerente (dono) ou recepcionista (dono ou gerente da filial)
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
  router.get(
    '/:id/members',
    ...owner,
    validate({ params: idParams, query: Joi.object({ role: memberRole }) }),
    handle(async (req, res) => success(res, await memberService.list(req.params.id, req.user, req.query)))
  );
  router.post(
    '/:id/members',
    ...owner,
    validate({ params: idParams, body: Joi.object({ email: email().required(), role: memberRole, branch_ids: branchIds, branch_id: id() }) }),
    handle(async (req, res) => created(res, { member: await memberService.add(req.params.id, req.body, req.user) }))
  );
  router.patch(
    '/:id/members/:memberId',
    ...owner,
    validate({ params: memberParams, body: Joi.object({ branch_ids: branchIds, branch_id: id() }).or('branch_ids', 'branch_id') }),
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
