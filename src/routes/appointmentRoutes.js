// Sprint 0.2: Appointment routes with auth protection
const express = require('express');
const appointmentController = require('../controllers/appointmentController');
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const { validateCreate, validateUpdateStatus } = require('../middlewares/validateAppointmentPayload');

const router = express.Router();

// All appointment routes require authentication
// GET / requires admin, owner, or barber role
// All other operations require authentication

router.get('/', 
  authMiddleware, 
  roleMiddleware(['admin', 'owner', 'barbeiro']), 
  appointmentController.getAllAppointments
);

router.get('/:id', 
  authMiddleware, 
  appointmentController.getAppointmentById
);

router.post('/', 
  authMiddleware, 
  validateCreate, 
  appointmentController.createAppointment
);

router.put('/:id', 
  authMiddleware, 
  validateUpdateStatus, 
  appointmentController.updateAppointmentStatus
);

router.delete('/:id', 
  authMiddleware, 
  appointmentController.deleteAppointment
);

module.exports = router;