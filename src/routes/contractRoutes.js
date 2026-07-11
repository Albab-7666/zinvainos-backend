const express = require('express');
const router = express.Router();
const contractController = require('../controllers/contractController');
const { authenticate } = require('../middleware/auth');
const { checkModuleAccess } = require('../middleware/rbac');

// All routes require authentication
router.use(authenticate);
router.use(checkModuleAccess('contract_management', 'limited'));

// Contract CRUD
router.post('/', contractController.createContract);
router.get('/', contractController.getContracts);
router.get('/:id', contractController.getContract);
router.put('/:id', contractController.updateContract);
router.delete('/:id', contractController.deleteContract);

// Sign contract
router.post('/:id/sign', contractController.signContract);

module.exports = router;