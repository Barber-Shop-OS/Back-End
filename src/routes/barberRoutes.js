// Sprint 0.2: Barber routes with auth and role protection
const express = require('express');
const barberController = require('../controllers/barberController');
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const { validateCreate, validateUpdate } = require('../middlewares/validateBarberPayload');

const router = express.Router();

// Public routes - list and read
router.get('/', barberController.getAllBarbers);
router.get('/:id', barberController.getBarberById);

// Protected routes - create, update, delete (admin/owner only)
router.post('/', 
  authMiddleware, 
  roleMiddleware(['admin', 'owner']), 
  validateCreate, 
  barberController.createBarber
);

router.put('/:id', 
  authMiddleware, 
  roleMiddleware(['admin', 'owner']), 
  validateUpdate, 
  barberController.updateBarber
);

router.delete('/:id', 
  authMiddleware, 
  roleMiddleware(['admin', 'owner']), 
  barberController.deleteBarber
);

module.exports = router;