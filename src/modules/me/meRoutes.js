// BE-20: /api/me — perfil, barbearias que gerencio e meus agendamentos.
const express = require('express');
const authMiddleware = require('../../middlewares/authMiddleware');
const validate = require('../../middlewares/validate');
const { Joi, pagination, email, password } = require('../../shared/schemas');
const { authLimiter, emailTargetLimiter } = require('../../middlewares/rateLimitMiddleware');
const accountSecurityService = require('./accountSecurityService');
const sessionService = require('../auth/sessionService');
const privacyService = require('./privacyService');
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

/**
 * @swagger
 * /me/password:
 *   post:
 *     summary: Trocar minha senha
 *     description: Derruba as outras sessões e devolve um token novo para esta. Conta só-Google pode definir a primeira senha sem current_password.
 *     tags: [Me]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [new_password]
 *             properties: { current_password: { type: string }, new_password: { type: string, minLength: 8 } }
 *     responses:
 *       200: { description: "{ message, token }" }
 *       400: { description: INVALID_CURRENT_PASSWORD / WEAK_PASSWORD }
 * /me/email:
 *   post:
 *     summary: Pedir troca de e-mail (confirmação pelo novo endereço)
 *     tags: [Me]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [new_email, password]
 *             properties: { new_email: { type: string }, password: { type: string } }
 *     responses:
 *       202: { description: Link enviado ao novo e-mail; aviso ao antigo }
 *       400: { description: INVALID_CURRENT_PASSWORD / PASSWORD_REQUIRED }
 *       409: { description: EMAIL_IN_USE }
 */
router.post(
  '/password',
  authLimiter,
  validate({ body: Joi.object({ current_password: Joi.string().max(72), new_password: password().required() }) }),
  handle(async (req, res) => {
    const { user, ...result } = await accountSecurityService.changePassword(req.user.id, req.body);
    // BE-30: as outras sessões caem (token_version); esta recebe refresh novo.
    return success(res, { ...result, ...(await sessionService.start(req, res, user)) });
  })
);
router.post(
  '/email',
  authLimiter,
  emailTargetLimiter,
  validate({ body: Joi.object({ new_email: email().required(), password: Joi.string().max(72).required() }) }),
  handle(async (req, res) => success(res, await accountSecurityService.requestEmailChange(req.user.id, req.body), 202))
);

/**
 * @swagger
 * /me/sessions:
 *   get:
 *     summary: Minhas sessões ativas (dispositivos)
 *     tags: [Me]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: "{ items: [{ id, user_agent, ip, last_used_at, expires_at, current }] }" }
 * /me/sessions/{id}:
 *   delete:
 *     summary: Encerrar uma sessão (dispositivo)
 *     tags: [Me]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       204: { description: Encerrada }
 *       404: { description: Sessão não encontrada }
 */
router.get('/sessions', handle(async (req, res) => success(res, { items: await sessionService.listSessions(req.user.id, req) })));
router.delete(
  '/sessions/:id',
  validate({ params: Joi.object({ id: Joi.string().guid().required() }) }),
  handle(async (req, res) => {
    await sessionService.revokeSession(req.user.id, req.params.id);
    return res.status(204).end();
  })
);

/**
 * @swagger
 * /me/export:
 *   get:
 *     summary: Exportar meus dados (LGPD)
 *     description: Perfil, contas vinculadas, agendamentos com pagamentos, barbearias, fichas de cliente e perfis de barbeiro.
 *     tags: [Me]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: JSON com todos os dados pessoais }
 * /me/delete:
 *   post:
 *     summary: Excluir minha conta (LGPD) — alias de DELETE /me para clientes HTTP sem corpo em DELETE
 *     tags: [Me]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Conta excluída (anonimizada) }
 */
router.get(
  '/export',
  handle(async (req, res) => {
    res.set('Content-Disposition', 'attachment; filename="barberos-meus-dados.json"');
    return success(res, await privacyService.exportData(req.user.id));
  })
);
const deleteAccount = handle(async (req, res) => {
  const result = await privacyService.deleteAccount(req.user.id, req.body || {});
  res.clearCookie(sessionService.COOKIE_NAME, { path: '/api/auth' });
  return success(res, result);
});
const deleteSchema = validate({ body: Joi.object({ password: Joi.string().max(72) }) });
/**
 * @swagger
 * /me:
 *   delete:
 *     summary: Excluir minha conta (LGPD)
 *     description: >
 *       Anonimiza nome/e-mail/telefone, remove sessões e vínculos, mantém agendamentos e pagamentos sem
 *       dados pessoais. Exige a senha (conta só-Google não precisa). Dono com assinatura vigente → 409
 *       ACTIVE_SUBSCRIPTION (cancele antes).
 *     tags: [Me]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, properties: { password: { type: string } } }
 *     responses:
 *       200: { description: Conta excluída }
 *       400: { description: INVALID_CURRENT_PASSWORD }
 *       409: { description: ACTIVE_SUBSCRIPTION }
 */
router.delete('/', authLimiter, deleteSchema, deleteAccount);
router.post('/delete', authLimiter, deleteSchema, deleteAccount);

module.exports = router;
