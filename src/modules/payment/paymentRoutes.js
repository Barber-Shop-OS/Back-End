// Payment routes for appointment payment management.
const express = require('express');
const paymentController = require('./paymentController');
const authMiddleware = require('../../middlewares/authMiddleware');
const roleMiddleware = require('../../middlewares/roleMiddleware');
const validatePaymentPayload = require('../../middlewares/validators/validatePaymentPayload');
const { paymentLimiter } = require('../../middlewares/rateLimitMiddleware');

const router = express.Router();

/**
 * @swagger
 * /payment:
 *   post:
 *     summary: Registrar pagamento para um agendamento
 *     tags: [Payment]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [appointment_id, amount, method]
 *             properties:
 *               appointment_id:
 *                 type: integer
 *                 example: 1
 *               amount:
 *                 type: number
 *                 example: 80
 *               method:
 *                 type: string
 *                 enum: [PIX, CASH]
 *                 example: PIX
 *     responses:
 *       201:
 *         description: Pagamento registrado com sucesso
 *       400:
 *         description: Dados de pagamento inválidos
 *       401:
 *         description: Usuário não autenticado
 *       404:
 *         description: Agendamento não encontrado
 *       409:
 *         description: Pagamento já registrado para o agendamento
 */
router.post('/', paymentLimiter, authMiddleware, validatePaymentPayload, paymentController.create);

/**
 * @swagger
 * /payment/appointment/{appointment_id}:
 *   get:
 *     summary: Obter pagamento por ID de agendamento
 *     tags: [Payment]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: appointment_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do agendamento
 *     responses:
 *       200:
 *         description: Pagamento encontrado com sucesso
 *       401:
 *         description: Usuário não autenticado
 *       404:
 *         description: Pagamento não encontrado para o agendamento
 */
router.get('/appointment/:appointment_id', authMiddleware, paymentController.getByAppointment);

/**
 * @swagger
 * /payment/{id}:
 *   get:
 *     summary: Obter pagamento por ID
 *     tags: [Payment]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do pagamento
 *     responses:
 *       200:
 *         description: Pagamento encontrado com sucesso
 *       401:
 *         description: Usuário não autenticado
 *       404:
 *         description: Pagamento não encontrado
 */
router.get('/:id', authMiddleware, paymentController.getById);

/**
 * @swagger
 * /payment/{id}/status:
 *   put:
 *     summary: Atualizar status de um pagamento
 *     tags: [Payment]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do pagamento
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
 *                 enum: [PAID, FAILED]
 *                 example: PAID
 *     responses:
 *       200:
 *         description: Status do pagamento atualizado com sucesso
 *       400:
 *         description: Status inválido
 *       401:
 *         description: Usuário não autenticado
 *       403:
 *         description: Sem permissão para atualizar pagamento
 *       404:
 *         description: Pagamento não encontrado
 */
router.put('/:id/status', paymentLimiter, authMiddleware, roleMiddleware(['admin', 'owner', 'barbeiro']), paymentController.updateStatus);

module.exports = router;