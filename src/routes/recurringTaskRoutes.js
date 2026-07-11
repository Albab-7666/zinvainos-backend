const express = require('express');
const router = express.Router();
const recurringTaskController = require('../controllers/recurringTaskController');
const { authenticate } = require('../middleware/auth');
const { checkModuleAccess } = require('../middleware/rbac');

// All routes require authentication
router.use(authenticate);
router.use(checkModuleAccess('recurring_tasks', 'limited'));

// Recurring task CRUDrouter.post('/', recurringTaskController.createRecurringTask);
router.get('/', recurringTaskController.getRecurringTasks);
router.put('/:id', recurringTaskController.updateRecurringTask);
router.delete('/:id', recurringTaskController.deleteRecurringTask);

// Generate tasks
router.post('/:id/generate', recurringTaskController.generateTasksNow);

module.exports = router;