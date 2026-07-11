const express = require('express');
const router = express.Router();
const projectController = require('../controllers/projectController');
const { authenticate } = require('../middleware/auth');
const { checkModuleAccess } = require('../middleware/rbac');

// All routes require authentication and project module access
router.use(authenticate);
router.use(checkModuleAccess('project_management'));

// Project CRUD
router.post('/', projectController.createProject);
router.get('/', projectController.getProjects);
router.get('/:id', projectController.getProject);
router.get('/:id/timeline', projectController.getProjectTimeline);
router.get('/:id/budget', projectController.getProjectBudget);
router.put('/:id', projectController.updateProject);
router.delete('/:id', projectController.deleteProject);

module.exports = router;