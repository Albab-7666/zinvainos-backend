const express = require('express');
const router = express.Router();
const announcementController = require('../controllers/announcementController');
const { authenticate } = require('../middleware/auth');
const { checkModuleAccess } = require('../middleware/rbac');

// All routes require authentication
router.use(authenticate);
router.use(checkModuleAccess('announcement_board', 'limited'));

// Announcement CRUD
router.post('/', announcementController.createAnnouncement);
router.get('/', announcementController.getAnnouncements);
router.get('/:id', announcementController.getAnnouncement);
router.put('/:id', announcementController.updateAnnouncement);
router.delete('/:id', announcementController.deleteAnnouncement);

module.exports = router;