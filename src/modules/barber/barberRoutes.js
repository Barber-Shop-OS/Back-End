// Barber routes with public reads and protected writes.
const express = require('express');
const barberController = require('./barberController');
const authMiddleware = require('../../middlewares/authMiddleware');
const roleMiddleware = require('../../middlewares/roleMiddleware');
const schemas = require('./barberSchemas');
const barberScheduleRoutes = require('../barberSchedule/barberScheduleRoutes');

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
router.get('/', schemas.list, barberController.getAll);

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
router.get('/:id', schemas.byId, barberController.getById);

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
 *             required: [user_id, branch_id]
 *             properties:
 *               display_name:
 *                 type: string
 *               photo_url:
 *                 type: string
 *                 format: uri
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
router.post('/', authMiddleware, roleMiddleware(['admin', 'owner']), schemas.create, barberController.create);

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
router.put('/:id', authMiddleware, roleMiddleware(['admin', 'owner']), schemas.update, barberController.update);

/**
 * @swagger
 * /barber/{id}:
 *   delete:
 *     summary: Desativar um barbeiro (histórico preservado)
 *     description: Com agendamentos futuros retorna 409 BARBER_HAS_FUTURE_APPOINTMENTS, a menos que force=cancel.
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
 *       - in: query
 *         name: force
 *         schema:
 *           type: string
 *           enum: [cancel]
 *         description: Cancela os agendamentos futuros antes de desativar
 *     responses:
 *       204:
 *         description: Barbeiro desativado
 *       409:
 *         description: Barbeiro com agendamentos futuros
 *       401:
 *         description: Usuário não autenticado
 *       403:
 *         description: Sem permissão para remover barbeiro
 *       404:
 *         description: Barbeiro não encontrado
 */
router.delete('/:id', authMiddleware, roleMiddleware(['admin', 'owner']), schemas.remove, barberController.remove);

// BE-11: /:id/working-hours e /:id/time-off
barberScheduleRoutes.register(router);

module.exports = router;