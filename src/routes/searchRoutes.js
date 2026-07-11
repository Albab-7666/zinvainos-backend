const express = require('express');
const router = express.Router();
const searchController = require('../controllers/searchController');
const { authenticate } = require('../middleware/auth');
const { checkModuleAccess } = require('../middleware/rbac');

// All routes require authentication
router.use(authenticate);
router.use(checkModuleAccess('global_search', 'limited'));

// Search
router.get('/', searchController.globalSearch);
router.post('/advanced', searchController.advancedSearch);

module.exports = router;