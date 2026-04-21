// Barber routes with public reads and protected writes.
const express = require('express');
const barberController = require('./barberController');
const authMiddleware = require('../../middlewares/authMiddleware');
const roleMiddleware = require('../../middlewares/roleMiddleware');
const { validateCreate, validateUpdate } = require('../../middlewares/validators/validateBarberPayload');

const router = express.Router();

/**
 * @swagger
 * /barber:
 *   get:
 *     summary: Listar barbeiros com filtros e paginação
 *     tags: [Barber]
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
 *     responses:
 *       200:
 *         description: Lista de barbeiros retornada com sucesso
 *         content:
 *           application/json:
 *             example:
 *               items: []
 *               page: 1
 *               pageSize: 10
 *               total: 0
 *               totalPages: 0
 */
router.get('/', barberController.getAll);

/**
 * @swagger
 * /barber/{id}:
 *   get:
 *     summary: Obter um barbeiro por ID
 *     tags: [Barber]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do barbeiro
 *     responses:
 *       200:
 *         description: Barbeiro encontrado
 *         content:
 *           application/json:
 *             example:
 *               id: 1
 *               user_id: 2
 *               branch_id: 1
 *               bio: Especialista em fade
 *       404:
 *         description: Barbeiro não encontrado
 *         content:
 *           application/json:
 *             example:
 *               message: Barbeiro não encontrado
 */
router.get('/:id', barberController.getById);

/**
 * @swagger
 * /barber:
 *   post:
 *     summary: Criar um novo barbeiro
 *     tags: [Barber]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [user_id, branch_id, bio]
 *             properties:
 *               user_id:
 *                 type: integer
 *                 example: 2
 *               branch_id:
 *                 type: integer
 *                 example: 1
 *               bio:
 *                 type: string
 *                 example: Especialista em corte social
 *     responses:
 *       201:
 *         description: Barbeiro criado com sucesso
 *         content:
 *           application/json:
 *             example:
 *               message: Barbeiro criado com sucesso
 *               barber:
 *                 id: 1
 *                 user_id: 2
 *                 branch_id: 1
 *                 bio: Especialista em corte social
 *       400:
 *         description: Dados inválidos
 *         content:
 *           application/json:
 *             example:
 *               message: Campo 'user_id' é obrigatório e deve ser um inteiro positivo
 *       401:
 *         description: Usuário não autenticado
 *       403:
 *         description: Sem permissão para criar barbeiro
 */
router.post('/', authMiddleware, roleMiddleware(['admin', 'owner']), validateCreate, barberController.create);

/**
 * @swagger
 * /barber/{id}:
 *   put:
 *     summary: Atualizar dados de um barbeiro
 *     tags: [Barber]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do barbeiro
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [branch_id, bio]
 *             properties:
 *               branch_id:
 *                 type: integer
 *                 example: 1
 *               bio:
 *                 type: string
 *                 example: Especialista em navalhado
 *     responses:
 *       200:
 *         description: Barbeiro atualizado com sucesso
 *       400:
 *         description: Dados inválidos
 *       401:
 *         description: Usuário não autenticado
 *       403:
 *         description: Sem permissão para atualizar barbeiro
 *       404:
 *         description: Barbeiro não encontrado
 */
router.put('/:id', authMiddleware, roleMiddleware(['admin', 'owner']), validateUpdate, barberController.update);

/**
 * @swagger
 * /barber/{id}:
 *   delete:
 *     summary: Remover um barbeiro por ID
 *     tags: [Barber]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do barbeiro
 *     responses:
 *       204:
 *         description: Barbeiro removido com sucesso
 *       401:
 *         description: Usuário não autenticado
 *       403:
 *         description: Sem permissão para remover barbeiro
 *       404:
 *         description: Barbeiro não encontrado
 */
router.delete('/:id', authMiddleware, roleMiddleware(['admin', 'owner']), barberController.remove);

module.exports = router;