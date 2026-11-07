// Auth routes for registration, login, and current user profile.
const express = require('express');
const authController = require('./authController');
const authMiddleware = require('../../middlewares/authMiddleware');
const { authLimiter } = require('../../middlewares/rateLimitMiddleware');
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

module.exports = router;