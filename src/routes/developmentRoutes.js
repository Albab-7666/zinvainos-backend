const express = require('express');
const router = express.Router();
const developmentController = require('../controllers/developmentController');
const { authenticate } = require('../middleware/auth');
const { checkModuleAccess } = require('../middleware/rbac');

// All routes require authentication
router.use(authenticate);
router.use(checkModuleAccess('software_dev'));

// Development task management
router.post('/tasks', developmentController.createDevTask);
router.get('/tasks', developmentController.getDevTasks);
router.post('/tasks/:taskId/commits', developmentController.logCommit);
router.get('/projects/:projectId/metrics', developmentController.getDevMetrics);

module.exports = router;