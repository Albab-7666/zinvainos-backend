const { pool } = require('../config/database');
const { logger } = require('../utils/logger');

class PayrollController {
    // Create payroll record
    async createPayroll(req, res) {
        try {
            const { 
                userId, periodStart, periodEnd, 
                baseSalary, allowances = 0, deductions = 0, bonus = 0,
                notes
            } = req.body;
            
            // Only CEO can create payroll
            if (req.user.role !== 'CEO') {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            }
            
            const netPay = parseFloat(baseSalary) + parseFloat(allowances) + parseFloat(bonus) - parseFloat(deductions);
            
            const result = await pool.query(
                `INSERT INTO payroll (
                    user_id, period_start, period_end,
                    base_salary, allowances, deductions, bonus, net_pay,
                    notes, created_by, status
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                RETURNING *`,
                [userId, periodStart, periodEnd, baseSalary, 
                 allowances, deductions, bonus, netPay,
                 notes, req.user.id, 'PENDING']
            );
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'CREATE_PAYROLL', 'PAYROLL', 
                 JSON.stringify({ payrollId: result.rows[0].id, userId }), req.ip]
            );
            
            res.status(201).json({
                message: 'Payroll record created',
                payroll: result.rows[0]
            });
            
        } catch (error) {
            logger.error('Create payroll error:', error);
            res.status(500).json({
                error: 'Failed to create payroll',
                code: 'CREATE_PAYROLL_ERROR'
            });
        }
    }

    // Get payroll records
    async getPayroll(req, res) {
        try {
            const { 
                userId, periodStart, periodEnd, 
                status, limit = 100, offset = 0 
            } = req.query;
            
            // Only CEO can view payroll
            if (req.user.role !== 'CEO') {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            }
            
            let query = `
                SELECT p.*, 
                       u.full_name as employee_name,
                       u.email as employee_email,
                       creator.full_name as created_by_name
                FROM payroll p
                LEFT JOIN users u ON p.user_id = u.id
                LEFT JOIN users creator ON p.created_by = creator.id
                WHERE 1=1
            `;
            let values = [];
            let paramIndex = 1;
            
            if (userId) {
                query += ` AND p.user_id = $${paramIndex}`;
                values.push(userId);
                paramIndex++;
            }
            
            if (periodStart) {
                query += ` AND p.period_start >= $${paramIndex}`;
                values.push(periodStart);
                paramIndex++;
            }
            
            if (periodEnd) {
                query += ` AND p.period_end <= $${paramIndex}`;
                values.push(periodEnd);
                paramIndex++;
            }
            
            if (status) {
                query += ` AND p.status = $${paramIndex}`;
                values.push(status);
                paramIndex++;
            }
            
            query += ` ORDER BY p.period_end DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
            values.push(parseInt(limit), parseInt(offset));
            
            const result = await pool.query(query, values);
            
            res.json({ payroll: result.rows });
            
        } catch (error) {
            logger.error('Get payroll error:', error);
            res.status(500).json({
                error: 'Failed to get payroll',
                code: 'GET_PAYROLL_ERROR'
            });
        }
    }

    // Get payroll by ID
    async getPayrollById(req, res) {
        try {
            const { id } = req.params;
            
            // Only CEO can view payroll
            if (req.user.role !== 'CEO') {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            }
            
            const result = await pool.query(
                `SELECT p.*, 
                        u.full_name as employee_name,
                        u.email as employee_email,
                        creator.full_name as created_by_name
                 FROM payroll p
                 LEFT JOIN users u ON p.user_id = u.id
                 LEFT JOIN users creator ON p.created_by = creator.id
                 WHERE p.id = $1`,
                [id]
            );
            
            if (result.rows.length === 0) {
                return res.status(404).json({
                    error: 'Payroll record not found',
                    code: 'PAYROLL_NOT_FOUND'
                });
            }
            
            res.json({ payroll: result.rows[0] });
            
        } catch (error) {
            logger.error('Get payroll by ID error:', error);
            res.status(500).json({
                error: 'Failed to get payroll',
                code: 'GET_PAYROLL_BY_ID_ERROR'
            });
        }
    }

    // Update payroll
    async updatePayroll(req, res) {
        try {
            const { id } = req.params;
            const updates = req.body;
            
            // Only CEO can update payroll
            if (req.user.role !== 'CEO') {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            }
            
            const checkResult = await pool.query(
                'SELECT status FROM payroll WHERE id = $1',
                [id]
            );
            
            if (checkResult.rows.length === 0) {
                return res.status(404).json({
                    error: 'Payroll record not found',
                    code: 'PAYROLL_NOT_FOUND'
                });
            }
            
            if (checkResult.rows[0].status === 'PAID') {
                return res.status(400).json({
                    error: 'Cannot update paid payroll',
                    code: 'PAYROLL_PAID'
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
            
            // Recalculate net pay if base salary changed
            if (updates.base_salary || updates.allowances || updates.deductions || updates.bonus) {
                const current = await pool.query(
                    'SELECT base_salary, allowances, deductions, bonus FROM payroll WHERE id = $1',
                    [id]
                );
                const base = updates.base_salary || current.rows[0].base_salary;
                const allowances = updates.allowances || current.rows[0].allowances;
                const deductions = updates.deductions || current.rows[0].deductions;
                const bonus = updates.bonus || current.rows[0].bonus;
                
                const netPay = parseFloat(base) + parseFloat(allowances) + parseFloat(bonus) - parseFloat(deductions);
                fields.push(`net_pay = $${paramIndex}`);
                values.push(netPay);
                paramIndex++;
            }
            
            if (fields.length === 0) {
                return res.status(400).json({
                    error: 'No fields to update',
                    code: 'NO_UPDATES'
                });
            }
            
            values.push(id);
            const query = `
                UPDATE payroll 
                SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
                WHERE id = $${paramIndex}
                RETURNING *
            `;
            
            const result = await pool.query(query, values);
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'UPDATE_PAYROLL', 'PAYROLL', 
                 JSON.stringify({ payrollId: id, updates }), req.ip]
            );
            
            res.json({
                message: 'Payroll updated successfully',
                payroll: result.rows[0]
            });
            
        } catch (error) {
            logger.error('Update payroll error:', error);
            res.status(500).json({
                error: 'Failed to update payroll',
                code: 'UPDATE_PAYROLL_ERROR'
            });
        }
    }

    // Process payroll (mark as processed)
    async processPayroll(req, res) {
        try {
            const { id } = req.params;
            
            // Only CEO can process payroll
            if (req.user.role !== 'CEO') {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            }
            
            const result = await pool.query(
                `UPDATE payroll 
                 SET status = 'PROCESSED', 
                     processed_by = $1,
                     processed_at = CURRENT_TIMESTAMP,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $2
                 RETURNING *`,
                [req.user.id, id]
            );
            
            if (result.rows.length === 0) {
                return res.status(404).json({
                    error: 'Payroll record not found',
                    code: 'PAYROLL_NOT_FOUND'
                });
            }
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'PROCESS_PAYROLL', 'PAYROLL', 
                 JSON.stringify({ payrollId: id }), req.ip]
            );
            
            res.json({
                message: 'Payroll processed successfully',
                payroll: result.rows[0]
            });
            
        } catch (error) {
            logger.error('Process payroll error:', error);
            res.status(500).json({
                error: 'Failed to process payroll',
                code: 'PROCESS_PAYROLL_ERROR'
            });
        }
    }

    // Mark payroll as paid
    async markAsPaid(req, res) {
        try {
            const { id } = req.params;
            
            // Only CEO can mark as paid
            if (req.user.role !== 'CEO') {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            }
            
            const result = await pool.query(
                `UPDATE payroll 
                 SET status = 'PAID', updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1
                 RETURNING *`,
                [id]
            );
            
            if (result.rows.length === 0) {
                return res.status(404).json({
                    error: 'Payroll record not found',
                    code: 'PAYROLL_NOT_FOUND'
                });
            }
            
            // Create financial transaction
            await pool.query(
                `INSERT INTO financial_transactions (
                    type, category, amount, description, reference, created_by
                ) VALUES ($1, $2, $3, $4, $5, $6)`,
                ['EXPENSE', 'PAYROLL', result.rows[0].net_pay, 
                 `Payroll payment for ${result.rows[0].user_id}`, 
                 `PAYROLL-${id}`, req.user.id]
            );
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'MARK_PAYROLL_PAID', 'PAYROLL', 
                 JSON.stringify({ payrollId: id }), req.ip]
            );
            
            res.json({
                message: 'Payroll marked as paid',
                payroll: result.rows[0]
            });
            
        } catch (error) {
            logger.error('Mark payroll as paid error:', error);
            res.status(500).json({
                error: 'Failed to mark payroll as paid',
                code: 'MARK_PAYROLL_PAID_ERROR'
            });
        }
    }

    // Get payroll summary
    async getPayrollSummary(req, res) {
        try {
            // Only CEO can view payroll summary
            if (req.user.role !== 'CEO') {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            }
            
            const result = await pool.query(
                `SELECT 
                    COUNT(*) as total_payrolls,
                    COALESCE(SUM(net_pay), 0) as total_amount,
                    COALESCE(SUM(CASE WHEN status = 'PENDING' THEN net_pay ELSE 0 END), 0) as pending_amount,
                    COALESCE(SUM(CASE WHEN status = 'PROCESSED' THEN net_pay ELSE 0 END), 0) as processed_amount,
                    COALESCE(SUM(CASE WHEN status = 'PAID' THEN net_pay ELSE 0 END), 0) as paid_amount,
                    DATE_TRUNC('month', period_end) as month
                 FROM payroll
                 GROUP BY DATE_TRUNC('month', period_end)
                 ORDER BY month DESC
                 LIMIT 12`
            );
            
            res.json({ summary: result.rows });
            
        } catch (error) {
            logger.error('Get payroll summary error:', error);
            res.status(500).json({
                error: 'Failed to get payroll summary',
                code: 'PAYROLL_SUMMARY_ERROR'
            });
        }
    }
}

module.exports = new PayrollController();