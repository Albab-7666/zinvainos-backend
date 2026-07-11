const express = require('express');
const router = express.Router();
const invoiceController = require('../controllers/invoiceController');
const { authenticate } = require('../middleware/auth');
const { checkModuleAccess } = require('../middleware/rbac');

// All routes require authentication
router.use(authenticate);
router.use(checkModuleAccess('invoice_system', 'limited'));

// Invoice CRUD
router.post('/', invoiceController.createInvoice);
router.get('/', invoiceController.getInvoices);
router.get('/stats', invoiceController.getInvoiceStats);
router.get('/:id', invoiceController.getInvoice);
router.put('/:id', invoiceController.updateInvoice);
router.delete('/:id', invoiceController.deleteInvoice);
router.post('/:id/send', invoiceController.sendInvoice);

module.exports = router;