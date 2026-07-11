const { pool } = require('../config/database');
const { logger } = require('../utils/logger');

class InvoiceController {
    // Create invoice
    async createInvoice(req, res) {
        try {
            const { 
                clientId, projectId, issueDate, dueDate,
                subtotal, taxRate = 0, items, notes
            } = req.body;
            
            const invoiceNumber = `INV-${Date.now()}`;
            const total = parseFloat(subtotal) + (parseFloat(subtotal) * parseFloat(taxRate) / 100);
            
            const result = await pool.query(
                `INSERT INTO invoices (
                    invoice_number, client_id, project_id, issue_date, due_date,
                    subtotal, tax, total, items, notes, status, created_by
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                RETURNING *`,
                [invoiceNumber, clientId, projectId, issueDate, dueDate,
                 subtotal, taxRate, total, JSON.stringify(items), notes,
                 'DRAFT', req.user.id]
            );
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'CREATE_INVOICE', 'INVOICE_SYSTEM', 
                 JSON.stringify({ invoiceId: result.rows[0].id, invoiceNumber }), req.ip]
            );
            
            res.status(201).json({
                message: 'Invoice created successfully',
                invoice: result.rows[0]
            });
            
        } catch (error) {
            logger.error('Create invoice error:', error);
            res.status(500).json({
                error: 'Failed to create invoice',
                code: 'CREATE_INVOICE_ERROR'
            });
        }
    }

    // Get invoices
    async getInvoices(req, res) {
        try {
            const { 
                clientId, projectId, status, 
                startDate, endDate, limit = 100, offset = 0 
            } = req.query;
            
            let query = `
                SELECT i.*, 
                       c.company_name as client_name,
                       u.full_name as created_by_name,
                       COALESCE(SUM(p.amount), 0) as paid_amount
                FROM invoices i
                LEFT JOIN clients c ON i.client_id = c.id
                LEFT JOIN users u ON i.created_by = u.id
                LEFT JOIN payments p ON i.id = p.invoice_id
                WHERE 1=1
            `;
            let values = [];
            let paramIndex = 1;
            
            if (clientId) {
                query += ` AND i.client_id = $${paramIndex}`;
                values.push(clientId);
                paramIndex++;
            }
            
            if (projectId) {
                query += ` AND i.project_id = $${paramIndex}`;
                values.push(projectId);
                paramIndex++;
            }
            
            if (status) {
                query += ` AND i.status = $${paramIndex}`;
                values.push(status);
                paramIndex++;
            }
            
            if (startDate) {
                query += ` AND i.issue_date >= $${paramIndex}`;
                values.push(startDate);
                paramIndex++;
            }
            
            if (endDate) {
                query += ` AND i.issue_date <= $${paramIndex}`;
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
                query += ` AND i.created_by = $${paramIndex}`;
                values.push(req.user.id);
                paramIndex++;
            }
            
            query += ` GROUP BY i.id, c.company_name, u.full_name
                     ORDER BY i.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
            values.push(parseInt(limit), parseInt(offset));
            
            const result = await pool.query(query, values);
            
            // Calculate status for each invoice
            const invoices = result.rows.map(invoice => {
                const total = parseFloat(invoice.total);
                const paid = parseFloat(invoice.paid_amount);
                const balance = total - paid;
                
                let status = invoice.status;
                if (status === 'SENT' && new Date(invoice.due_date) < new Date()) {
                    status = 'OVERDUE';
                }
                
                return {
                    ...invoice,
                    currentStatus: status,
                    paidAmount: paid,
                    balanceDue: balance,
                    paymentPercentage: total > 0 ? (paid / total) * 100 : 0
                };
            });
            
            res.json({ invoices });
            
        } catch (error) {
            logger.error('Get invoices error:', error);
            res.status(500).json({
                error: 'Failed to get invoices',
                code: 'GET_INVOICES_ERROR'
            });
        }
    }

    // Get invoice by ID
    async getInvoice(req, res) {
        try {
            const { id } = req.params;
            
            const result = await pool.query(
                `SELECT i.*, 
                        c.company_name as client_name,
                        c.address as client_address,
                        c.email as client_email,
                        u.full_name as created_by_name
                 FROM invoices i
                 LEFT JOIN clients c ON i.client_id = c.id
                 LEFT JOIN users u ON i.created_by = u.id
                 WHERE i.id = $1`,
                [id]
            );
            
            if (result.rows.length === 0) {
                return res.status(404).json({
                    error: 'Invoice not found',
                    code: 'INVOICE_NOT_FOUND'
                });
            }
            
            const invoice = result.rows[0];
            
            // Check permission
            if (req.user.role === 'EMPLOYEE') {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            }
            
            // Get payments
            const payments = await pool.query(
                `SELECT p.*, u.full_name as created_by_name
                 FROM payments p
                 LEFT JOIN users u ON p.created_by = u.id
                 WHERE p.invoice_id = $1
                 ORDER BY p.payment_date DESC`,
                [id]
            );
            invoice.payments = payments.rows;
            
            // Calculate totals
            const totalPaid = payments.rows.reduce((sum, p) => sum + parseFloat(p.amount), 0);
            invoice.totalPaid = totalPaid;
            invoice.balanceDue = parseFloat(invoice.total) - totalPaid;
            
            res.json({ invoice });
            
        } catch (error) {
            logger.error('Get invoice error:', error);
            res.status(500).json({
                error: 'Failed to get invoice',
                code: 'GET_INVOICE_ERROR'
            });
        }
    }

    // Update invoice
    async updateInvoice(req, res) {
        try {
            const { id } = req.params;
            const updates = req.body;
            
            // Check if invoice exists and user has permission
            const checkResult = await pool.query(
                'SELECT created_by, status FROM invoices WHERE id = $1',
                [id]
            );
            
            if (checkResult.rows.length === 0) {
                return res.status(404).json({
                    error: 'Invoice not found',
                    code: 'INVOICE_NOT_FOUND'
                });
            }
            
            if (checkResult.rows[0].status === 'PAID') {
                return res.status(400).json({
                    error: 'Cannot update paid invoice',
                    code: 'INVOICE_PAID'
                });
            }
            
            if (req.user.role !== 'CEO' && checkResult.rows[0].created_by !== req.user.id) {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            }
            
            const fields = [];
            const values = [];
            let paramIndex = 1;
            
            for (const [key, value] of Object.entries(updates)) {
                if (value !== undefined && value !== null) {
                    fields.push(`${key} = $${paramIndex}`);
                    values.push(value);
                    paramIndex++;
                }
            }
            
            if (fields.length === 0) {
                return res.status(400).json({
                    error: 'No fields to update',
                    code: 'NO_UPDATES'
                });
            }
            
            values.push(id);
            const query = `
                UPDATE invoices 
                SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
                WHERE id = $${paramIndex}
                RETURNING *
            `;
            
            const result = await pool.query(query, values);
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'UPDATE_INVOICE', 'INVOICE_SYSTEM', 
                 JSON.stringify({ invoiceId: id, updates }), req.ip]
            );
            
            res.json({
                message: 'Invoice updated successfully',
                invoice: result.rows[0]
            });
            
        } catch (error) {
            logger.error('Update invoice error:', error);
            res.status(500).json({
                error: 'Failed to update invoice',
                code: 'UPDATE_INVOICE_ERROR'
            });
        }
    }

    // Delete invoice
    async deleteInvoice(req, res) {
        try {
            const { id } = req.params;
            
            // Only CEO can delete invoices
            if (req.user.role !== 'CEO') {
                return res.status(403).json({
                    error: 'Only CEO can delete invoices',
                    code: 'ACCESS_DENIED'
                });
            }
            
            const result = await pool.query(
                'DELETE FROM invoices WHERE id = $1 RETURNING id',
                [id]
            );
            
            if (result.rows.length === 0) {
                return res.status(404).json({
                    error: 'Invoice not found',
                    code: 'INVOICE_NOT_FOUND'
                });
            }
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'DELETE_INVOICE', 'INVOICE_SYSTEM', 
                 JSON.stringify({ invoiceId: id }), req.ip]
            );
            
            res.json({
                message: 'Invoice deleted successfully'
            });
            
        } catch (error) {
            logger.error('Delete invoice error:', error);
            res.status(500).json({
                error: 'Failed to delete invoice',
                code: 'DELETE_INVOICE_ERROR'
            });
        }
    }

    // Send invoice
    async sendInvoice(req, res) {
        try {
            const { id } = req.params;
            
            const result = await pool.query(
                `UPDATE invoices 
                 SET status = 'SENT', sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1
                 RETURNING *`,
                [id]
            );
            
            if (result.rows.length === 0) {
                return res.status(404).json({
                    error: 'Invoice not found',
                    code: 'INVOICE_NOT_FOUND'
                });
            }
            
            // TODO: Send email with invoice
            // await sendInvoiceEmail(invoice);
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'SEND_INVOICE', 'INVOICE_SYSTEM', 
                 JSON.stringify({ invoiceId: id }), req.ip]
            );
            
            res.json({
                message: 'Invoice sent successfully',
                invoice: result.rows[0]
            });
            
        } catch (error) {
            logger.error('Send invoice error:', error);
            res.status(500).json({
                error: 'Failed to send invoice',
                code: 'SEND_INVOICE_ERROR'
            });
        }
    }

    // Get invoice statistics
    async getInvoiceStats(req, res) {
        try {
            const result = await pool.query(
                `SELECT 
                    COUNT(*) as total_invoices,
                    COALESCE(SUM(total), 0) as total_amount,
                    COALESCE(SUM(CASE WHEN status = 'PAID' THEN total ELSE 0 END), 0) as paid_amount,
                    COALESCE(SUM(CASE WHEN status = 'OVERDUE' THEN total ELSE 0 END), 0) as overdue_amount,
                    COUNT(CASE WHEN status = 'PAID' THEN 1 END) as paid_count,
                    COUNT(CASE WHEN status = 'OVERDUE' THEN 1 END) as overdue_count,
                    COUNT(CASE WHEN status = 'SENT' THEN 1 END) as sent_count,
                    COUNT(CASE WHEN status = 'DRAFT' THEN 1 END) as draft_count
                 FROM invoices`
            );
            
            res.json({ stats: result.rows[0] });
            
        } catch (error) {
            logger.error('Get invoice stats error:', error);
            res.status(500).json({
                error: 'Failed to get invoice statistics',
                code: 'INVOICE_STATS_ERROR'
            });
        }
    }
}

module.exports = new InvoiceController();