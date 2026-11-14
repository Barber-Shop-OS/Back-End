// Barbershop routes with public listing and protected write operations.
const express = require('express');
const barbershopController = require('./barbershopController');
const authMiddleware = require('../../middlewares/authMiddleware');
const roleMiddleware = require('../../middlewares/roleMiddleware');

const schemas = require('./barbershopSchemas');

const router = express.Router();

/**
 * @swagger
 * /barbershop:
 *   get:
 *     summary: Listar barbearias com paginação e filtros
 *     tags: [Barbershop]
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
 *         name: name
 *         schema:
 *           type: string
 *         description: Nome parcial da barbearia
 *       - in: query
 *         name: city
 *         schema:
 *           type: string
 *         description: Cidade da filial
 *     responses:
 *       200:
 *         description: Lista de barbearias retornada com sucesso
 *         content:
 *           application/json:
 *             example:
 *               items: []
 *               page: 1
 *               pageSize: 10
 *               total: 0
 *               totalPages: 0
 */
router.get('/', schemas.list, barbershopController.getAll);

/**
 * @swagger
 * /barbershop/{id}:
 *   get:
 *     summary: Obter barbearia por ID com owner e filiais
 *     tags: [Barbershop]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID da barbearia
 *     responses:
 *       200:
 *         description: Barbearia encontrada
 *       404:
 *         description: Barbearia não encontrada
 *         content:
 *           application/json:
 *             example:
 *               message: Barbearia não encontrada
 */
/**
 * @swagger
 * /barbershop/slug/{slug}:
 *   get:
 *     summary: Perfil público da barbearia
 *     description: Barbearia + filiais ativas (endereço, horário, open_now no fuso da filial) + serviços e barbeiros ativos. Sem dados do dono nem e-mails.
 *     tags: [Barbershop]
 *     security: []
 *     parameters:
 *       - { in: path, name: slug, required: true, schema: { type: string, example: navalha-de-ouro } }
 *     responses:
 *       200: { description: Perfil público }
 *       404: { description: Inexistente, suspensa ou sem assinatura ativa }
 */
router.get('/slug/:slug', schemas.bySlug, barbershopController.getBySlug);

router.get('/:id', schemas.byId, barbershopController.getById);

/**
 * @swagger
 * /barbershop:
 *   post:
 *     summary: Criar uma nova barbearia
 *     tags: [Barbershop]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *                 example: Barber Prime
 *     responses:
 *       201:
 *         description: Barbearia criada com sucesso
 *       400:
 *         description: Dados inválidos
 *       401:
 *         description: Usuário não autenticado
 *       403:
 *         description: Sem permissão para criar barbearia
 *       409:
 *         description: Nome já existe para o mesmo owner
 */
router.post('/', authMiddleware, roleMiddleware(['admin', 'owner']), schemas.create, barbershopController.create);

/**
 * @swagger
 * /barbershop/{id}:
 *   put:
 *     summary: Atualizar uma barbearia existente
 *     tags: [Barbershop]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID da barbearia
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: Barber Prime Centro
 *     responses:
 *       200:
 *         description: Barbearia atualizada com sucesso
 *       401:
 *         description: Usuário não autenticado
 *       403:
 *         description: Sem permissão para editar esta barbearia
 *       404:
 *         description: Barbearia não encontrada
 */
router.put('/:id', authMiddleware, roleMiddleware(['admin', 'owner']), schemas.update, barbershopController.update);

/**
 * @swagger
 * /barbershop/{id}:
 *   delete:
 *     summary: Remover uma barbearia
 *     tags: [Barbershop]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID da barbearia
 *     responses:
 *       200:
 *         description: Barbearia removida com sucesso
 *       401:
 *         description: Usuário não autenticado
 *       403:
 *         description: Sem permissão para remover barbearia
 *       404:
 *         description: Barbearia não encontrada
 */
router.delete('/:id', authMiddleware, roleMiddleware(['admin']), schemas.byId, barbershopController.remove);

module.exports = router;