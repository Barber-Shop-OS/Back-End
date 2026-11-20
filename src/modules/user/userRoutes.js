// User routes that protect administrative operations and reuse the user module.
const express = require('express');
const userController = require('./userController');
const authMiddleware = require('../../middlewares/authMiddleware');
const roleMiddleware = require('../../middlewares/roleMiddleware');

const schemas = require('./userSchemas');

const router = express.Router();

/**
 * @swagger
 * /user:
 *   get:
 *     summary: Listar usuários com paginação e filtros
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Página atual
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *         description: Quantidade de itens por página
 *     responses:
 *       200:
 *         description: Usuários retornados com sucesso
 *         content:
 *           application/json:
 *             example:
 *               items: []
 *               page: 1
 *               pageSize: 10
 *               total: 0
 *               totalPages: 0
 *       401:
 *         description: Usuário não autenticado
 *         content:
 *           application/json:
 *             example:
 *               message: Token não fornecido
 *       403:
 *         description: Acesso restrito ao perfil admin
 *         content:
 *           application/json:
 *             example:
 *               message: "Acesso restrito. Permissão necessária: admin"
 */
router.get('/', authMiddleware, roleMiddleware(['admin']), schemas.list, userController.getAllUsers);

/**
 * @swagger
 * /user/{id}:
 *   get:
 *     summary: Obter dados de um usuário por ID
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do usuário
 *     responses:
 *       200:
 *         description: Usuário encontrado com sucesso
 *         content:
 *           application/json:
 *             example:
 *               id: 1
 *               name: Carlos Silva
 *               email: carlos@barber.com
 *               role: cliente
 *       401:
 *         description: Usuário não autenticado
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
router.get('/:id', authMiddleware, schemas.byId, userController.getUserById);

/**
 * @swagger
 * /user/{id}:
 *   put:
 *     summary: Atualizar dados do próprio usuário (ou qualquer usuário, se admin)
 *     description: >
 *       O próprio usuário altera apenas `name` e `phone`. Admin também altera `email`.
 *       `role` e `password` não são aceitos aqui (400) — papel em PATCH /admin/users/{id}/role.
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do usuário
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: Carlos Souza
 *               phone:
 *                 type: string
 *                 example: "(11) 99999-9999"
 *               email:
 *                 type: string
 *                 description: Somente admin
 *                 example: carlos.souza@barber.com
 *     responses:
 *       200:
 *         description: Usuário atualizado com sucesso
 *         content:
 *           application/json:
 *             example:
 *               message: Usuário atualizado com sucesso
 *               user:
 *                 id: 1
 *                 name: Carlos Souza
 *                 email: carlos.souza@barber.com
 *                 role: cliente
 *       400:
 *         description: Dados inválidos
 *         content:
 *           application/json:
 *             example:
 *               message: Dados inválidos
 *       401:
 *         description: Usuário não autenticado
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
router.put('/:id', authMiddleware, schemas.update, userController.updateUser);
/**
 * @swagger
 * /user/{id}:
 *   patch:
 *     summary: Atualizar usuário parcialmente (mesmas regras do PUT)
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Usuário atualizado }
 *       400: { description: Campo não permitido }
 *       401: { description: Não autenticado }
 *       404: { description: Usuário não encontrado }
 */
router.patch('/:id', authMiddleware, schemas.update, userController.updateUser);

/**
 * @swagger
 * /user/{id}:
 *   delete:
 *     summary: Remover um usuário por ID
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do usuário
 *     responses:
 *       204:
 *         description: Usuário removido com sucesso
 *       401:
 *         description: Usuário não autenticado
 *         content:
 *           application/json:
 *             example:
 *               message: Token não fornecido
 *       403:
 *         description: Acesso restrito ao perfil admin
 *         content:
 *           application/json:
 *             example:
 *               message: "Acesso restrito. Permissão necessária: admin"
 *       404:
 *         description: Usuário não encontrado
 *         content:
 *           application/json:
 *             example:
 *               message: Usuário não encontrado
 */
router.delete('/:id', authMiddleware, roleMiddleware(['admin']), schemas.byId, userController.deleteUser);

module.exports = router;