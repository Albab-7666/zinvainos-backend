const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { authenticate } = require('../middleware/auth');
const { checkModuleAccess } = require('../middleware/rbac');

// All routes require authentication
router.use(authenticate);
router.use(checkModuleAccess('payment_tracking', 'limited'));

// Payment CRUD
router.post('/', paymentController.createPayment);
router.get('/', paymentController.getPayments);
router.get('/summary', paymentController.getPaymentSummary);
router.get('/:id', paymentController.getPayment);
router.delete('/:id', paymentController.deletePayment);

module.exports = router;