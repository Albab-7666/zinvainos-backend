const { pool } = require('../config/database');
const { logger } = require('../utils/logger');

class FinanceController {
    // Get financial overview
    async getFinancialOverview(req, res) {
        try {
            // Only CEO can access full finance
            if (req.user.role !== 'CEO') {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            }
            
            // Get revenue
            const revenueResult = await pool.query(
                `SELECT 
                    COALESCE(SUM(total), 0) as total_revenue,
                    COALESCE(SUM(CASE WHEN status = 'PAID' THEN total ELSE 0 END), 0) as paid_revenue,
                    COALESCE(SUM(CASE WHEN status = 'OVERDUE' THEN total ELSE 0 END), 0) as overdue_revenue,
                    COALESCE(SUM(CASE WHEN status = 'SENT' THEN total ELSE 0 END), 0) as pending_revenue
                 FROM invoices`
            );
            
            // Get expenses (from payroll + other)
            const expenseResult = await pool.query(
                `SELECT 
                    COALESCE(SUM(net_pay), 0) as payroll_expenses
                 FROM payroll WHERE status = 'PAID'`
            );
            
            // Get profit/loss
            const totalRevenue = parseFloat(revenueResult.rows[0].total_revenue);
            const totalExpenses = parseFloat(expenseResult.rows[0].payroll_expenses);
            const profit = totalRevenue - totalExpenses;
            
            // Get monthly revenue trend
            const monthlyRevenue = await pool.query(
                `SELECT 
                    DATE_TRUNC('month', issue_date) as month,
                    COALESCE(SUM(total), 0) as revenue,
                    COUNT(*) as invoice_count
                 FROM invoices 
                 WHERE issue_date >= DATE_TRUNC('year', CURRENT_DATE)
                 GROUP BY DATE_TRUNC('month', issue_date)
                 ORDER BY month DESC`
            );
            
            res.json({
                overview: {
                    totalRevenue,
                    paidRevenue: parseFloat(revenueResult.rows[0].paid_revenue),
                    overdueRevenue: parseFloat(revenueResult.rows[0].overdue_revenue),
                    pendingRevenue: parseFloat(revenueResult.rows[0].pending_revenue),
                    totalExpenses,
                    profit,
                    profitMargin: totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0
                },
                monthlyRevenue: monthlyRevenue.rows,
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            logger.error('Get financial overview error:', error);
            res.status(500).json({
                error: 'Failed to get financial overview',
                code: 'FINANCIAL_OVERVIEW_ERROR'
            });
        }
    }

    // Get profit/loss statement
    async getProfitLoss(req, res) {
        try {
            // Only CEO can access
            if (req.user.role !== 'CEO') {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            }
            
            const { period = 'month' } = req.query;
            
            let dateTrunc;
            if (period === 'quarter') {
                dateTrunc = "DATE_TRUNC('quarter', issue_date)";
            } else if (period === 'year') {
                dateTrunc = "DATE_TRUNC('year', issue_date)";
            } else {
                dateTrunc = "DATE_TRUNC('month', issue_date)";
            }
            
            const result = await pool.query(
                `SELECT 
                    ${dateTrunc} as period,
                    COALESCE(SUM(CASE WHEN type = 'REVENUE' THEN amount ELSE 0 END), 0) as revenue,
                    COALESCE(SUM(CASE WHEN type = 'EXPENSE' THEN amount ELSE 0 END), 0) as expenses,
                    COALESCE(SUM(CASE WHEN type = 'REVENUE' THEN amount ELSE -amount END), 0) as profit
                 FROM financial_transactions
                 GROUP BY period
                 ORDER BY period DESC
                 LIMIT 12`
            );
            
            res.json({ profitLoss: result.rows });
            
        } catch (error) {
            logger.error('Get profit/loss error:', error);
            res.status(500).json({
                error: 'Failed to get profit/loss statement',
                code: 'PROFIT_LOSS_ERROR'
            });
        }
    }

    // Create transaction
    async createTransaction(req, res) {
        try {
            // Only CEO can create transactions
            if (req.user.role !== 'CEO') {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            }
            
            const { type, category, amount, description, reference } = req.body;
            
            const result = await pool.query(
                `INSERT INTO financial_transactions (
                    type, category, amount, description, reference, created_by
                ) VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING *`,
                [type, category, amount, description, reference, req.user.id]
            );
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'CREATE_TRANSACTION', 'FINANCE_ACCOUNTING', 
                 JSON.stringify({ transactionId: result.rows[0].id }), req.ip]
            );
            
            res.status(201).json({
                message: 'Transaction created successfully',
                transaction: result.rows[0]
            });
            
        } catch (error) {
            logger.error('Create transaction error:', error);
            res.status(500).json({
                error: 'Failed to create transaction',
                code: 'CREATE_TRANSACTION_ERROR'
            });
        }
    }

    // Get transactions
    async getTransactions(req, res) {
        try {
            // Only CEO can access
            if (req.user.role !== 'CEO') {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            }
            
            const { 
                type, category, startDate, endDate, 
                limit = 100, offset = 0 
            } = req.query;
            
            let query = `
                SELECT ft.*, u.full_name as created_by_name
                FROM financial_transactions ft
                LEFT JOIN users u ON ft.created_by = u.id
                WHERE 1=1
            `;
            let values = [];
            let paramIndex = 1;
            
            if (type) {
                query += ` AND ft.type = $${paramIndex}`;
                values.push(type);
                paramIndex++;
            }
            
            if (category) {
                query += ` AND ft.category = $${paramIndex}`;
                values.push(category);
                paramIndex++;
            }
            
            if (startDate) {
                query += ` AND ft.created_at >= $${paramIndex}`;
                values.push(startDate);
                paramIndex++;
            }
            
            if (endDate) {
                query += ` AND ft.created_at <= $${paramIndex}`;
                values.push(endDate);
                paramIndex++;
            }
            
            query += ` ORDER BY ft.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
            values.push(parseInt(limit), parseInt(offset));
            
            const result = await pool.query(query, values);
            res.json({ transactions: result.rows });
            
        } catch (error) {
            logger.error('Get transactions error:', error);
            res.status(500).json({
                error: 'Failed to get transactions',
                code: 'GET_TRANSACTIONS_ERROR'
            });
        }
    }

    // Get balance sheet
    async getBalanceSheet(req, res) {
        try {
            // Only CEO can access
            if (req.user.role !== 'CEO') {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            }
            
            // Assets (invoices, payments)
            const assets = await pool.query(
                `SELECT 
                    COALESCE(SUM(total), 0) as accounts_receivable,
                    COALESCE(SUM(CASE WHEN status = 'PAID' THEN total ELSE 0 END), 0) as cash
                 FROM invoices`
            );
            
            // Liabilities (pending payments, etc.)
            const liabilities = await pool.query(
                `SELECT 
                    COALESCE(SUM(total), 0) as accounts_payable
                 FROM invoices WHERE status = 'OVERDUE'`
            );
            
            // Equity
            const equity = await pool.query(
                `SELECT 
                    COALESCE(SUM(amount), 0) as retained_earnings
                 FROM financial_transactions WHERE type = 'REVENUE'`
            );
            
            res.json({
                assets: {
                    accountsReceivable: parseFloat(assets.rows[0].accounts_receivable),
                    cash: parseFloat(assets.rows[0].cash),
                    totalAssets: parseFloat(assets.rows[0].accounts_receivable) + parseFloat(assets.rows[0].cash)
                },
                liabilities: {
                    accountsPayable: parseFloat(liabilities.rows[0].accounts_payable),
                    totalLiabilities: parseFloat(liabilities.rows[0].accounts_payable)
                },
                equity: {
                    retainedEarnings: parseFloat(equity.rows[0].retained_earnings),
                    totalEquity: parseFloat(equity.rows[0].retained_earnings)
                },
                summary: {
                    totalAssets: parseFloat(assets.rows[0].accounts_receivable) + parseFloat(assets.rows[0].cash),
                    totalLiabilities: parseFloat(liabilities.rows[0].accounts_payable),
                    totalEquity: parseFloat(equity.rows[0].retained_earnings)
                },
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            logger.error('Get balance sheet error:', error);
            res.status(500).json({
                error: 'Failed to get balance sheet',
                code: 'BALANCE_SHEET_ERROR'
            });
        }
    }
}

module.exports = new FinanceController();