const express = require('express');
const router = express.Router();
const securityController = require('../controllers/securityController');
const { authenticate } = require('../middleware/auth');
const { ceoOnly } = require('../middleware/rbac');

// All routes require authentication and CEO role
router.use(authenticate);
router.use(ceoOnly);

// Security logs
router.get('/logs', securityController.getLogs);
router.get('/blocked-ips', securityController.getBlockedIPs);
router.post('/block-ip', securityController.blockIP);
router.delete('/unblock-ip/:ipAddress', securityController.unblockIP);

// Settings
router.get('/settings', securityController.getSettings);
router.put('/settings', securityController.updateSettings);

// Health
router.get('/health', securityController.getHealth);

module.exports = router;