const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendanceController');
const { authenticate } = require('../middleware/auth');
const { checkModuleAccess } = require('../middleware/rbac');

// All routes require authentication
router.use(authenticate);
router.use(checkModuleAccess('attendance'));

// Attendance operations
router.post('/check-in', attendanceController.checkIn);
router.post('/check-out', attendanceController.checkOut);
router.get('/', attendanceController.getAttendance);
router.get('/summary', attendanceController.getAttendanceSummary);
router.put('/:id', attendanceController.updateAttendance);

module.exports = router;