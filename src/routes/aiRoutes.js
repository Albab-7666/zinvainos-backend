const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');
const { authenticate } = require('../middleware/auth');
const { checkModuleAccess } = require('../middleware/rbac');

// All routes require authentication
router.use(authenticate);
router.use(checkModuleAccess('ai_assistant', 'limited'));

// AI features
router.get('/insights', aiController.getInsights);
router.get('/recommendations', aiController.getRecommendations);
router.post('/chat', aiController.chat);
router.get('/analytics', aiController.getAnalytics);

module.exports = router;