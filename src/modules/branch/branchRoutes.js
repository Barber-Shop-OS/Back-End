// Branch routes with combined branch and address management.
const express = require('express');
const branchController = require('./branchController');
const authMiddleware = require('../../middlewares/authMiddleware');
const roleMiddleware = require('../../middlewares/roleMiddleware');

const schemas = require('./branchSchemas');
const barberController = require('../barber/barberController');
const barberSchemas = require('../barber/barberSchemas');

const router = express.Router();

/**
 * @swagger
 * /branch:
 *   get:
 *     summary: Listar filiais com paginação e filtros
 *     tags: [Branch]
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
 *         description: Quantidade por página
 *       - in: query
 *         name: barbershop_id
 *         schema:
 *           type: integer
 *         description: ID da barbearia
 *     responses:
 *       200:
 *         description: Lista de filiais retornada com sucesso
 */
router.get('/', schemas.list, branchController.getAll);

/**
 * @swagger
 * /branch/{id}:
 *   get:
 *     summary: Obter filial por ID
 *     tags: [Branch]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID da filial
 *     responses:
 *       200:
 *         description: Filial encontrada
 *       404:
 *         description: Filial não encontrada
 */
router.get('/:id', schemas.byId, branchController.getById);

/**
 * @swagger
 * /branch:
 *   post:
 *     summary: Criar filial com dados de endereço
 *     tags: [Branch]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, barbershop_id, cep, number, city, state]
 *             properties:
 *               name:
 *                 type: string
 *                 example: Unidade Centro
 *               barbershop_id:
 *                 type: integer
 *                 example: 1
 *               cep:
 *                 type: string
 *                 example: 01001000
 *               number:
 *                 type: integer
 *                 example: 100
 *               complement:
 *                 type: string
 *                 example: Sala 2
 *               city:
 *                 type: string
 *                 example: São Paulo
 *               state:
 *                 type: string
 *                 example: SP
 *     responses:
 *       201:
 *         description: Filial criada com sucesso
 *       400:
 *         description: Dados inválidos
 *       401:
 *         description: Usuário não autenticado
 *       403:
 *         description: Sem permissão para gerenciar esta filial
 *       404:
 *         description: Barbearia não encontrada
 */
router.post('/', authMiddleware, roleMiddleware(['admin', 'owner']), schemas.create, branchController.create);

/**
 * @swagger
 * /branch/{id}:
 *   put:
 *     summary: Atualizar filial e endereço vinculado
 *     tags: [Branch]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID da filial
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: Unidade Centro Premium
 *               cep:
 *                 type: string
 *                 example: 01001000
 *               number:
 *                 type: integer
 *                 example: 120
 *               city:
 *                 type: string
 *                 example: São Paulo
 *               state:
 *                 type: string
 *                 example: SP
 *     responses:
 *       200:
 *         description: Filial atualizada com sucesso
 *       401:
 *         description: Usuário não autenticado
 *       403:
 *         description: Sem permissão para gerenciar esta filial
 *       404:
 *         description: Filial não encontrada
 */
router.put('/:id', authMiddleware, roleMiddleware(['admin', 'owner']), schemas.update, branchController.update);

/**
 * @swagger
 * /branch/{id}:
 *   delete:
 *     summary: Remover filial por ID
 *     tags: [Branch]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID da filial
 *     responses:
 *       200:
 *         description: Filial removida com sucesso
 *       401:
 *         description: Usuário não autenticado
 *       403:
 *         description: Sem permissão para remover filial
 *       404:
 *         description: Filial não encontrada
 */
router.delete('/:id', authMiddleware, roleMiddleware(['admin', 'owner']), schemas.byId, branchController.remove);

/**
 * @swagger
 * /branch/{id}/barbers:
 *   post:
 *     summary: Adicionar barbeiro à filial (por user_id ou e-mail)
 *     description: Se o e-mail não tiver conta, um convite é criado (202). Usuário cliente é promovido a barbeiro.
 *     tags: [Branch]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               user_id: { type: integer }
 *               email: { type: string, format: email }
 *               display_name: { type: string }
 *               bio: { type: string }
 *     responses:
 *       201: { description: Barbeiro criado }
 *       202: { description: Convite enviado }
 *       403: { description: Filial de outro tenant }
 *       404: { description: Filial ou usuário não encontrado }
 *       409: { description: Usuário já é barbeiro desta filial (BARBER_ALREADY_EXISTS) }
 */
router.post('/:id/barbers', authMiddleware, roleMiddleware(['admin', 'owner']), barberSchemas.createInBranch, barberController.createInBranch);

module.exports = router;