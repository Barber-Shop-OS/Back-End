// Auth routes for registration, login, and current user profile.
const express = require('express');
const authController = require('./authController');
const authMiddleware = require('../../middlewares/authMiddleware');
const { authLimiter, emailIpLimiter, emailTargetLimiter } = require('../../middlewares/rateLimitMiddleware');
const passwordResetService = require('./passwordResetService');
const emailVerificationService = require('./emailVerificationService');
const googleAuthService = require('./googleAuthService');
const schemas = require('./authSchemas');

const router = express.Router();

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Cadastrar um novo usuário no sistema
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password]
 *             properties:
 *               name:
 *                 type: string
 *                 example: Carlos Silva
 *               email:
 *                 type: string
 *                 example: carlos@barber.com
 *               password:
 *                 type: string
 *                 minLength: 6
 *                 example: senha123
 *     responses:
 *       201:
 *         description: Usuário cadastrado com sucesso
 *         content:
 *           application/json:
 *             example:
 *               message: Usuário cadastrado com sucesso
 *               user:
 *                 id: 1
 *                 name: Carlos Silva
 *                 email: carlos@barber.com
 *                 role: cliente
 *       400:
 *         description: Dados inválidos para cadastro
 *         content:
 *           application/json:
 *             example:
 *               message: Senha deve ter no mínimo 6 caracteres
 *       409:
 *         description: E-mail já cadastrado
 *         content:
 *           application/json:
 *             example:
 *               message: E-mail já está em uso
 */
router.post('/register', authLimiter, schemas.register, authController.register);

/**
 * @swagger
 * /auth/register-owner:
 *   post:
 *     summary: Cadastro do dono — cria usuário owner, barbearia (slug) e assinatura em trial de 14 dias
 *     description: Tudo em uma transação. A filial é criada no passo seguinte do wizard (POST /branch).
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example:
 *             name: Carlos Silva
 *             email: carlos@navalha.com
 *             password: Tesoura#Navalha9
 *             phone: '(11) 99999-0000'
 *             barbershop: { name: Navalha de Ouro }
 *             plan_code: profissional
 *     responses:
 *       201: { description: 'Conta criada: token, user, barbershop, subscription' }
 *       400: { description: Dados inválidos ou senha fraca }
 *       409: { description: E-mail (EMAIL_IN_USE) ou slug (SLUG_TAKEN) em uso }
 */
router.post('/register-owner', authLimiter, schemas.registerOwner, authController.registerOwner);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Autenticar usuário e obter token JWT
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 example: carlos@barber.com
 *               password:
 *                 type: string
 *                 example: senha123
 *     responses:
 *       200:
 *         description: Login realizado com sucesso
 *         content:
 *           application/json:
 *             example:
 *               message: Login realizado com sucesso
 *               token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *               user:
 *                 id: 1
 *                 name: Carlos Silva
 *                 email: carlos@barber.com
 *                 role: cliente
 *       400:
 *         description: Campos obrigatórios ausentes
 *         content:
 *           application/json:
 *             example:
 *               message: E-mail e senha são obrigatórios
 *       401:
 *         description: Credenciais inválidas
 *         content:
 *           application/json:
 *             example:
 *               message: Credenciais inválidas
 */
router.post('/login', authLimiter, schemas.login, authController.login);

/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: Obter dados do usuário autenticado
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dados do usuário retornados com sucesso
 *         content:
 *           application/json:
 *             example:
 *               id: 1
 *               name: Carlos Silva
 *               email: carlos@barber.com
 *               role: cliente
 *       401:
 *         description: Token ausente, inválido ou expirado
 *         content:
 *           application/json:
 *             example:
 *               message: Token inválido ou expirado
 *       404:
 *         description: Usuário não encontrado
 *         content:
 *           application/json:
 *             example:
 *               message: Usuário não encontrado
 */
router.get('/me', authMiddleware, authController.getMe);

/**
 * @swagger
 * /auth/forgot-password:
 *   post:
 *     summary: Pede o link de redefinição de senha (resposta sempre igual)
 *     description: Sempre 202 com mensagem neutra, exista ou não a conta. Link de uso único, válido por 1 h. Limite por IP e por e-mail.
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, required: [email], properties: { email: { type: string } } }
 *     responses:
 *       202: { description: "{ message }" }
 *       429: { description: RATE_LIMITED }
 * /auth/reset-password:
 *   post:
 *     summary: Redefine a senha com o token do e-mail
 *     description: Derruba todas as sessões (token_version) e invalida outros links pendentes.
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, password]
 *             properties: { token: { type: string }, password: { type: string, minLength: 8 } }
 *     responses:
 *       200: { description: Senha redefinida }
 *       400: { description: Senha fraca (WEAK_PASSWORD) }
 *       410: { description: TOKEN_INVALID_OR_EXPIRED (inexistente, expirado ou já usado) }
 */
router.post('/forgot-password', emailIpLimiter, schemas.forgotPassword, emailTargetLimiter, async (req, res, next) => {
  try {
    return res.status(202).json(await passwordResetService.forgotPassword(req.body.email));
  } catch (error) {
    return next(error);
  }
});
router.post('/reset-password', authLimiter, schemas.resetPassword, async (req, res, next) => {
  try {
    return res.status(200).json(await passwordResetService.resetPassword(req.body));
  } catch (error) {
    return next(error);
  }
});

/**
 * @swagger
 * /auth/verify-email:
 *   post:
 *     summary: Confirma o e-mail com o token do link
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, required: [token], properties: { token: { type: string } } }
 *     responses:
 *       200: { description: "{ message, email_verified_at }" }
 *       410: { description: TOKEN_INVALID_OR_EXPIRED — oferecer reenviar (POST /auth/resend-verification) }
 * /auth/resend-verification:
 *   post:
 *     summary: Reenvia o link de confirmação de e-mail (usuário logado)
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       202: { description: "{ already_verified, message }" }
 *       429: { description: RATE_LIMITED }
 */
router.post('/verify-email', authLimiter, schemas.verifyEmail, async (req, res, next) => {
  try {
    return res.status(200).json(await emailVerificationService.verify(req.body.token));
  } catch (error) {
    return next(error);
  }
});
router.post('/resend-verification', emailIpLimiter, authMiddleware, emailTargetLimiter, async (req, res, next) => {
  try {
    return res.status(202).json(await emailVerificationService.resend(req.user.id));
  } catch (error) {
    return next(error);
  }
});

/**
 * @swagger
 * /auth/google:
 *   post:
 *     summary: Entrar ou cadastrar com Google (ID token do Google Identity Services)
 *     description: >
 *       Valida o id_token (audience = GOOGLE_CLIENT_ID, e-mail verificado). Conta existente com o mesmo
 *       e-mail é vinculada. intent=login/signup-client cria conta de cliente se não existir;
 *       signup-owner exige barbershop.name e phone e cria dono + barbearia + trial.
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [id_token]
 *             properties:
 *               id_token: { type: string }
 *               intent: { type: string, enum: [login, signup-owner, signup-client] }
 *               phone: { type: string }
 *               barbershop: { type: object, properties: { name: { type: string }, slug: { type: string } } }
 *               plan_code: { type: string, enum: [essencial, profissional, rede] }
 *     responses:
 *       200: { description: "{ token, user, created }" }
 *       201: { description: "Conta criada: { token, user, created: true, barbershop?, subscription? }" }
 *       401: { description: GOOGLE_TOKEN_INVALID (assinatura, audience, expirado ou e-mail não verificado) }
 *       409: { description: EMAIL_IN_USE (cadastro de dono com e-mail de conta existente) }
 *       503: { description: GOOGLE_LOGIN_UNAVAILABLE (GOOGLE_CLIENT_ID ausente) }
 */
router.post('/google', authLimiter, schemas.google, async (req, res, next) => {
  try {
    const result = await googleAuthService.authenticate(req.body);
    return res.status(result.created ? 201 : 200).json(result);
  } catch (error) {
    return next(error);
  }
});

/**
 * @swagger
 * /auth/confirm-email-change:
 *   post:
 *     summary: Confirma a troca de e-mail com o token enviado ao novo endereço
 *     description: Troca o e-mail, marca como verificado, derruba as sessões e avisa o e-mail antigo.
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, required: [token], properties: { token: { type: string } } }
 *     responses:
 *       200: { description: E-mail alterado }
 *       409: { description: EMAIL_IN_USE (alguém cadastrou o e-mail nesse meio-tempo) }
 *       410: { description: TOKEN_INVALID_OR_EXPIRED }
 */
router.post('/confirm-email-change', authLimiter, schemas.verifyEmail, async (req, res, next) => {
  try {
    return res.status(200).json(await require('../me/accountSecurityService').confirmEmailChange(req.body.token));
  } catch (error) {
    return next(error);
  }
});

module.exports = router;