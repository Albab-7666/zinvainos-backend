const express = require('express');
const router = express.Router();
const riskController = require('../controllers/riskController');
const { authenticate } = require('../middleware/auth');
const { checkModuleAccess } = require('../middleware/rbac');

// All routes require authentication
router.use(authenticate);
router.use(checkModuleAccess('risk_alert', 'limited'));

// Risk alerts
router.get('/alerts', riskController.getRiskAlerts);
router.get('/metrics', riskController.getRiskMetrics);

// Alert settings
router.get('/settings', riskController.getAlertSettings);
router.put('/settings', riskController.updateAlertSettings);

module.exports = router;