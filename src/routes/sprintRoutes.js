const express = require('express');
const router = express.Router();
const sprintController = require('../controllers/sprintController');
const { authenticate } = require('../middleware/auth');
const { checkModuleAccess } = require('../middleware/rbac');

// All routes require authentication
router.use(authenticate);
router.use(checkModuleAccess('sprint_management'));

// Sprint CRUD
router.post('/', sprintController.createSprint);
router.get('/', sprintController.getSprints);
router.get('/:id', sprintController.getSprint);
router.put('/:id', sprintController.updateSprint);
router.delete('/:id', sprintController.deleteSprint);

// Sprint task management
router.post('/:id/tasks', sprintController.addTasksToSprint);
router.delete('/:id/tasks/:taskId', sprintController.removeTaskFromSprint);

module.exports = router;