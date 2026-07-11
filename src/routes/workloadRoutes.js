const express = require('express');
const router = express.Router();
const workloadController = require('../controllers/workloadController');
const { authenticate } = require('../middleware/auth');
const { checkModuleAccess } = require('../middleware/rbac');

// All routes require authentication
router.use(authenticate);
router.use(checkModuleAccess('team_workload'));

// Workload dashboard
router.get('/team', workloadController.getTeamWorkload);
router.get('/departments', workloadController.getWorkloadByDepartment);
router.get('/history', workloadController.getWorkloadHistory);
router.get('/recommendations', workloadController.getWorkloadRecommendations);

module.exports = router;