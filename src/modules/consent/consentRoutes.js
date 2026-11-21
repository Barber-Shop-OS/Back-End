// BE-58: POST /api/consents/cookies — o front registra cada escolha do banner de cookies
// (aceitar, recusar, personalizar, revogar). Público; se houver token, vincula ao usuário.
const express = require('express');
const validate = require('../../middlewares/validate');
const optionalAuthMiddleware = require('../../middlewares/optionalAuthMiddleware');
const { consentLimiter } = require('../../middlewares/rateLimitMiddleware');
const { Joi } = require('../../shared/schemas');
const { handle } = require('../branchSchedule/branchScheduleController');
const consentService = require('./consentService');

const router = express.Router();

const schema = Joi.object({
  consent_id: Joi.string().guid().required(),
  policy_version: Joi.string().trim().max(20).required(),
  analytics: Joi.boolean().required(),
  marketing: Joi.boolean(),
  action: Joi.string().valid(...consentService.ACTIONS).required(),
});

/**
 * @swagger
 * /consents/cookies:
 *   post:
 *     summary: Registrar escolha do banner de cookies (LGPD)
 *     description: |
 *       Prova do consentimento (LGPD art. 8º §2º). Cada escolha é um novo registro — aceitar, recusar,
 *       personalizar ou revogar. O IP é guardado apenas como hash. Com token válido, vincula ao usuário.
 *     tags: [Privacy]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [consent_id, policy_version, analytics, action]
 *             properties:
 *               consent_id: { type: string, format: uuid, description: 'Identificador aleatório gerado no navegador' }
 *               policy_version: { type: string, example: '2026-11' }
 *               analytics: { type: boolean }
 *               marketing: { type: boolean }
 *               action: { type: string, enum: [accept_all, reject_all, custom, withdraw] }
 *     responses:
 *       201:
 *         description: Registrado
 *         content:
 *           application/json:
 *             example: { id: 12, consent_id: '7f1c...', analytics: true, marketing: false, recorded_at: '2026-11-21T18:00:00.000Z' }
 *       400: { description: Dados inválidos }
 *       429: { description: Muitas solicitações }
 */
router.post(
  '/cookies',
  consentLimiter,
  optionalAuthMiddleware,
  validate({ body: schema }),
  handle(async (req, res) => {
    const result = await consentService.record(req.body, {
      userId: req.user ? req.user.id : null,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });
    return res.status(201).json(result);
  })
);

module.exports = router;
