// BE-36: GET /api/audit-logs — trilha de auditoria (dono da barbearia ou admin).
const express = require('express');
const authMiddleware = require('../../middlewares/authMiddleware');
const roleMiddleware = require('../../middlewares/roleMiddleware');
const validate = require('../../middlewares/validate');
const { Joi, id, text, isoDate, pagination } = require('../../shared/schemas');
const { handle } = require('../branchSchedule/branchScheduleController');
const { success } = require('../../utils/responseHandler');
const auditService = require('./auditService');

const router = express.Router();

/**
 * @swagger
 * /audit-logs:
 *   get:
 *     summary: Trilha de auditoria (exclusões, troca de papel, preço, assinatura, pagamentos)
 *     description: Dono informa barbershop_id (a própria); admin pode omitir para ver tudo.
 *     tags: [Audit]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: query, name: barbershop_id, schema: { type: integer } }
 *       - { in: query, name: entity, schema: { type: string, example: service } }
 *       - { in: query, name: action, schema: { type: string, example: service.updated } }
 *       - { in: query, name: from, schema: { type: string, format: date-time } }
 *       - { in: query, name: to, schema: { type: string, format: date-time } }
 *       - { in: query, name: page, schema: { type: integer } }
 *       - { in: query, name: pageSize, schema: { type: integer, maximum: 100 } }
 *     responses:
 *       200: { description: "{ items: [{ action, entity, entity_id, before, after, actor, ip, request_id, created_at }], page, pageSize, total, totalPages }" }
 *       400: { description: barbershop_id obrigatório para dono }
 *       403: { description: Barbearia de outro dono }
 */
router.get(
  '/',
  authMiddleware,
  roleMiddleware(['admin', 'owner']),
  validate({
    query: Joi.object({ ...pagination, barbershop_id: id(), entity: text(40), action: text(60), from: isoDate(), to: isoDate() }),
  }),
  handle(async (req, res) => success(res, await auditService.list(req.query, req.user)))
);

module.exports = router;
