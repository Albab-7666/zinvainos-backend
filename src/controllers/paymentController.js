const { pool } = require('../config/database');
const { logger } = require('../utils/logger');

class PaymentController {
    // Create payment
    async createPayment(req, res) {
        try {
            const { 
                invoiceId, amount, paymentMethod, 
                transactionId, notes, paymentDate = new Date()
            } = req.body;
            
            // Check if invoice exists
            const invoiceCheck = await pool.query(
                'SELECT id, total, status FROM invoices WHERE id = $1',
                [invoiceId]
            );
            
            if (invoiceCheck.rows.length === 0) {
                return res.status(404).json({
                    error: 'Invoice not found',
                    code: 'INVOICE_NOT_FOUND'
                });
            }
            
            const invoice = invoiceCheck.rows[0];
            
            // Check if payment amount is valid
            const paidResult = await pool.query(
                'SELECT COALESCE(SUM(amount), 0) as paid FROM payments WHERE invoice_id = $1',
                [invoiceId]
            );
            
            const paidAmount = parseFloat(paidResult.rows[0].paid);
            const invoiceTotal = parseFloat(invoice.total);
            const newAmount = parseFloat(amount);
            
            if (paidAmount + newAmount > invoiceTotal) {
                return res.status(400).json({
                    error: 'Payment amount exceeds invoice total',
                    code: 'PAYMENT_EXCEEDS_INVOICE'
                });
            }
            
            const result = await pool.query(
                `INSERT INTO payments (
                    invoice_id, amount, payment_method, transaction_id,
                    payment_date, notes, created_by
                ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING *`,
                [invoiceId, amount, paymentMethod, transactionId,
                 paymentDate, notes, req.user.id]
            );
            
            // Update invoice status
            const totalPaid = paidAmount + newAmount;
            let invoiceStatus = 'PARTIALLY_PAID';
            if (totalPaid >= invoiceTotal) {
                invoiceStatus = 'PAID';
            }
            
            await pool.query(
                'UPDATE invoices SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                [invoiceStatus, invoiceId]
            );
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'CREATE_PAYMENT', 'PAYMENT_TRACKING', 
                 JSON.stringify({ paymentId: result.rows[0].id, invoiceId, amount }), req.ip]
            );
            
            res.status(201).json({
                message: 'Payment recorded successfully',
                payment: result.rows[0],
                invoice: {
                    id: invoiceId,
                    status: invoiceStatus,
                    paidAmount: totalPaid,
                    remainingAmount: invoiceTotal - totalPaid
                }
            });
            
        } catch (error) {
            logger.error('Create payment error:', error);
            res.status(500).json({
                error: 'Failed to record payment',
                code: 'CREATE_PAYMENT_ERROR'
            });
        }
    }

    // Get payments
    async getPayments(req, res) {
        try {
            const { 
                invoiceId, clientId, status,
                startDate, endDate, limit = 100, offset = 0 
            } = req.query;
            
            let query = `
                SELECT p.*, 
                       i.invoice_number,
                       c.company_name as client_name,
                       u.full_name as created_by_name
                FROM payments p
                JOIN invoices i ON p.invoice_id = i.id
                JOIN clients c ON i.client_id = c.id
                LEFT JOIN users u ON p.created_by = u.id
                WHERE 1=1
            `;
            let values = [];
            let paramIndex = 1;
            
            if (invoiceId) {
                query += ` AND p.invoice_id = $${paramIndex}`;
                values.push(invoiceId);
                paramIndex++;
            }
            
            if (clientId) {
                query += ` AND i.client_id = $${paramIndex}`;
                values.push(clientId);
                paramIndex++;
            }
            
            if (startDate) {
                query += ` AND p.payment_date >= $${paramIndex}`;
                values.push(startDate);
                paramIndex++;
            }
            
            if (endDate) {
                query += ` AND p.payment_date <= $${paramIndex}`;
                values.push(endDate);
                paramIndex++;
            }
            
            // Role-based filtering
            if (req.user.role === 'EMPLOYEE') {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            } else if (req.user.role === 'TEAM_MEMBER') {
                query += ` AND (i.created_by = $${paramIndex} OR i.assigned_to = $${paramIndex})`;
                values.push(req.user.id);
                paramIndex++;
            }
            
            query += ` ORDER BY p.payment_date DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
            values.push(parseInt(limit), parseInt(offset));
            
            const result = await pool.query(query, values);
            
            // Get payment totals
            const totalsResult = await pool.query(
                `SELECT 
                    COALESCE(SUM(amount), 0) as total_paid,
                    COUNT(*) as payment_count,
                    COUNT(DISTINCT invoice_id) as invoice_count
                 FROM payments
                 WHERE 1=1 ${invoiceId ? `AND invoice_id = $${paramIndex-1}` : ''}`
            );
            
            res.json({
                payments: result.rows,
                summary: totalsResult.rows[0],
                pagination: {
                    limit: parseInt(limit),
                    offset: parseInt(offset)
                }
            });
            
        } catch (error) {
            logger.error('Get payments error:', error);
            res.status(500).json({
                error: 'Failed to get payments',
                code: 'GET_PAYMENTS_ERROR'
            });
        }
    }

    // Get payment by ID
    async getPayment(req, res) {
        try {
            const { id } = req.params;
            
            const result = await pool.query(
                `SELECT p.*, 
                        i.invoice_number,
                        c.company_name as client_name,
                        u.full_name as created_by_name
                 FROM payments p
                 JOIN invoices i ON p.invoice_id = i.id
                 JOIN clients c ON i.client_id = c.id
                 LEFT JOIN users u ON p.created_by = u.id
                 WHERE p.id = $1`,
                [id]
            );
            
            if (result.rows.length === 0) {
                return res.status(404).json({
                    error: 'Payment not found',
                    code: 'PAYMENT_NOT_FOUND'
                });
            }
            
            const payment = result.rows[0];
            
            // Check permission
            if (req.user.role === 'EMPLOYEE') {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            }
            
            res.json({ payment });
            
        } catch (error) {
            logger.error('Get payment error:', error);
            res.status(500).json({
                error: 'Failed to get payment',
                code: 'GET_PAYMENT_ERROR'
            });
        }
    }

    // Delete payment
    async deletePayment(req, res) {
        try {
            const { id } = req.params;
            
            // Only CEO can delete payments
            if (req.user.role !== 'CEO') {
                return res.status(403).json({
                    error: 'Only CEO can delete payments',
                    code: 'ACCESS_DENIED'
                });
            }
            
            const result = await pool.query(
                'DELETE FROM payments WHERE id = $1 RETURNING id, invoice_id, amount',
                [id]
            );
            
            if (result.rows.length === 0) {
                return res.status(404).json({
                    error: 'Payment not found',
                    code: 'PAYMENT_NOT_FOUND'
                });
            }
            
            const payment = result.rows[0];
            
            // Update invoice status
            const paidResult = await pool.query(
                'SELECT COALESCE(SUM(amount), 0) as paid FROM payments WHERE invoice_id = $1',
                [payment.invoice_id]
            );
            
            const totalPaid = parseFloat(paidResult.rows[0].paid);
            const invoiceResult = await pool.query(
                'SELECT total FROM invoices WHERE id = $1',
                [payment.invoice_id]
            );
            
            const invoiceTotal = parseFloat(invoiceResult.rows[0].total);
            let invoiceStatus = 'SENT';
            if (totalPaid >= invoiceTotal) {
                invoiceStatus = 'PAID';
            } else if (totalPaid > 0) {
                invoiceStatus = 'PARTIALLY_PAID';
            }
            
            await pool.query(
                'UPDATE invoices SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                [invoiceStatus, payment.invoice_id]
            );
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'DELETE_PAYMENT', 'PAYMENT_TRACKING', 
                 JSON.stringify({ paymentId: id }), req.ip]
            );
            
            res.json({
                message: 'Payment deleted successfully',
                invoiceId: payment.invoice_id,
                newStatus: invoiceStatus
            });
            
        } catch (error) {
            logger.error('Delete payment error:', error);
            res.status(500).json({
                error: 'Failed to delete payment',
                code: 'DELETE_PAYMENT_ERROR'
            });
        }
    }

    // Get payment summary
    async getPaymentSummary(req, res) {
        try {
            const result = await pool.query(
                `SELECT 
                    COALESCE(SUM(amount), 0) as total_payments,
                    COUNT(*) as total_transactions,
                    payment_method,
                    COUNT(*) as method_count,
                    COALESCE(SUM(amount), 0) as method_total
                 FROM payments
                 GROUP BY payment_method`
            );
            
            const total = result.rows.reduce((sum, row) => sum + parseFloat(row.total_payments), 0);
            
            res.json({
                summary: {
                    totalPayments: total,
                    totalTransactions: result.rows.reduce((sum, row) => sum + parseInt(row.total_transactions), 0),
                    byMethod: result.rows
                }
            });
            
        } catch (error) {
            logger.error('Get payment summary error:', error);
            res.status(500).json({
                error: 'Failed to get payment summary',
                code: 'PAYMENT_SUMMARY_ERROR'
            });
        }
    }
}

module.exports = new PaymentController();