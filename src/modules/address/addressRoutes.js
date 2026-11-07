// Address routes for direct access and branch support workflows.
const express = require('express');
const addressController = require('./addressController');
const authMiddleware = require('../../middlewares/authMiddleware');
const roleMiddleware = require('../../middlewares/roleMiddleware');
const schemas = require('./addressSchemas');

const router = express.Router();

/**
 * @swagger
 * /address:
 *   post:
 *     summary: Criar um endereço
 *     tags: [Address]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [cep, number, city, state]
 *             properties:
 *               cep:
 *                 type: string
 *                 example: 01001000
 *               number:
 *                 type: integer
 *                 example: 100
 *               complement:
 *                 type: string
 *                 example: Fundos
 *               city:
 *                 type: string
 *                 example: São Paulo
 *               state:
 *                 type: string
 *                 example: SP
 *     responses:
 *       201:
 *         description: Endereço criado com sucesso
 *       400:
 *         description: Campos de endereço inválidos
 *       401:
 *         description: Usuário não autenticado
 *       403:
 *         description: Sem permissão para criar endereço
 */
router.post('/', authMiddleware, roleMiddleware(['admin', 'owner']), schemas.create, addressController.create);

/**
 * @swagger
 * /address/{id}:
 *   get:
 *     summary: Obter endereço por ID
 *     tags: [Address]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do endereço
 *     responses:
 *       200:
 *         description: Endereço encontrado
 *       401:
 *         description: Usuário não autenticado
 *       404:
 *         description: Endereço não encontrado
 */
router.get('/:id', authMiddleware, schemas.byId, addressController.getById);

/**
 * @swagger
 * /address/{id}:
 *   put:
 *     summary: Atualizar endereço por ID
 *     tags: [Address]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do endereço
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [cep, number, city, state]
 *             properties:
 *               cep:
 *                 type: string
 *                 example: 01001000
 *               number:
 *                 type: integer
 *                 example: 120
 *               complement:
 *                 type: string
 *                 example: Loja 1
 *               city:
 *                 type: string
 *                 example: São Paulo
 *               state:
 *                 type: string
 *                 example: SP
 *     responses:
 *       200:
 *         description: Endereço atualizado com sucesso
 *       400:
 *         description: Campos de endereço inválidos
 *       401:
 *         description: Usuário não autenticado
 *       403:
 *         description: Sem permissão para atualizar endereço
 *       404:
 *         description: Endereço não encontrado
 */
router.put('/:id', authMiddleware, roleMiddleware(['admin', 'owner']), schemas.update, addressController.update);

module.exports = router;