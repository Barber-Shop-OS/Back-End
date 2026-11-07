// Rotas administrativas da plataforma (role admin). Expandidas em BE-41.
const express = require('express');
const userController = require('../user/userController');
const authMiddleware = require('../../middlewares/authMiddleware');
const roleMiddleware = require('../../middlewares/roleMiddleware');

const router = express.Router();

router.use(authMiddleware, roleMiddleware(['admin']));

/**
 * @swagger
 * /admin/users/{id}/role:
 *   patch:
 *     summary: Alterar o papel de um usuário (somente admin)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [role]
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [cliente, barbeiro, owner, admin]
 *     responses:
 *       200:
 *         description: Papel atualizado
 *       400:
 *         description: Papel inválido ou admin tentando remover o próprio acesso
 *       403:
 *         description: Não é admin
 *       404:
 *         description: Usuário não encontrado
 */
router.patch('/users/:id/role', userController.changeUserRole);

module.exports = router;
