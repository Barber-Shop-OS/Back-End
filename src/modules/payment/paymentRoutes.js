// Payment routes for appointment payment management.
const express = require('express');
const paymentController = require('./paymentController');
const authMiddleware = require('../../middlewares/authMiddleware');
const roleMiddleware = require('../../middlewares/roleMiddleware');
const validatePaymentPayload = require('../../middlewares/validators/validatePaymentPayload');

const router = express.Router();

router.post('/', authMiddleware, validatePaymentPayload, paymentController.create);
router.get('/appointment/:appointment_id', authMiddleware, paymentController.getByAppointment);
router.get('/:id', authMiddleware, paymentController.getById);
router.put('/:id/status', authMiddleware, roleMiddleware(['admin', 'owner', 'barbeiro']), paymentController.updateStatus);

module.exports = router;