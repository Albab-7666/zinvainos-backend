const express = require('express');
const router = express.Router();
const rbacController = require('../controllers/rbacController');
const { authenticate } = require('../middleware/auth');
const { ceoOnly } = require('../middleware/rbac');

// All routes require authentication
router.use(authenticate);

// Public role info (authenticated users can view)
router.get('/roles', rbacController.getRoles);
router.get('/hierarchy', rbacController.getRoleHierarchy);
router.get('/matrix', rbacController.getModuleAccessMatrix);
router.get('/check', rbacController.checkPermissions);
router.get('/:role/permissions', rbacController.getRolePermissions);

// CEO only routes
router.put('/:role/permissions', ceoOnly, rbacController.updateRolePermissions);
router.post('/assign/:userId', ceoOnly, rbacController.assignRole);

module.exports = router;