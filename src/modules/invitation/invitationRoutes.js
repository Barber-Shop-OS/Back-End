// BE-22: rotas públicas de convite (/api/invitations) e de gestão (registradas em /api/branch).
const express = require('express');
const authMiddleware = require('../../middlewares/authMiddleware');
const optionalAuthMiddleware = require('../../middlewares/optionalAuthMiddleware');
const roleMiddleware = require('../../middlewares/roleMiddleware');
const { authLimiter } = require('../../middlewares/rateLimitMiddleware');
const validate = require('../../middlewares/validate');
const { Joi, id, text, email, password, idParams } = require('../../shared/schemas');
const { handle } = require('../branchSchedule/branchScheduleController');
const { success, created, noContent } = require('../../utils/responseHandler');
const service = require('./invitationService');

const tokenParams = Joi.object({ token: Joi.string().trim().min(20).max(100).required() });
const invitationParams = Joi.object({ id: id().required(), invitationId: id().required() });

const schemas = {
  create: validate({ params: idParams, body: Joi.object({ email: email().required(), display_name: text(120).allow('', null) }) }),
  list: validate({ params: idParams }),
  manage: validate({ params: invitationParams }),
  preview: validate({ params: tokenParams }),
  accept: validate({ params: tokenParams, body: Joi.object({ name: text(120), password: password() }) }),
};

const owner = [authMiddleware, roleMiddleware(['admin', 'owner'])];

/**
 * @swagger
 * /branch/{id}/invitations:
 *   get:
 *     summary: Convites da filial (dono)
 *     tags: [Branch]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Lista com status pending|accepted|revoked|expired }
 *   post:
 *     summary: Convidar barbeiro por e-mail (link de 7 dias, uso único)
 *     tags: [Branch]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example: { email: novo@barbeiro.com, display_name: Zé }
 *     responses:
 *       201: { description: Convite enviado }
 *       402: { description: Limite de barbeiros do plano (PLAN_LIMIT_REACHED) }
 *       403: { description: Filial de outro tenant }
 *       409: { description: Já é barbeiro da filial }
 * /branch/{id}/invitations/{invitationId}/resend:
 *   post:
 *     summary: Reenviar convite (novo link e novo prazo)
 *     tags: [Branch]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *       - { in: path, name: invitationId, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Reenviado }
 *       410: { description: Já aceito ou revogado }
 * /branch/{id}/invitations/{invitationId}:
 *   delete:
 *     summary: Revogar convite
 *     tags: [Branch]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *       - { in: path, name: invitationId, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: Revogado }
 */
const registerBranchRoutes = (router) => {
  router.get('/:id/invitations', ...owner, schemas.list, handle(async (req, res) => success(res, { items: await service.list(req.params.id, req.user) })));
  router.post(
    '/:id/invitations',
    ...owner,
    schemas.create,
    handle(async (req, res) => created(res, { message: 'Convite enviado', invitation: await service.create(req.params.id, req.body, req.user) }))
  );
  router.post(
    '/:id/invitations/:invitationId/resend',
    ...owner,
    schemas.manage,
    handle(async (req, res) =>
      success(res, { message: 'Convite reenviado', invitation: await service.resend(req.params.id, req.params.invitationId, req.user) })
    )
  );
  router.delete(
    '/:id/invitations/:invitationId',
    ...owner,
    schemas.manage,
    handle(async (req, res) => {
      await service.revoke(req.params.id, req.params.invitationId, req.user);
      return noContent(res);
    })
  );
};

const router = express.Router();

/**
 * @swagger
 * /invitations/{token}:
 *   get:
 *     summary: Dados do convite para a tela de aceite (público)
 *     tags: [Auth]
 *     security: []
 *     parameters:
 *       - { in: path, name: token, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Barbearia, filial, e-mail e se já existe conta }
 *       404: { description: Token inexistente }
 *       410: { description: Expirado, usado ou revogado (INVITATION_GONE) }
 * /invitations/{token}/accept:
 *   post:
 *     summary: Aceitar convite
 *     description: Logado com o mesmo e-mail do convite, ou sem login informando name + password para criar a conta.
 *     tags: [Auth]
 *     security: []
 *     parameters:
 *       - { in: path, name: token, required: true, schema: { type: string } }
 *     requestBody:
 *       content:
 *         application/json:
 *           example: { name: José Souza, password: Tesoura#Navalha9 }
 *     responses:
 *       200: { description: Barbeiro vinculado (token incluso quando a conta foi criada agora) }
 *       401: { description: Conta já existe — faça login (LOGIN_REQUIRED) }
 *       403: { description: Logado com e-mail diferente do convite }
 *       410: { description: Expirado, usado ou revogado }
 */
router.get('/:token', schemas.preview, handle(async (req, res) => success(res, await service.preview(req.params.token))));
router.post(
  '/:token/accept',
  authLimiter,
  optionalAuthMiddleware,
  schemas.accept,
  handle(async (req, res) => success(res, { message: 'Convite aceito', ...(await service.accept(req.params.token, req.body, req.user)) }))
);

module.exports = router;
module.exports.registerBranchRoutes = registerBranchRoutes;
