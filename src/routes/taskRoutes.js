const express = require('express');
const router = express.Router();
const taskController = require('../controllers/taskController');
const { authenticate } = require('../middleware/auth');
const { checkModuleAccess } = require('../middleware/rbac');

// All routes require authentication
router.use(authenticate);
router.use(checkModuleAccess('task_management'));

// Task CRUD
router.post('/', taskController.createTask);
router.get('/', taskController.getTasks);
router.get('/stats', taskController.getTaskStats);
router.get('/status/:status', taskController.getTasksByStatus);
router.get('/:id', taskController.getTask);
router.put('/:id', taskController.updateTask);
router.delete('/:id', taskController.deleteTask);

// Task operations
router.put('/:id/status', taskController.updateStatus);
router.put('/:id/assign', taskController.assignTask);

module.exports = router;