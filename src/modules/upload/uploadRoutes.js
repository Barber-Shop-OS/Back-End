// BE-34: /api/uploads — URL pré-assinada para o R2 e confirmação do envio.
const express = require('express');
const authMiddleware = require('../../middlewares/authMiddleware');
const roleMiddleware = require('../../middlewares/roleMiddleware');
const validate = require('../../middlewares/validate');
const { Joi, id } = require('../../shared/schemas');
const { handle } = require('../branchSchedule/branchScheduleController');
const { success, created } = require('../../utils/responseHandler');
const uploadService = require('./uploadService');

const router = express.Router();
const staff = [authMiddleware, roleMiddleware(['admin', 'owner'])];

/**
 * @swagger
 * /uploads/presign:
 *   post:
 *     summary: URL pré-assinada (PUT, 5 min) para enviar logo, capa ou foto de barbeiro direto ao R2
 *     description: >
 *       Só JPEG, PNG ou WebP (SVG/HTML recusados), até 2 MB. Envie o arquivo com PUT na upload_url
 *       usando exatamente o Content-Type informado e depois chame /uploads/confirm.
 *     tags: [Uploads]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [kind, content_type, size]
 *             properties:
 *               kind: { type: string, enum: [logo, cover, barber_photo] }
 *               content_type: { type: string, enum: [image/jpeg, image/png, image/webp] }
 *               size: { type: integer, maximum: 2097152 }
 *               barbershop_id: { type: integer, description: logo/capa }
 *               barber_id: { type: integer, description: foto de barbeiro }
 *     responses:
 *       201: { description: "{ upload_id, upload_url, method, headers, expires_in }" }
 *       400: { description: INVALID_FILE (tipo/tamanho) }
 *       403: { description: Outro tenant }
 *       503: { description: UPLOADS_UNAVAILABLE }
 * /uploads/confirm:
 *   post:
 *     summary: Confirma o envio (confere tamanho, tipo e magic bytes) e grava a URL
 *     tags: [Uploads]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, required: [upload_id], properties: { upload_id: { type: integer } } }
 *     responses:
 *       200: { description: "{ url, kind, target_id }" }
 *       400: { description: INVALID_FILE (arquivo apagado) }
 *       409: { description: Já processado }
 */
router.post(
  '/presign',
  ...staff,
  validate({
    body: Joi.object({
      kind: Joi.string().valid('logo', 'cover', 'barber_photo').required(),
      content_type: Joi.string().max(60).required(),
      size: Joi.number().integer().positive().required(),
      barbershop_id: id(),
      barber_id: id(),
    }),
  }),
  handle(async (req, res) => created(res, await uploadService.presign(req.body, req.user)))
);
router.post(
  '/confirm',
  ...staff,
  validate({ body: Joi.object({ upload_id: id().required() }) }),
  handle(async (req, res) => success(res, await uploadService.confirm(req.body, req.user)))
);

module.exports = router;
