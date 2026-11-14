// BE-10: rotas de horário e fechamentos, registradas no router de /api/branch (ver branchRoutes).
const authMiddleware = require('../../middlewares/authMiddleware');
const roleMiddleware = require('../../middlewares/roleMiddleware');
const controller = require('./branchScheduleController');
const schemas = require('./branchScheduleSchemas');

const manager = [authMiddleware, roleMiddleware(['admin', 'owner'])];

/**
 * @swagger
 * /branch/{id}/opening-hours:
 *   get:
 *     summary: Horário de funcionamento da filial (público)
 *     description: Horários locais (HH:mm) no fuso `timezone` da filial; weekday 0 = domingo.
 *     tags: [Branch]
 *     security: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     responses:
 *       200:
 *         description: Semana de funcionamento
 *         content:
 *           application/json:
 *             example:
 *               branch_id: 1
 *               timezone: America/Sao_Paulo
 *               opening_hours: [{ weekday: 1, opens_at: '09:00', closes_at: '12:00' }]
 *       404: { description: Filial não encontrada }
 *   put:
 *     summary: Substituir a semana de funcionamento (transação)
 *     tags: [Branch]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [opening_hours]
 *             properties:
 *               opening_hours:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     weekday: { type: integer, minimum: 0, maximum: 6 }
 *                     opens_at: { type: string, example: '09:00' }
 *                     closes_at: { type: string, example: '18:00' }
 *     responses:
 *       200: { description: Semana salva }
 *       400: { description: Intervalo inválido ou sobreposto }
 *       403: { description: Filial de outro tenant }
 * /branch/{id}/closures:
 *   get:
 *     summary: Fechamentos da filial (público)
 *     tags: [Branch]
 *     security: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *       - { in: query, name: from, schema: { type: string, format: date } }
 *       - { in: query, name: to, schema: { type: string, format: date } }
 *     responses:
 *       200: { description: Lista de fechamentos }
 *   post:
 *     summary: Criar fechamento (dia inteiro ou parcial)
 *     tags: [Branch]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [date]
 *             properties:
 *               date: { type: string, format: date, example: '2026-12-25' }
 *               reason: { type: string, example: Natal }
 *               all_day: { type: boolean, default: true }
 *               start_time: { type: string, example: '12:00' }
 *               end_time: { type: string, example: '14:00' }
 *     responses:
 *       201: { description: Fechamento criado }
 *       400: { description: Dados inválidos }
 *       403: { description: Filial de outro tenant }
 * /branch/{id}/closures/{closureId}:
 *   put:
 *     summary: Atualizar fechamento
 *     tags: [Branch]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *       - { in: path, name: closureId, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Atualizado }
 *       404: { description: Fechamento não encontrado nesta filial }
 *   delete:
 *     summary: Remover fechamento
 *     tags: [Branch]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *       - { in: path, name: closureId, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: Removido }
 */
const register = (router) => {
  router.get('/:id/opening-hours', schemas.byBranch, controller.getOpeningHours);
  router.put('/:id/opening-hours', ...manager, schemas.replaceHours, controller.replaceOpeningHours);
  router.get('/:id/closures', schemas.listClosures, controller.listClosures);
  router.post('/:id/closures', ...manager, schemas.createClosure, controller.createClosure);
  router.put('/:id/closures/:closureId', ...manager, schemas.updateClosure, controller.updateClosure);
  router.delete('/:id/closures/:closureId', ...manager, schemas.removeClosure, controller.removeClosure);
};

module.exports = { register };
