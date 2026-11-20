// Payment routes for appointment payment management.
const express = require('express');
const paymentController = require('./paymentController');
const authMiddleware = require('../../middlewares/authMiddleware');
const roleMiddleware = require('../../middlewares/roleMiddleware');
const schemas = require('./paymentSchemas');
const { paymentLimiter } = require('../../middlewares/rateLimitMiddleware');

const router = express.Router();

/**
 * @swagger
 * /payment:
 *   get:
 *     summary: Listar pagamentos (financeiro) com filtros e totais
 *     description: Dono vê as barbearias dele, barbeiro os próprios atendimentos, admin tudo. Cliente recebe 403.
 *     tags: [Payment]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: query, name: barbershop_id, schema: { type: integer } }
 *       - { in: query, name: branch_id, schema: { type: integer } }
 *       - { in: query, name: status, schema: { type: string, enum: [PENDING, PAID, FAILED] } }
 *       - { in: query, name: method, schema: { type: string, enum: [PIX, CASH, CARD] } }
 *       - { in: query, name: from, schema: { type: string, format: date-time } }
 *       - { in: query, name: to, schema: { type: string, format: date-time } }
 *       - { in: query, name: page, schema: { type: integer } }
 *       - { in: query, name: pageSize, schema: { type: integer, maximum: 100 } }
 *     responses:
 *       200:
 *         description: "{ items, page, pageSize, total, totalPages, totals: { count, amount, paid, pending, failed, paid_by_method } }"
 *       401:
 *         description: Usuário não autenticado
 *       403:
 *         description: Cliente ou barbearia de outro dono
 */
router.get('/', authMiddleware, roleMiddleware(['admin', 'owner', 'barbeiro']), schemas.list, paymentController.list);

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
 *             required: [appointment_id, method]
 *             properties:
 *               appointment_id:
 *                 type: integer
 *                 example: 1
 *               amount:
 *                 type: number
 *                 example: 80
 *                 description: Opcional; padrão = preço registrado no agendamento.
 *               method:
 *                 type: string
 *                 enum: [PIX, CASH, CARD]
 *                 example: PIX
 *               status:
 *                 type: string
 *                 enum: [PENDING, PAID]
 *                 description: PAID registra o pagamento já recebido (presencial). Padrão PENDING.
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
router.post('/', paymentLimiter, authMiddleware, schemas.create, paymentController.create);

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
router.get('/appointment/:appointment_id', authMiddleware, schemas.byAppointment, paymentController.getByAppointment);

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
router.get('/:id', authMiddleware, schemas.byId, paymentController.getById);

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
router.put('/:id/status', paymentLimiter, authMiddleware, roleMiddleware(['admin', 'owner', 'barbeiro']), schemas.updateStatus, paymentController.updateStatus);

module.exports = router;