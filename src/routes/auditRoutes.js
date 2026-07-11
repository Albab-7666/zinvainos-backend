const express = require('express');
const router = express.Router();
const auditController = require('../controllers/auditController');
const { authenticate } = require('../middleware/auth');
const { ceoOnly } = require('../middleware/rbac');

// All routes require authentication and CEO role
router.use(authenticate);
router.use(ceoOnly);

// Audit logs
router.get('/', auditController.getAuditLogs);
router.get('/summary', auditController.getAuditSummary);
router.get('/:id', auditController.getAuditLog);
router.get('/export', auditController.exportAuditLogs);
router.post('/clean', auditController.cleanOldLogs);

module.exports = router;