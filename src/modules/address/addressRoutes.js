// Address routes for direct access and branch support workflows.
const express = require('express');
const addressController = require('./addressController');
const authMiddleware = require('../../middlewares/authMiddleware');
const roleMiddleware = require('../../middlewares/roleMiddleware');
const validateAddressPayload = require('../../middlewares/validators/validateAddressPayload');

const router = express.Router();

router.post('/', authMiddleware, roleMiddleware(['admin', 'owner']), validateAddressPayload, addressController.create);
router.get('/:id', authMiddleware, addressController.getById);
router.put('/:id', authMiddleware, roleMiddleware(['admin', 'owner']), validateAddressPayload, addressController.update);

module.exports = router;