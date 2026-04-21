// Barber routes with public reads and protected writes.
const express = require('express');
const barberController = require('./barberController');
const authMiddleware = require('../../middlewares/authMiddleware');
const roleMiddleware = require('../../middlewares/roleMiddleware');
const { validateCreate, validateUpdate } = require('../../middlewares/validators/validateBarberPayload');

const router = express.Router();

router.get('/', barberController.getAll);
router.get('/:id', barberController.getById);
router.post('/', authMiddleware, roleMiddleware(['admin', 'owner']), validateCreate, barberController.create);
router.put('/:id', authMiddleware, roleMiddleware(['admin', 'owner']), validateUpdate, barberController.update);
router.delete('/:id', authMiddleware, roleMiddleware(['admin', 'owner']), barberController.remove);

module.exports = router;