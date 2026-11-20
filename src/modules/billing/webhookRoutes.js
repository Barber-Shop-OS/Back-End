// BE-33: POST /api/webhooks/abacatepay — público, autenticado pelo segredo do webhook.
const express = require('express');
const billingWebhookService = require('./billingWebhookService');

const router = express.Router();

/**
 * @swagger
 * /webhooks/abacatepay:
 *   post:
 *     summary: Webhook v2 da AbacatePay (assinatura SaaS)
 *     description: >
 *       Autenticado por ?webhookSecret= (ou header X-Webhook-Secret) e, se configurada a chave pública,
 *       pelo header X-Webhook-Signature (HMAC-SHA256 base64 do corpo cru). Idempotente pelo `id` do
 *       evento. Responde 200 rápido e processa em background. Segredo inválido → 401 sem efeito.
 *     tags: [Billing]
 *     security: []
 *     parameters:
 *       - { in: query, name: webhookSecret, schema: { type: string } }
 *     responses:
 *       200: { description: "{ received: true, duplicate: boolean }" }
 *       400: { description: Corpo inválido }
 *       401: { description: Segredo ou assinatura inválidos }
 *       503: { description: Webhook não configurado (a AbacatePay tenta de novo) }
 */
router.post('/abacatepay', async (req, res, next) => {
  try {
    const result = await billingWebhookService.receive({
      rawBody: req.rawBody,
      secret: req.query.webhookSecret || req.get('X-Webhook-Secret'),
      signature: req.get('X-Webhook-Signature'),
    });
    return res.status(200).json({ received: true, duplicate: result.duplicate });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
