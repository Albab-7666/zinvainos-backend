const express = require('express');
const router = express.Router();
const importExportController = require('../controllers/importExportController');
const { authenticate } = require('../middleware/auth');
const { checkModuleAccess } = require('../middleware/rbac');
const multer = require('multer');

const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// All routes require authentication
router.use(authenticate);
router.use(checkModuleAccess('import_export', 'limited'));

// Export
router.get('/export', importExportController.exportData);
router.get('/export/backup', importExportController.exportBackup);

// Import
router.post('/import', upload.single('file'), importExportController.importData);
router.post('/import/backup', importExportController.importBackup);

module.exports = router;