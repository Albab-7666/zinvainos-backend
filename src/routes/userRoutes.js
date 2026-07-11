const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticate } = require('../middleware/auth');
const { requireRole, ceoOnly } = require('../middleware/rbac');

// All routes require authentication
router.use(authenticate);

// User management
router.get('/', userController.getUsers);
router.get('/pending', userController.getPendingUsers);
router.get('/departments', userController.getDepartments);
router.get('/roles', userController.getRoles);
router.get('/:id', userController.getUser);

// CEO only routes
router.post('/', ceoOnly, userController.createUser);
router.put('/:id', userController.updateUser);
router.delete('/:id', ceoOnly, userController.deleteUser);
router.post('/:id/suspend', ceoOnly, userController.suspendUser);
router.post('/:id/restore', ceoOnly, userController.restoreUser);
router.post('/:id/reset-password', ceoOnly, userController.resetPassword);
router.post('/:id/approve', ceoOnly, userController.approveUser);

module.exports = router;