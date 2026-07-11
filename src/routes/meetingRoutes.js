const express = require('express');
const router = express.Router();
const meetingController = require('../controllers/meetingController');
const { authenticate } = require('../middleware/auth');
const { checkModuleAccess } = require('../middleware/rbac');

// All routes require authentication
router.use(authenticate);
router.use(checkModuleAccess('meeting_management'));

// Meeting CRUD
router.post('/', meetingController.createMeeting);
router.get('/', meetingController.getMeetings);
router.get('/calendar', meetingController.getCalendarEvents);
router.get('/:id', meetingController.getMeeting);
router.put('/:id', meetingController.updateMeeting);
router.delete('/:id', meetingController.deleteMeeting);

// RSVP
router.post('/:id/rsvp', meetingController.rsvpMeeting);

module.exports = router;