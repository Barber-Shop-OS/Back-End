// BE-31: GET /api/plans (público). A assinatura da barbearia fica em /api/barbershop/:id/subscription.
const express = require('express');
const authMiddleware = require('../../middlewares/authMiddleware');
const roleMiddleware = require('../../middlewares/roleMiddleware');
const validate = require('../../middlewares/validate');
const { idParams } = require('../../shared/schemas');
const { handle } = require('../branchSchedule/branchScheduleController');
const { success } = require('../../utils/responseHandler');
const subscriptionService = require('./subscriptionService');

const plansRouter = express.Router();

/**
 * @swagger
 * /plans:
 *   get:
 *     summary: Planos disponíveis com preço, limites e recursos (público)
 *     tags: [Billing]
 *     security: []
 *     responses:
 *       200:
 *         description: Planos
 *         content:
 *           application/json:
 *             example:
 *               items: [{ code: essencial, name: Essencial, price_cents: 9900, price: '99.00', currency: BRL, interval: MONTHLY, limits: { branches: 1, barbers: 3 }, features: [agenda] }]
 */
plansRouter.get('/', handle(async (req, res) => success(res, { items: await subscriptionService.listPlans() })));

/**
 * @swagger
 * /barbershop/{id}/subscription:
 *   get:
 *     summary: Assinatura da barbearia (status, plano efetivo, limites e uso)
 *     tags: [Billing]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Assinatura }
 *       403: { description: Barbearia de outro dono }
 *       404: { description: Barbearia ou assinatura não encontrada }
 */
const registerBarbershopRoutes = (router) => {
  router.get(
    '/:id/subscription',
    authMiddleware,
    roleMiddleware(['admin', 'owner']),
    validate({ params: idParams }),
    handle(async (req, res) => success(res, await subscriptionService.getForBarbershop(req.params.id, req.user)))
  );
};

module.exports = { plansRouter, registerBarbershopRoutes };
