// BE-32: /api/billing — assinatura do SaaS na AbacatePay (dono da barbearia ou admin).
const express = require('express');
const authMiddleware = require('../../middlewares/authMiddleware');
const roleMiddleware = require('../../middlewares/roleMiddleware');
const validate = require('../../middlewares/validate');
const { Joi, id, text } = require('../../shared/schemas');
const { PLAN_CODES } = require('../../shared/plans');
const { handle } = require('../branchSchedule/branchScheduleController');
const { success, created } = require('../../utils/responseHandler');
const { paymentLimiter } = require('../../middlewares/rateLimitMiddleware');
const billingService = require('./billingService');

const router = express.Router();
const owner = [paymentLimiter, authMiddleware, roleMiddleware(['admin', 'owner'])];
const shop = { barbershop_id: id().required() };
const planCode = Joi.string().valid(...PLAN_CODES).required();

/**
 * @swagger
 * /billing/checkout:
 *   post:
 *     summary: Gera o checkout da assinatura na AbacatePay e devolve a URL de pagamento
 *     description: >
 *       Cria/reusa o customer (CPF/CNPJ obrigatório, dígitos validados) e o checkout com
 *       externalId barbershop-<id>. A assinatura só fica ativa quando o webhook da AbacatePay
 *       confirmar o pagamento (BE-33) — o retorno do navegador nunca ativa nada.
 *     tags: [Billing]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [barbershop_id, plan_code, tax_id]
 *             properties:
 *               barbershop_id: { type: integer, example: 1 }
 *               plan_code: { type: string, enum: [essencial, profissional, rede] }
 *               tax_id: { type: string, example: '111.444.777-35', description: CPF ou CNPJ }
 *               cellphone: { type: string, example: '11999999999' }
 *     responses:
 *       201: { description: "{ checkout_url, checkout_id, subscription }" }
 *       400: { description: VALIDATION_ERROR / INVALID_TAX_ID }
 *       403: { description: Barbearia de outro dono }
 *       409: { description: SUBSCRIPTION_ALREADY_ACTIVE / PLAN_LIMIT_EXCEEDED }
 *       502: { description: PAYMENT_PROVIDER_ERROR }
 *       503: { description: BILLING_UNAVAILABLE (integração não configurada) }
 */
router.post(
  '/checkout',
  ...owner,
  validate({ body: Joi.object({ ...shop, plan_code: planCode, tax_id: text(20).required(), cellphone: text(20) }) }),
  handle(async (req, res) => created(res, await billingService.checkout(req.body, req.user)))
);

/**
 * @swagger
 * /billing/change-plan:
 *   post:
 *     summary: Troca de plano (vale a partir do próximo ciclo)
 *     description: Downgrade bloqueado se o uso atual excede o plano novo (409 PLAN_LIMIT_EXCEEDED com details.exceeded).
 *     tags: [Billing]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [barbershop_id, plan_code]
 *             properties:
 *               barbershop_id: { type: integer }
 *               plan_code: { type: string, enum: [essencial, profissional, rede] }
 *     responses:
 *       200: { description: "{ subscription, effective_at }" }
 *       409: { description: NO_ACTIVE_SUBSCRIPTION / SAME_PLAN / PLAN_LIMIT_EXCEEDED }
 */
router.post(
  '/change-plan',
  ...owner,
  validate({ body: Joi.object({ ...shop, plan_code: planCode }) }),
  handle(async (req, res) => success(res, await billingService.changePlan(req.body, req.user)))
);

/**
 * @swagger
 * /billing/cancel:
 *   post:
 *     summary: Cancela ao fim do período pago (cancel_at_period_end)
 *     tags: [Billing]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, required: [barbershop_id], properties: { barbershop_id: { type: integer } } }
 *     responses:
 *       200: { description: "{ subscription }" }
 *       409: { description: NO_ACTIVE_SUBSCRIPTION }
 * /billing/resume:
 *   post:
 *     summary: Desfaz o cancelamento agendado
 *     tags: [Billing]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, required: [barbershop_id], properties: { barbershop_id: { type: integer } } }
 *     responses:
 *       200: { description: "{ subscription }" }
 * /billing/portal:
 *   post:
 *     summary: Link do portal do cliente AbacatePay (cartão, recibos)
 *     tags: [Billing]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, required: [barbershop_id], properties: { barbershop_id: { type: integer } } }
 *     responses:
 *       200: { description: "{ portal_url }" }
 *       409: { description: NO_ACTIVE_SUBSCRIPTION }
 */
router.post(
  '/cancel',
  ...owner,
  validate({ body: Joi.object(shop) }),
  handle(async (req, res) => success(res, await billingService.cancel(req.body, req.user)))
);
router.post(
  '/resume',
  ...owner,
  validate({ body: Joi.object(shop) }),
  handle(async (req, res) => success(res, await billingService.resume(req.body, req.user)))
);
router.post(
  '/portal',
  ...owner,
  validate({ body: Joi.object(shop) }),
  handle(async (req, res) => success(res, await billingService.portal(req.body, req.user)))
);

module.exports = router;
