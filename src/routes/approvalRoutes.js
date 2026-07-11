const express = require('express');
const router = express.Router();
const approvalController = require('../controllers/approvalController');
const { authenticate } = require('../middleware/auth');
const { checkModuleAccess } = require('../middleware/rbac');

// All routes require authentication
router.use(authenticate);
router.use(checkModuleAccess('approval_workflow'));

// Approval operations
router.post('/', approvalController.createApproval);
router.get('/pending', approvalController.getPendingApprovals);
router.get('/history', approvalController.getApprovalHistory);
router.put('/:id/approve', approvalController.approveRequest);
router.put('/:id/reject', approvalController.rejectRequest);

module.exports = router;