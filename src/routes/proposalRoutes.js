const express = require('express');
const router = express.Router();
const proposalController = require('../controllers/proposalController');
const { authenticate } = require('../middleware/auth');
const { checkModuleAccess } = require('../middleware/rbac');

// All routes require authentication
router.use(authenticate);
router.use(checkModuleAccess('proposal_quotation', 'limited'));

// Proposal CRUD
router.post('/', proposalController.createProposal);
router.get('/', proposalController.getProposals);
router.get('/:id', proposalController.getProposal);
router.put('/:id', proposalController.updateProposal);
router.delete('/:id', proposalController.deleteProposal);

// Conversion
router.post('/:id/convert', proposalController.convertToInvoice);

module.exports = router;