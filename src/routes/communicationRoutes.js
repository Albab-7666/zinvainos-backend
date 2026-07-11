const express = require('express');
const router = express.Router();
const communicationController = require('../controllers/communicationController');
const { authenticate } = require('../middleware/auth');
const { checkModuleAccess } = require('../middleware/rbac');

// All routes require authentication
router.use(authenticate);
router.use(checkModuleAccess('team_communication'));

// Workspace management
router.post('/workspaces', communicationController.createWorkspace);
router.get('/workspaces', communicationController.getWorkspaces);
router.post('/workspaces/:workspaceId/members', communicationController.addMember);
router.delete('/workspaces/:workspaceId/members/:userId', communicationController.removeMember);

// Messages
router.post('/messages', communicationController.sendMessage);
router.get('/workspaces/:workspaceId/messages', communicationController.getMessages);

module.exports = router;