// Barbershop routes with public listing and protected write operations.
const express = require('express');
const barbershopController = require('./barbershopController');
const authMiddleware = require('../../middlewares/authMiddleware');
const roleMiddleware = require('../../middlewares/roleMiddleware');

const router = express.Router();

router.get('/', barbershopController.getAll);
router.get('/:id', barbershopController.getById);
router.post('/', authMiddleware, roleMiddleware(['admin', 'owner']), barbershopController.create);
router.put('/:id', authMiddleware, roleMiddleware(['admin', 'owner']), barbershopController.update);
router.delete('/:id', authMiddleware, roleMiddleware(['admin']), barbershopController.remove);

module.exports = router;