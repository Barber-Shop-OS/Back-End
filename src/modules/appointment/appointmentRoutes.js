// Appointment routes with authentication and branch-aware creation.
const express = require('express');
const appointmentController = require('./appointmentController');
const authMiddleware = require('../../middlewares/authMiddleware');
const roleMiddleware = require('../../middlewares/roleMiddleware');
const schemas = require('./appointmentSchemas');
const { bookingLimiter } = require('../../middlewares/rateLimitMiddleware');

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
// Escopo por usuário aplicado no service (cliente vê os seus, barbeiro os que atende, dono os do tenant).
router.get('/', authMiddleware, schemas.list, appointmentController.getAllAppointments);

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
router.get('/:id', authMiddleware, schemas.byId, appointmentController.getAppointmentById);

/**
 * @swagger
 * /appointment:
 *   post:
 *     summary: Criar um novo agendamento
 *     description: >
 *       Cliente agenda para si (user_id do body é ignorado). Dono/admin da filial ou o próprio
 *       barbeiro agendam para um cliente e devem informar user_id. O status inicial é sempre
 *       `confirmado`; o campo status do body é ignorado.
 *       O horário é revalidado na transação com as mesmas regras de GET /availability (BE-14):
 *       fora da agenda → 400 SLOT_UNAVAILABLE; já reservado → 409 SLOT_TAKEN. Sem barber_id
 *       ("sem preferência") o servidor escolhe o barbeiro livre com menos agendamentos no dia.
 *       Cliente tem no máximo 3 agendamentos futuros por barbearia (409 TOO_MANY_ACTIVE_APPOINTMENTS)
 *       e 10 criações por hora. A equipe agenda sem antecedência mínima e em grade de 5 min.
 *     tags: [Appointment]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: Idempotency-Key
 *         required: false
 *         schema: { type: string, minLength: 8, maxLength: 100, example: 3f1c7a52-6a0e-4b8e-9d55-2a7c1e2b9f10 }
 *         description: >
 *           Repetir a requisição com a mesma chave (24 h) devolve o mesmo agendamento com o header
 *           Idempotent-Replayed=true; mesma chave com outro corpo → 409 IDEMPOTENCY_KEY_REUSED.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [service_id, branch_id, start_at]
 *             properties:
 *               user_id:
 *                 type: integer
 *                 description: Obrigatório apenas quando a barbearia agenda para um cliente
 *                 example: 1
 *               barber_id:
 *                 type: integer
 *                 description: Opcional; ausente = sem preferência
 *                 example: 1
 *               service_id:
 *                 type: integer
 *                 example: 1
 *               branch_id:
 *                 type: integer
 *                 example: 1
 *               start_at:
 *                 type: string
 *                 format: date-time
 *                 description: Início em UTC; o fim é calculado pela duração do serviço
 *                 example: 2026-12-10T14:00:00.000Z
 *               appointment_date:
 *                 type: string
 *                 format: date-time
 *                 deprecated: true
 *                 description: Nome antigo de start_at
 *               notes:
 *                 type: string
 *                 maxLength: 500
 *               source:
 *                 type: string
 *                 enum: [web, mobile, balcao]
 *     responses:
 *       201:
 *         description: Agendamento criado com sucesso
 *       400:
 *         description: Dados inválidos, barbeiro fora da filial ou horário fora da agenda (SLOT_UNAVAILABLE)
 *       401:
 *         description: Usuário não autenticado
 *       404:
 *         description: Entidade relacionada não encontrada
 *       409:
 *         description: SLOT_TAKEN, TOO_MANY_ACTIVE_APPOINTMENTS ou IDEMPOTENCY_KEY_REUSED
 *       429:
 *         description: Limite de criação por hora atingido
 */
router.post('/', authMiddleware, bookingLimiter, schemas.create, appointmentController.createAppointment);

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
 *                 enum: [confirmado, concluido, cancelado, nao_compareceu]
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
router.put('/:id', authMiddleware, schemas.updateStatus, appointmentController.updateAppointmentStatus);

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
// Exclusão física só para admin; os demais cancelam via PUT { status: 'cancelado' }.
router.delete('/:id', authMiddleware, roleMiddleware(['admin']), schemas.byId, appointmentController.deleteAppointment);

module.exports = router;