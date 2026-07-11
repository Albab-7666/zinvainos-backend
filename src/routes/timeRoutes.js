const express = require('express');
const router = express.Router();
const timeController = require('../controllers/timeController');
const { authenticate } = require('../middleware/auth');
const { checkModuleAccess } = require('../middleware/rbac');

// All routes require authentication
router.use(authenticate);
router.use(checkModuleAccess('time_tracking'));

// Time tracking
router.post('/start', timeController.startTracking);
router.post('/:id/stop', timeController.stopTracking);
router.get('/entries', timeController.getTimeEntries);
router.put('/:id', timeController.updateTimeEntry);
router.delete('/:id', timeController.deleteTimeEntry);

// Reports
router.get('/report', timeController.getTimeReport);
router.get('/productivity', timeController.getProductivityMetrics);

module.exports = router;