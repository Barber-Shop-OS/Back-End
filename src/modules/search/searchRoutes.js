// BE-25: busca pública de filiais. Rate limit próprio e cache curto.
const express = require('express');
const rateLimit = require('express-rate-limit');
const validate = require('../../middlewares/validate');
const { Joi, text } = require('../../shared/schemas');
const searchService = require('./searchService');

const router = express.Router();

const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { code: 'RATE_LIMITED', message: 'Muitas buscas. Tente novamente em instantes.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
});

const querySchema = validate({
  query: Joi.object({
    q: text(100).allow(''),
    city: text(100).allow(''),
    service: text(100).allow(''),
    lat: Joi.number().min(-90).max(90),
    lng: Joi.number().min(-180).max(180),
    page: Joi.number().integer().min(1).default(1),
    // Acima de 50 é limitado a 50 (não rejeitado), como nas demais listagens.
    pageSize: Joi.number().integer().min(1).default(20),
  })
    .and('lat', 'lng')
    .messages({ 'object.and': 'Informe lat e lng juntos' }),
});

/**
 * @swagger
 * /search/branches:
 *   get:
 *     summary: Buscar filiais (público)
 *     description: >
 *       Filiais ativas de barbearias ativas com assinatura ativa, em atraso ou em trial vigente.
 *       `q` procura no nome da barbearia, da filial ou de um serviço; `city` na cidade; `service`
 *       mantém só quem oferece o serviço. Com `lat` e `lng` ordena por distância (km) — filiais sem
 *       coordenadas vão para o fim. `pageSize` máximo 50.
 *     tags: [Search]
 *     parameters:
 *       - { in: query, name: q, schema: { type: string, maxLength: 100 } }
 *       - { in: query, name: city, schema: { type: string, maxLength: 100 } }
 *       - { in: query, name: service, schema: { type: string, maxLength: 100 } }
 *       - { in: query, name: lat, schema: { type: number, minimum: -90, maximum: 90 } }
 *       - { in: query, name: lng, schema: { type: number, minimum: -180, maximum: 180 } }
 *       - { in: query, name: page, schema: { type: integer, minimum: 1, default: 1 } }
 *       - { in: query, name: pageSize, schema: { type: integer, minimum: 1, maximum: 50, default: 20 } }
 *     responses:
 *       200:
 *         description: Página de filiais
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: integer }
 *                       name: { type: string }
 *                       timezone: { type: string }
 *                       phone: { type: string, nullable: true }
 *                       whatsapp: { type: string, nullable: true }
 *                       address: { type: object }
 *                       barbershop: { type: object, properties: { id: { type: integer }, slug: { type: string }, name: { type: string }, logo_url: { type: string, nullable: true } } }
 *                       distance_km: { type: number, nullable: true, description: Só com lat/lng }
 *                 page: { type: integer }
 *                 pageSize: { type: integer }
 *                 total: { type: integer }
 *                 totalPages: { type: integer }
 *       400: { description: Parâmetros inválidos (ex. lat sem lng) }
 *       429: { description: Limite de buscas atingido }
 */
router.get('/branches', searchLimiter, querySchema, async (req, res, next) => {
  try {
    const result = await searchService.searchBranches(req.query);
    res.set('Cache-Control', 'public, max-age=30');
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
