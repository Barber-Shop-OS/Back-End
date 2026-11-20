// Rotas administrativas da plataforma (role admin). Expandidas em BE-41.
const express = require('express');
const userController = require('../user/userController');
const authMiddleware = require('../../middlewares/authMiddleware');
const roleMiddleware = require('../../middlewares/roleMiddleware');

const userSchemas = require('../user/userSchemas');
const validate = require('../../middlewares/validate');
const { Joi, text, idParams, pagination } = require('../../shared/schemas');
const { handle } = require('../branchSchedule/branchScheduleController');
const { success } = require('../../utils/responseHandler');
const adminService = require('./adminService');
const { SUBSCRIPTION_STATUSES } = require('../../models/subscription');

const router = express.Router();

router.use(authMiddleware, roleMiddleware(['admin']));

/**
 * @swagger
 * /admin/users/{id}/role:
 *   patch:
 *     summary: Alterar o papel de um usuário (somente admin)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [role]
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [cliente, barbeiro, owner, admin]
 *     responses:
 *       200:
 *         description: Papel atualizado
 *       400:
 *         description: Papel inválido ou admin tentando remover o próprio acesso
 *       403:
 *         description: Não é admin
 *       404:
 *         description: Usuário não encontrado
 */
router.patch('/users/:id/role', userSchemas.changeRole, userController.changeUserRole);

/**
 * @swagger
 * /admin/barbershops:
 *   get:
 *     summary: Barbearias com dono e status da assinatura (busca por nome/slug)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: query, name: q, schema: { type: string } }
 *       - { in: query, name: status, schema: { type: string, enum: [active, suspended, deleted] } }
 *       - { in: query, name: subscription_status, schema: { type: string, enum: [trialing, pending, active, past_due, canceled, expired] } }
 *       - { in: query, name: page, schema: { type: integer } }
 *     responses:
 *       200: { description: Lista paginada }
 * /admin/barbershops/{id}:
 *   get:
 *     summary: Detalhe (filiais, uso, assinatura e eventos)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Detalhe }
 * /admin/barbershops/{id}/suspend:
 *   post:
 *     summary: Suspende a barbearia (sai da busca, página e agendamento)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: "{ id, status }" }
 * /admin/barbershops/{id}/reactivate:
 *   post:
 *     summary: Reativa a barbearia
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: "{ id, status }" }
 * /admin/barbershops/{id}/extend-trial:
 *   post:
 *     summary: Estende o trial (ativo ou expirado) em N dias
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, required: [days], properties: { days: { type: integer, minimum: 1, maximum: 90 } } }
 *     responses:
 *       200: { description: "{ barbershop_id, status, trial_ends_at }" }
 * /admin/users:
 *   get:
 *     summary: Usuários (busca por nome/e-mail, filtro por papel)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Lista paginada }
 * /admin/metrics:
 *   get:
 *     summary: MRR, assinaturas por status/plano, trials, novas barbearias e churn (30 dias)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Métricas }
 */
router.get(
  '/barbershops',
  validate({
    query: Joi.object({
      ...pagination,
      q: text(100),
      status: Joi.string().valid('active', 'suspended', 'deleted'),
      subscription_status: Joi.string().valid(...SUBSCRIPTION_STATUSES),
    }),
  }),
  handle(async (req, res) => success(res, await adminService.listBarbershops(req.query)))
);
router.get('/barbershops/:id', validate({ params: idParams }), handle(async (req, res) => success(res, await adminService.getBarbershop(req.params.id))));
router.post(
  '/barbershops/:id/suspend',
  validate({ params: idParams, body: Joi.object({ reason: text(255) }) }),
  handle(async (req, res) => success(res, await adminService.setStatus(req.params.id, 'suspended', req.body.reason)))
);
router.post(
  '/barbershops/:id/reactivate',
  validate({ params: idParams }),
  handle(async (req, res) => success(res, await adminService.setStatus(req.params.id, 'active')))
);
router.post(
  '/barbershops/:id/extend-trial',
  validate({ params: idParams, body: Joi.object({ days: Joi.number().integer().min(1).max(90).required() }) }),
  handle(async (req, res) => success(res, await adminService.extendTrial(req.params.id, req.body.days)))
);
router.get(
  '/users',
  validate({ query: Joi.object({ ...pagination, q: text(100), role: Joi.string().valid('cliente', 'barbeiro', 'owner', 'admin') }) }),
  handle(async (req, res) => success(res, await adminService.listUsers(req.query)))
);
router.get('/metrics', handle(async (req, res) => success(res, await adminService.metrics())));

module.exports = router;
