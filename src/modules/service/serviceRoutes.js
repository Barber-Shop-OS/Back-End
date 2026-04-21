// Service routes with public listing and protected writes.
const express = require('express');
const servicesController = require('./servicesController');
const authMiddleware = require('../../middlewares/authMiddleware');
const roleMiddleware = require('../../middlewares/roleMiddleware');
const { validateCreate, validateUpdate } = require('../../middlewares/validators/validateServicePayload');

const router = express.Router();

router.get('/', servicesController.getAllServices);
router.get('/:id', servicesController.getServiceById);
router.post('/', authMiddleware, roleMiddleware(['admin', 'owner']), validateCreate, servicesController.createService);
router.put('/:id', authMiddleware, roleMiddleware(['admin', 'owner']), validateUpdate, servicesController.updateService);
router.delete('/:id', authMiddleware, roleMiddleware(['admin', 'owner']), servicesController.deleteService);

module.exports = router;