const express = require('express');
const router = express.Router();
const customFieldController = require('../controllers/customFieldController');
const { authenticate } = require('../middleware/auth');
const { ceoOnly } = require('../middleware/rbac');

// All routes require authentication and CEO role
router.use(authenticate);
router.use(ceoOnly);

// Custom field management
router.post('/', customFieldController.createCustomField);
router.get('/', customFieldController.getCustomFields);
router.put('/:id', customFieldController.updateCustomField);
router.delete('/:id', customFieldController.deleteCustomField);

// Custom field values
router.get('/values/:moduleType/:moduleId', customFieldController.getCustomFieldValues);
router.post('/values/:moduleType/:moduleId', customFieldController.setCustomFieldValue);

module.exports = router;