// Branch routes with combined branch and address management.
const express = require('express');
const branchController = require('./branchController');
const authMiddleware = require('../../middlewares/authMiddleware');
const roleMiddleware = require('../../middlewares/roleMiddleware');

const router = express.Router();

router.get('/', branchController.getAll);
router.get('/:id', branchController.getById);
router.post('/', authMiddleware, roleMiddleware(['admin', 'owner']), branchController.create);
router.put('/:id', authMiddleware, roleMiddleware(['admin', 'owner']), branchController.update);
router.delete('/:id', authMiddleware, roleMiddleware(['admin', 'owner']), branchController.remove);

module.exports = router;