const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { authenticate } = require('../middleware/auth');
const { checkModuleAccess } = require('../middleware/rbac');

// All routes require authentication
router.use(authenticate);
router.use(checkModuleAccess('reports_analytics', 'limited'));

// Project report
router.get('/project/:projectId', reportController.getProjectReport);

// Finance report (CEO only)
router.get('/finance', reportController.getFinanceReport);

// Productivity report
router.get('/productivity', reportController.getProductivityReport);

// Attendance report
router.get('/attendance', reportController.getAttendanceReport);

// Custom report
router.post('/custom', reportController.getCustomReport);

// Export
router.get('/export/:reportType/:format?', reportController.exportReport);

module.exports = router;