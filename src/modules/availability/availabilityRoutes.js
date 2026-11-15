// BE-13: disponibilidade pública. Rate limit próprio e cache curto [SEC-21].
const express = require('express');
const rateLimit = require('express-rate-limit');
const validate = require('../../middlewares/validate');
const { Joi, id } = require('../../shared/schemas');
const availabilityService = require('./availabilityService');

const router = express.Router();

const availabilityLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { code: 'RATE_LIMITED', message: 'Muitas consultas de horários. Tente novamente em instantes.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
});

const querySchema = validate({
  query: Joi.object({
    branch_id: id().required(),
    service_id: id().required(),
    date: Joi.string()
      .pattern(/^\d{4}-\d{2}-\d{2}$/)
      .required()
      .messages({ 'string.pattern.base': "Campo 'date' deve estar no formato YYYY-MM-DD" }),
    barber_id: id(),
  }),
});

/**
 * @swagger
 * /availability:
 *   get:
 *     summary: Horários livres de uma filial para um serviço num dia
 *     description: >
 *       Público. Regras: horário da filial ∩ jornada do barbeiro − fechamentos − bloqueios −
 *       agendamentos confirmados; antecedência mínima de 30 min; até 30 dias à frente; grade de 15 min
 *       a partir da meia-noite no fuso da filial. Sem `barber_id` ("sem preferência") devolve a união
 *       dos barbeiros que executam o serviço, com a lista de quem está livre em cada horário.
 *     tags: [Availability]
 *     parameters:
 *       - { in: query, name: branch_id, required: true, schema: { type: integer } }
 *       - { in: query, name: service_id, required: true, schema: { type: integer } }
 *       - { in: query, name: date, required: true, schema: { type: string, example: '2026-12-10' }, description: Data local da filial }
 *       - { in: query, name: barber_id, schema: { type: integer } }
 *     responses:
 *       200:
 *         description: Lista de horários (vazia se o dia estiver fechado ou lotado)
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   start_at: { type: string, format: date-time, example: '2026-12-10T12:00:00.000Z' }
 *                   end_at: { type: string, format: date-time, example: '2026-12-10T12:30:00.000Z' }
 *                   barber_ids: { type: array, items: { type: integer }, example: [3, 7] }
 *       400: { description: Parâmetros inválidos }
 *       404: { description: Filial, serviço ou barbeiro não encontrado }
 *       429: { description: Limite de consultas atingido }
 */
router.get('/', availabilityLimiter, querySchema, async (req, res, next) => {
  try {
    const slots = await availabilityService.getAvailability(req.query);
    res.set('Cache-Control', 'public, max-age=30');
    return res.status(200).json(slots);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
