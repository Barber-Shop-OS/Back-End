// Appointment routes with authentication and branch-aware creation.
const express = require('express');
const appointmentController = require('./appointmentController');
const authMiddleware = require('../../middlewares/authMiddleware');
const roleMiddleware = require('../../middlewares/roleMiddleware');
const { validateCreate, validateUpdateStatus } = require('../../middlewares/validators/validateAppointmentPayload');

const router = express.Router();

router.get('/', authMiddleware, roleMiddleware(['admin', 'owner', 'barbeiro']), appointmentController.getAllAppointments);
router.get('/:id', authMiddleware, appointmentController.getAppointmentById);
router.post('/', authMiddleware, validateCreate, appointmentController.createAppointment);
router.put('/:id', authMiddleware, validateUpdateStatus, appointmentController.updateAppointmentStatus);
router.delete('/:id', authMiddleware, appointmentController.deleteAppointment);

module.exports = router;