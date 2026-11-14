// BE-11: rotas de jornada e bloqueios, registradas no router de /api/barber (ver barberRoutes).
const authMiddleware = require('../../middlewares/authMiddleware');
const roleMiddleware = require('../../middlewares/roleMiddleware');
const validate = require('../../middlewares/validate');
const { Joi, id, text, isoDate, idParams } = require('../../shared/schemas');
const { hhmm } = require('../branchSchedule/branchScheduleSchemas');
const { handle } = require('../branchSchedule/branchScheduleController');
const { success, created, noContent } = require('../../utils/responseHandler');
const service = require('./barberScheduleService');

const schemas = {
  byBarber: validate({ params: idParams }),
  replaceHours: validate({
    params: idParams,
    body: Joi.object({
      working_hours: Joi.array()
        .items(
          Joi.object({
            weekday: Joi.number().integer().min(0).max(6).required(),
            start_time: hhmm().required(),
            end_time: hhmm().required(),
          })
        )
        .max(70)
        .required(),
    }),
  }),
  listTimeOff: validate({ params: idParams, query: Joi.object({ from: isoDate(), to: isoDate() }) }),
  createTimeOff: validate({
    params: idParams,
    body: Joi.object({ start_at: isoDate().required(), end_at: isoDate().required(), reason: text(255).allow('', null) }),
  }),
  removeTimeOff: validate({ params: Joi.object({ id: id().required(), timeOffId: id().required() }) }),
};

const controller = {
  getWorkingHours: handle(async (req, res) => success(res, await service.getWorkingHours(req.params.id))),
  replaceWorkingHours: handle(async (req, res) =>
    success(res, await service.replaceWorkingHours(req.params.id, req.body.working_hours, req.user))
  ),
  listTimeOff: handle(async (req, res) =>
    success(res, { items: await service.listTimeOff(req.params.id, req.query, req.user) })
  ),
  createTimeOff: handle(async (req, res) =>
    created(res, { message: 'Bloqueio criado', time_off: await service.createTimeOff(req.params.id, req.body, req.user) })
  ),
  removeTimeOff: handle(async (req, res) => {
    await service.removeTimeOff(req.params.id, req.params.timeOffId, req.user);
    return noContent(res);
  }),
};

const owner = [authMiddleware, roleMiddleware(['admin', 'owner'])];
const staff = [authMiddleware, roleMiddleware(['admin', 'owner', 'barbeiro'])];

/**
 * @swagger
 * /barber/{id}/working-hours:
 *   get:
 *     summary: Jornada efetiva do barbeiro (público)
 *     description: Sem jornada própria, retorna o horário da filial (uses_branch_hours=true). Horários locais HH:mm.
 *     tags: [Barber]
 *     security: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Jornada }
 *       404: { description: Barbeiro inexistente ou inativo }
 *   put:
 *     summary: Substituir a jornada semanal (dono)
 *     description: Cada intervalo precisa caber no horário de funcionamento da filial. Lista vazia = usar o da filial.
 *     tags: [Barber]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example: { working_hours: [{ weekday: 1, start_time: '10:00', end_time: '16:00' }] }
 *     responses:
 *       200: { description: Jornada salva }
 *       400: { description: Fora do horário da filial, sobreposição ou formato inválido }
 *       403: { description: Barbeiro de outro tenant }
 * /barber/{id}/time-off:
 *   get:
 *     summary: Bloqueios do barbeiro (dono ou o próprio barbeiro)
 *     tags: [Barber]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *       - { in: query, name: from, schema: { type: string, format: date-time } }
 *       - { in: query, name: to, schema: { type: string, format: date-time } }
 *     responses:
 *       200: { description: Lista de bloqueios }
 *       403: { description: Sem permissão }
 *   post:
 *     summary: Criar bloqueio (almoço, folga)
 *     tags: [Barber]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example: { start_at: '2026-12-01T15:00:00.000Z', end_at: '2026-12-01T16:00:00.000Z', reason: Almoço }
 *     responses:
 *       201: { description: Bloqueio criado }
 *       400: { description: Intervalo inválido }
 *       403: { description: Sem permissão }
 *       409: { description: Coincide com agendamentos confirmados (TIME_OFF_CONFLICT, details.appointments) }
 * /barber/{id}/time-off/{timeOffId}:
 *   delete:
 *     summary: Remover bloqueio
 *     tags: [Barber]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *       - { in: path, name: timeOffId, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: Removido }
 *       404: { description: Bloqueio não encontrado neste barbeiro }
 */
const register = (router) => {
  router.get('/:id/working-hours', schemas.byBarber, controller.getWorkingHours);
  router.put('/:id/working-hours', ...owner, schemas.replaceHours, controller.replaceWorkingHours);
  router.get('/:id/time-off', ...staff, schemas.listTimeOff, controller.listTimeOff);
  router.post('/:id/time-off', ...staff, schemas.createTimeOff, controller.createTimeOff);
  router.delete('/:id/time-off/:timeOffId', ...staff, schemas.removeTimeOff, controller.removeTimeOff);
};

module.exports = { register };
