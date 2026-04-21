// Appointment routes with authentication and branch-aware creation.
const express = require('express');
const appointmentController = require('./appointmentController');
const authMiddleware = require('../../middlewares/authMiddleware');
const roleMiddleware = require('../../middlewares/roleMiddleware');
const { validateCreate, validateUpdateStatus } = require('../../middlewares/validators/validateAppointmentPayload');

const router = express.Router();

/**
 * @swagger
 * /appointment:
 *   get:
 *     summary: Listar agendamentos com filtros e paginação
 *     tags: [Appointment]
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
 *         description: Quantidade por página
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Status do agendamento
 *     responses:
 *       200:
 *         description: Lista de agendamentos retornada com sucesso
 *       401:
 *         description: Usuário não autenticado
 *       403:
 *         description: Sem permissão para listar agendamentos
 */
router.get('/', authMiddleware, roleMiddleware(['admin', 'owner', 'barbeiro']), appointmentController.getAllAppointments);

/**
 * @swagger
 * /appointment/{id}:
 *   get:
 *     summary: Obter agendamento por ID
 *     tags: [Appointment]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do agendamento
 *     responses:
 *       200:
 *         description: Agendamento encontrado
 *       401:
 *         description: Usuário não autenticado
 *       404:
 *         description: Agendamento não encontrado
 */
router.get('/:id', authMiddleware, appointmentController.getAppointmentById);

/**
 * @swagger
 * /appointment:
 *   post:
 *     summary: Criar um novo agendamento
 *     tags: [Appointment]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [user_id, barber_id, service_id, branch_id, appointment_date, status]
 *             properties:
 *               user_id:
 *                 type: integer
 *                 example: 1
 *               barber_id:
 *                 type: integer
 *                 example: 1
 *               service_id:
 *                 type: integer
 *                 example: 1
 *               branch_id:
 *                 type: integer
 *                 example: 1
 *               appointment_date:
 *                 type: string
 *                 format: date-time
 *                 example: 2026-06-10T14:00:00.000Z
 *               status:
 *                 type: string
 *                 enum: [pendente, confirmado, cancelado]
 *                 example: pendente
 *     responses:
 *       201:
 *         description: Agendamento criado com sucesso
 *       400:
 *         description: Dados inválidos ou barbeiro fora da filial
 *       401:
 *         description: Usuário não autenticado
 *       404:
 *         description: Entidade relacionada não encontrada
 */
router.post('/', authMiddleware, validateCreate, appointmentController.createAppointment);

/**
 * @swagger
 * /appointment/{id}:
 *   put:
 *     summary: Atualizar status de um agendamento
 *     tags: [Appointment]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do agendamento
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [pendente, confirmado, cancelado]
 *                 example: confirmado
 *     responses:
 *       200:
 *         description: Status do agendamento atualizado com sucesso
 *       400:
 *         description: Status inválido
 *       401:
 *         description: Usuário não autenticado
 *       404:
 *         description: Agendamento não encontrado
 */
router.put('/:id', authMiddleware, validateUpdateStatus, appointmentController.updateAppointmentStatus);

/**
 * @swagger
 * /appointment/{id}:
 *   delete:
 *     summary: Remover agendamento por ID
 *     tags: [Appointment]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do agendamento
 *     responses:
 *       204:
 *         description: Agendamento removido com sucesso
 *       401:
 *         description: Usuário não autenticado
 *       404:
 *         description: Agendamento não encontrado
 */
router.delete('/:id', authMiddleware, appointmentController.deleteAppointment);

module.exports = router;