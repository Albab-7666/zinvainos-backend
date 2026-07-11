const express = require('express');
const router = express.Router();
const calendarController = require('../controllers/calendarController');
const { authenticate } = require('../middleware/auth');
const { checkModuleAccess } = require('../middleware/rbac');

// All routes require authentication
router.use(authenticate);
router.use(checkModuleAccess('calendar'));

// Calendar operations
router.get('/events', calendarController.getCalendarEvents);
router.post('/events', calendarController.createCalendarEvent);
router.put('/events/:id', calendarController.updateCalendarEvent);
router.delete('/events/:id', calendarController.deleteCalendarEvent);
router.post('/events/:id/rsvp', calendarController.rsvpEvent);

module.exports = router;