const express = require('express');
const router = express.Router();
const fileController = require('../controllers/fileController');
const { authenticate } = require('../middleware/auth');
const { checkModuleAccess } = require('../middleware/rbac');

// All routes require authentication
router.use(authenticate);
router.use(checkModuleAccess('file_storage'));

// File operations
router.post('/upload', fileController.uploadFile);
router.get('/', fileController.getFiles);
router.get('/module/:moduleType/:moduleId', fileController.getFilesByModule);
router.get('/download/:id', fileController.downloadFile);
router.delete('/:id', fileController.deleteFile);
router.get('/storage/usage', fileController.getStorageUsage);

module.exports = router;