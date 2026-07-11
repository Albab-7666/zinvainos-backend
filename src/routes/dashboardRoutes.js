const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { authenticate } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

router.get('/overview', dashboardController.getOverview);
router.get('/activities', dashboardController.getRecentActivities);
router.get('/tasks', dashboardController.getTaskStats);
router.get('/projects', dashboardController.getProjectStats);
router.get('/deadlines', dashboardController.getUpcomingDeadlines);
router.get('/workload', dashboardController.getTeamWorkload);
router.get('/notifications', dashboardController.getNotificationSummary);

module.exports = router;