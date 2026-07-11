const express = require('express');
const router = express.Router();
const performanceController = require('../controllers/performanceController');
const { authenticate } = require('../middleware/auth');
const { checkModuleAccess } = require('../middleware/rbac');

// All routes require authentication
router.use(authenticate);
router.use(checkModuleAccess('performance_evaluation', 'limited'));

// Evaluation CRUD
router.post('/', performanceController.createEvaluation);
router.get('/', performanceController.getEvaluations);
router.get('/:id', performanceController.getEvaluation);
router.put('/:id', performanceController.updateEvaluation);
router.post('/:id/submit', performanceController.submitEvaluation);

// Performance metrics
router.get('/metrics/:userId?', performanceController.getPerformanceMetrics);

module.exports = router;