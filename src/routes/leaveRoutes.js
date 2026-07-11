const express = require('express');
const router = express.Router();
const leaveController = require('../controllers/leaveController');
const { authenticate } = require('../middleware/auth');
const { checkModuleAccess } = require('../middleware/rbac');

// All routes require authentication
router.use(authenticate);
router.use(checkModuleAccess('leave_management'));

// Leave CRUD
router.post('/', leaveController.createLeaveRequest);
router.get('/', leaveController.getLeaveRequests);
router.get('/:id', leaveController.getLeaveRequest);
router.put('/:id', leaveController.updateLeaveRequest);
router.delete('/:id', leaveController.deleteLeaveRequest);

// Leave actions
router.post('/:id/approve', leaveController.approveLeave);
router.post('/:id/reject', leaveController.rejectLeave);
router.get('/balance/:userId?', leaveController.getLeaveBalance);

module.exports = router;