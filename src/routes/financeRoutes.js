const express = require('express');
const router = express.Router();
const financeController = require('../controllers/financeController');
const { authenticate } = require('../middleware/auth');
const { ceoOnly } = require('../middleware/rbac');

// All routes require authentication and CEO role
router.use(authenticate);
router.use(ceoOnly);

// Financial overview
router.get('/overview', financeController.getFinancialOverview);
router.get('/profit-loss', financeController.getProfitLoss);
router.get('/balance-sheet', financeController.getBalanceSheet);

// Transactions
router.post('/transactions', financeController.createTransaction);
router.get('/transactions', financeController.getTransactions);

module.exports = router;