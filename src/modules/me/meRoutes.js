// BE-20: /api/me — perfil, barbearias que gerencio e meus agendamentos.
const express = require('express');
const authMiddleware = require('../../middlewares/authMiddleware');
const validate = require('../../middlewares/validate');
const { Joi, pagination } = require('../../shared/schemas');
const { handle } = require('../branchSchedule/branchScheduleController');
const { success } = require('../../utils/responseHandler');
const meService = require('./meService');

const router = express.Router();
router.use(authMiddleware);

const schemas = {
  patch: validate({ body: Joi.object().min(1) }),
  appointments: validate({ query: Joi.object({ ...pagination, scope: Joi.string().valid('upcoming', 'past').default('upcoming') }) }),
};

/**
 * @swagger
 * /me:
 *   get:
 *     summary: Meu perfil, papéis, barbearias que gerencio e perfis de barbeiro
 *     tags: [Me]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Perfil }
 *       401: { description: Não autenticado }
 *   patch:
 *     summary: Atualizar meu perfil (name, phone)
 *     description: E-mail e senha têm fluxos próprios (BE-29). Outros campos → 400.
 *     tags: [Me]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example: { name: Maria, phone: '(11) 99999-0000' }
 *     responses:
 *       200: { description: Perfil atualizado }
 *       400: { description: Campo não permitido }
 * /me/barbershops:
 *   get:
 *     summary: Barbearias que gerencio
 *     tags: [Me]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Lista }
 * /me/appointments:
 *   get:
 *     summary: Meus agendamentos (como cliente)
 *     tags: [Me]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: query, name: scope, schema: { type: string, enum: [upcoming, past], default: upcoming } }
 *       - { in: query, name: page, schema: { type: integer } }
 *       - { in: query, name: pageSize, schema: { type: integer, maximum: 100 } }
 *     responses:
 *       200: { description: Lista paginada }
 */
router.get('/', handle(async (req, res) => success(res, await meService.getMe(req.user.id))));
router.patch(
  '/',
  schemas.patch,
  handle(async (req, res) => success(res, { message: 'Perfil atualizado', user: await meService.updateMe(req.user.id, req.body, req.user) }))
);
router.get('/barbershops', handle(async (req, res) => success(res, { items: await meService.listBarbershops(req.user.id) })));
router.get(
  '/appointments',
  schemas.appointments,
  handle(async (req, res) => success(res, await meService.listAppointments(req.user.id, req.query, req.user)))
);

module.exports = router;
