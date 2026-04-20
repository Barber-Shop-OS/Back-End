// Sprint 0.2: Service routes with auth and role protection
const express = require('express');
const servicesController = require('../controllers/servicesController');
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const { validateCreate, validateUpdate } = require('../middlewares/validateServicePayload');

const router = express.Router();

// Public routes - list and read
router.get('/', servicesController.getAllServices);
router.get('/:id', servicesController.getServiceById);

// Protected routes - create, update, delete (admin/owner only)
router.post('/', 
  authMiddleware, 
  roleMiddleware(['admin', 'owner']), 
  validateCreate, 
  servicesController.createService
);

router.put('/:id', 
  authMiddleware, 
  roleMiddleware(['admin', 'owner']), 
  validateUpdate, 
  servicesController.updateService
);

router.delete('/:id', 
  authMiddleware, 
  roleMiddleware(['admin', 'owner']), 
  servicesController.deleteService
);

module.exports = router;