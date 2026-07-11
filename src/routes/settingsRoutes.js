const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const { authenticate } = require('../middleware/auth');
const { ceoOnly } = require('../middleware/rbac');

// Public (authenticated) routes
router.get('/user', authenticate, settingsController.getUserSettings);
router.put('/user', authenticate, settingsController.updateUserSettings);

// CEO only routes
router.use(authenticate);
router.use(ceoOnly);

router.get('/company', settingsController.getCompanySettings);
router.put('/company', settingsController.updateCompanySettings);
router.get('/departments', settingsController.getDepartments);
router.put('/departments', settingsController.updateDepartments);
router.get('/system', settingsController.getSystemPreferences);
router.put('/system', settingsController.updateSystemPreferences);

module.exports = router;