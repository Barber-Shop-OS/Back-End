// BE-24: métricas — dashboard do dono e do barbeiro.
const express = require('express');
const authMiddleware = require('../../middlewares/authMiddleware');
const roleMiddleware = require('../../middlewares/roleMiddleware');
const validate = require('../../middlewares/validate');
const { Joi, id } = require('../../shared/schemas');
const { handle } = require('../branchSchedule/branchScheduleController');
const { success } = require('../../utils/responseHandler');
const dashboardService = require('./dashboardService');

const router = express.Router();
const localDate = () => Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).message("Data deve estar no formato YYYY-MM-DD");
const period = { from: localDate(), to: localDate() };

/**
 * @swagger
 * /dashboard/summary:
 *   get:
 *     summary: Métricas da barbearia (receita, agendamentos, ocupação, top serviços, por dia/filial/barbeiro)
 *     description: >
 *       Período em datas locais (fuso de cada filial), inclusive; padrão = últimos 30 dias; máximo 366.
 *       Receita = pagamentos PAID pela data do pagamento. Ocupação = minutos agendados (confirmado,
 *       concluído, falta) ÷ minutos disponíveis (horário da filial ∩ jornada − fechamentos − bloqueios).
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: query, name: barbershop_id, required: true, schema: { type: integer } }
 *       - { in: query, name: branch_id, schema: { type: integer } }
 *       - { in: query, name: from, schema: { type: string, example: '2026-11-01' } }
 *       - { in: query, name: to, schema: { type: string, example: '2026-11-30' } }
 *     responses:
 *       200:
 *         description: Métricas
 *         content:
 *           application/json:
 *             example:
 *               period: { from: '2026-11-01', to: '2026-11-30' }
 *               revenue: { total: '1250.00', payments: 25, average_ticket: '50.00', by_method: { PIX: '800.00', CASH: '250.00', CARD: '200.00' } }
 *               appointments: { total: 30, by_status: { confirmado: 3, concluido: 25, cancelado: 1, nao_compareceu: 1 } }
 *               occupancy: { booked_minutes: 870, available_minutes: 14400, rate: 0.0604 }
 *               top_services: [{ service_id: 1, name: Corte, count: 20, revenue: '1000.00' }]
 *               revenue_by_day: [{ date: '2026-11-01', amount: '0.00' }]
 *               revenue_by_branch: [{ branch_id: 1, name: Centro, appointments: 29, revenue: '1250.00' }]
 *               revenue_by_barber: [{ barber_id: 1, name: Zé, appointments: 29, revenue: '1250.00' }]
 *       400: { description: Período inválido }
 *       403: { description: Barbearia de outro dono }
 *       404: { description: Barbearia ou filial não encontrada }
 */
router.get(
  '/summary',
  authMiddleware,
  roleMiddleware(['admin', 'owner']),
  validate({ query: Joi.object({ barbershop_id: id().required(), branch_id: id(), ...period }) }),
  handle(async (req, res) => success(res, await dashboardService.summary(req.query, req.user)))
);

/**
 * @swagger
 * /dashboard/barber:
 *   get:
 *     summary: Métricas do barbeiro logado (próprios atendimentos, receita e ocupação)
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: query, name: from, schema: { type: string, example: '2026-11-01' } }
 *       - { in: query, name: to, schema: { type: string, example: '2026-11-30' } }
 *     responses:
 *       200: { description: Mesmas métricas do summary, sem revenue_by_barber }
 *       404: { description: Usuário sem perfil de barbeiro }
 */
router.get(
  '/barber',
  authMiddleware,
  roleMiddleware(['admin', 'owner', 'barbeiro']),
  validate({ query: Joi.object(period) }),
  handle(async (req, res) => success(res, await dashboardService.barber(req.query, req.user)))
);

/**
 * @swagger
 * /dashboard/front-desk:
 *   get:
 *     summary: Resumo do dia da filial para o atendimento (balcão)
 *     description: >
 *       Dono, gerente da filial ou recepcionista da filial (BE-49). date = dia local da filial (padrão hoje).
 *       total_today = agendamentos do dia exceto cancelados; attended = concluídos; pending = confirmados;
 *       upcoming = confirmados que ainda não terminaram, por horário (máx. 50).
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: query, name: branch_id, required: true, schema: { type: integer } }
 *       - { in: query, name: date, schema: { type: string, example: '2026-11-20' } }
 *     responses:
 *       200:
 *         description: Resumo
 *         content:
 *           application/json:
 *             example:
 *               date: '2026-11-20'
 *               timezone: America/Sao_Paulo
 *               branch: { id: 1, name: Centro }
 *               total_today: 12
 *               attended: 5
 *               pending: 6
 *               cancelled: 1
 *               no_show: 1
 *               upcoming:
 *                 - id: 42
 *                   start_at: '2026-11-20T17:00:00.000Z'
 *                   end_at: '2026-11-20T17:30:00.000Z'
 *                   time: '14:00'
 *                   status: confirmado
 *                   client: { id: 7, user_id: 3, name: Ana, phone: '+5511999990000' }
 *                   services: [{ id: 1, name: Corte, duration_min: 30, price: '55.00' }]
 *                   barber: { id: 2, name: Zé Navalha }
 *                   allowed_actions: [cancel, reschedule]
 *       403: { description: Filial de outro tenant ou fora do vínculo }
 *       404: { description: Filial não encontrada }
 */
router.get(
  '/front-desk',
  authMiddleware,
  roleMiddleware(['admin', 'owner', 'receptionist']),
  validate({ query: Joi.object({ branch_id: id().required(), date: localDate() }) }),
  handle(async (req, res) => success(res, await dashboardService.frontDesk(req.query, req.user)))
);

module.exports = router;
