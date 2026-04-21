// Service routes with public listing and protected writes.
const express = require('express');
const servicesController = require('./servicesController');
const authMiddleware = require('../../middlewares/authMiddleware');
const roleMiddleware = require('../../middlewares/roleMiddleware');
const { validateCreate, validateUpdate } = require('../../middlewares/validators/validateServicePayload');

const router = express.Router();

/**
 * @swagger
 * /services:
 *   get:
 *     summary: Listar serviços com filtros e paginação
 *     tags: [Service]
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
 *         description: Lista de serviços retornada com sucesso
 */
router.get('/', servicesController.getAllServices);

/**
 * @swagger
 * /services/{id}:
 *   get:
 *     summary: Obter serviço por ID
 *     tags: [Service]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do serviço
 *     responses:
 *       200:
 *         description: Serviço encontrado
 *       404:
 *         description: Serviço não encontrado
 */
router.get('/:id', servicesController.getServiceById);

/**
 * @swagger
 * /services:
 *   post:
 *     summary: Criar um novo serviço
 *     tags: [Service]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, description, price, duration, barbershop_id]
 *             properties:
 *               name:
 *                 type: string
 *                 example: Corte completo
 *               description:
 *                 type: string
 *                 example: Corte e finalização
 *               price:
 *                 type: number
 *                 example: 45
 *               duration:
 *                 type: integer
 *                 example: 40
 *               barbershop_id:
 *                 type: integer
 *                 example: 1
 *     responses:
 *       201:
 *         description: Serviço criado com sucesso
 *       400:
 *         description: Dados inválidos
 *       401:
 *         description: Usuário não autenticado
 *       403:
 *         description: Sem permissão para criar serviço
 */
router.post('/', authMiddleware, roleMiddleware(['admin', 'owner']), validateCreate, servicesController.createService);

/**
 * @swagger
 * /services/{id}:
 *   put:
 *     summary: Atualizar um serviço existente
 *     tags: [Service]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do serviço
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, description, price, duration, barbershop_id]
 *             properties:
 *               name:
 *                 type: string
 *                 example: Corte premium
 *               description:
 *                 type: string
 *                 example: Corte, barba e finalização
 *               price:
 *                 type: number
 *                 example: 65
 *               duration:
 *                 type: integer
 *                 example: 60
 *               barbershop_id:
 *                 type: integer
 *                 example: 1
 *     responses:
 *       200:
 *         description: Serviço atualizado com sucesso
 *       400:
 *         description: Dados inválidos
 *       401:
 *         description: Usuário não autenticado
 *       403:
 *         description: Sem permissão para atualizar serviço
 *       404:
 *         description: Serviço não encontrado
 */
router.put('/:id', authMiddleware, roleMiddleware(['admin', 'owner']), validateUpdate, servicesController.updateService);

/**
 * @swagger
 * /services/{id}:
 *   delete:
 *     summary: Remover um serviço por ID
 *     tags: [Service]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do serviço
 *     responses:
 *       204:
 *         description: Serviço removido com sucesso
 *       401:
 *         description: Usuário não autenticado
 *       403:
 *         description: Sem permissão para remover serviço
 *       404:
 *         description: Serviço não encontrado
 */
router.delete('/:id', authMiddleware, roleMiddleware(['admin', 'owner']), servicesController.deleteService);

module.exports = router;