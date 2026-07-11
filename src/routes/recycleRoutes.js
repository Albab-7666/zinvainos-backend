const express = require('express');
const router = express.Router();
const recycleController = require('../controllers/recycleController');
const { authenticate } = require('../middleware/auth');
const { ceoOnly } = require('../middleware/rbac');

// All routes require authentication and CEO role
router.use(authenticate);
router.use(ceoOnly);

// Recycle bin operations
router.get('/', recycleController.getDeletedItems);
router.post('/:id/restore', recycleController.restoreItem);
router.delete('/:id', recycleController.deletePermanent);
router.delete('/', recycleController.emptyRecycleBin);

module.exports = router;