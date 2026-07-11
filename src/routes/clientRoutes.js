const express = require('express');
const router = express.Router();
const clientController = require('../controllers/clientController');
const { authenticate } = require('../middleware/auth');
const { checkModuleAccess } = require('../middleware/rbac');

// All routes require authentication and client module access
router.use(authenticate);
router.use(checkModuleAccess('client_crm'));

// Client CRUD
router.post('/', clientController.createClient);
router.get('/', clientController.getClients);
router.get('/:id', clientController.getClient);
router.put('/:id', clientController.updateClient);
router.delete('/:id', clientController.deleteClient);

// Assignment
router.post('/:id/assign', clientController.assignClient);

module.exports = router;