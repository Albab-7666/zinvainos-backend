const express = require('express');
const router = express.Router();
const designController = require('../controllers/designController');
const { authenticate } = require('../middleware/auth');
const { checkModuleAccess } = require('../middleware/rbac');

// All routes require authentication
router.use(authenticate);
router.use(checkModuleAccess('graphic_design'));

// Design task management
router.post('/tasks', designController.createDesignTask);
router.get('/tasks', designController.getDesignTasks);
router.post('/tasks/:taskId/submit', designController.submitDesign);
router.put('/tasks/:taskId/review', designController.reviewDesign);

// Design templates
router.get('/templates', designController.getDesignTemplates);

module.exports = router;