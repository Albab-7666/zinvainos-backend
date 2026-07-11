const express = require('express');
const router = express.Router();
const payrollController = require('../controllers/payrollController');
const { authenticate } = require('../middleware/auth');
const { ceoOnly } = require('../middleware/rbac');

// All routes require authentication and CEO role
router.use(authenticate);
router.use(ceoOnly);

// Payroll CRUD
router.post('/', payrollController.createPayroll);
router.get('/', payrollController.getPayroll);
router.get('/summary', payrollController.getPayrollSummary);
router.get('/:id', payrollController.getPayrollById);
router.put('/:id', payrollController.updatePayroll);
router.post('/:id/process', payrollController.processPayroll);
router.post('/:id/pay', payrollController.markAsPaid);

module.exports = router;