const express = require('express');
const router = express.Router();
const healthController = require('../controllers/healthController');
const { authenticate } = require('../middleware/auth');
const { ceoOnly } = require('../middleware/rbac');

// Public health check
router.get('/status', healthController.getSystemHealth);

// Protected routes
router.use(authenticate);
router.use(ceoOnly);

router.get('/', healthController.getSystemHealth);
router.get('/logs', healthController.getSystemLogs);

module.exports = router;