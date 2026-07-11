const { pool } = require('../config/database');
const { logger } = require('../utils/logger');

class LeaveController {
    // Create leave request
    async createLeaveRequest(req, res) {
        try {
            const { leaveType, startDate, endDate, reason } = req.body;
            
            // Check for overlapping leave requests
            const overlapping = await pool.query(
                `SELECT id FROM leave_requests 
                 WHERE user_id = $1 
                 AND status IN ('PENDING', 'APPROVED')
                 AND (start_date, end_date) OVERLAPS ($2, $3)`,
                [req.user.id, startDate, endDate]
            );
            
            if (overlapping.rows.length > 0) {
                return res.status(400).json({
                    error: 'You have overlapping leave requests',
                    code: 'OVERLAPPING_LEAVE'
                });
            }
            
            const result = await pool.query(
                `INSERT INTO leave_requests (
                    user_id, leave_type, start_date, end_date, reason, status
                ) VALUES ($1, $2, $3, $4, $5, 'PENDING')
                RETURNING *`,
                [req.user.id, leaveType, startDate, endDate, reason]
            );
            
            // Notify managers and CEO
            const managers = await pool.query(
                `SELECT id FROM users WHERE role IN ('CEO', 'TEAM_MEMBER') AND status = 'ACTIVE'`
            );
            
            for (const manager of managers.rows) {
                await pool.query(
                    `INSERT INTO notifications (user_id, title, message, type, link, created_at)
                     VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
                    [manager.id, 'New Leave Request', 
                     `${req.user.full_name} requested ${leaveType} leave from ${startDate} to ${endDate}`,
                     'LEAVE', `/leave/${result.rows[0].id}`]
                );
            }
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'CREATE_LEAVE_REQUEST', 'LEAVE_MANAGEMENT', 
                 JSON.stringify({ leaveId: result.rows[0].id, leaveType }), req.ip]
            );
            
            res.status(201).json({
                message: 'Leave request submitted',
                leaveRequest: result.rows[0]
            });
            
        } catch (error) {
            logger.error('Create leave request error:', error);
            res.status(500).json({
                error: 'Failed to create leave request',
                code: 'CREATE_LEAVE_ERROR'
            });
        }
    }

    // Get leave requests
    async getLeaveRequests(req, res) {
        try {
            const { 
                userId, status, leaveType, 
                startDate, endDate, limit = 100, offset = 0 
            } = req.query;
            
            let query = `
                SELECT lr.*, 
                       u.full_name as user_name,
                       u.email as user_email,
                       approver.full_name as approved_by_name
                FROM leave_requests lr
                LEFT JOIN users u ON lr.user_id = u.id
                LEFT JOIN users approver ON lr.approved_by = approver.id
                WHERE 1=1
            `;
            let values = [];
            let paramIndex = 1;
            
            if (userId) {
                query += ` AND lr.user_id = $${paramIndex}`;
                values.push(userId);
                paramIndex++;
            } else if (req.user.role === 'EMPLOYEE') {
                query += ` AND lr.user_id = $${paramIndex}`;
                values.push(req.user.id);
                paramIndex++;
            }
            
            if (status) {
                query += ` AND lr.status = $${paramIndex}`;
                values.push(status);
                paramIndex++;
            }
            
            if (leaveType) {
                query += ` AND lr.leave_type = $${paramIndex}`;
                values.push(leaveType);
                paramIndex++;
            }
            
            if (startDate) {
                query += ` AND lr.start_date >= $${paramIndex}`;
                values.push(startDate);
                paramIndex++;
            }
            
            if (endDate) {
                query += ` AND lr.end_date <= $${paramIndex}`;
                values.push(endDate);
                paramIndex++;
            }
            
            query += ` ORDER BY lr.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
            values.push(parseInt(limit), parseInt(offset));
            
            const result = await pool.query(query, values);
            
            // Calculate duration for each leave
            const leaveRequests = result.rows.map(lr => {
                const start = new Date(lr.start_date);
                const end = new Date(lr.end_date);
                const duration = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
                return { ...lr, duration };
            });
            
            res.json({ leaveRequests });
            
        } catch (error) {
            logger.error('Get leave requests error:', error);
            res.status(500).json({
                error: 'Failed to get leave requests',
                code: 'GET_LEAVE_ERROR'
            });
        }
    }

    // Get leave request by ID
    async getLeaveRequest(req, res) {
        try {
            const { id } = req.params;
            
            const result = await pool.query(
                `SELECT lr.*, 
                        u.full_name as user_name,
                        approver.full_name as approved_by_name
                 FROM leave_requests lr
                 LEFT JOIN users u ON lr.user_id = u.id
                 LEFT JOIN users approver ON lr.approved_by = approver.id
                 WHERE lr.id = $1`,
                [id]
            );
            
            if (result.rows.length === 0) {
                return res.status(404).json({
                    error: 'Leave request not found',
                    code: 'LEAVE_NOT_FOUND'
                });
            }
            
            const leaveRequest = result.rows[0];
            
            // Check permission
            if (req.user.role === 'EMPLOYEE' && leaveRequest.user_id !== req.user.id) {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            }
            
            const start = new Date(leaveRequest.start_date);
            const end = new Date(leaveRequest.end_date);
            leaveRequest.duration = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
            
            res.json({ leaveRequest });
            
        } catch (error) {
            logger.error('Get leave request error:', error);
            res.status(500).json({
                error: 'Failed to get leave request',
                code: 'GET_LEAVE_BY_ID_ERROR'
            });
        }
    }

    // Update leave request
    async updateLeaveRequest(req, res) {
        try {
            const { id } = req.params;
            const updates = req.body;
            
            // Check if user owns the leave request
            const checkResult = await pool.query(
                'SELECT user_id, status FROM leave_requests WHERE id = $1',
                [id]
            );
            
            if (checkResult.rows.length === 0) {
                return res.status(404).json({
                    error: 'Leave request not found',
                    code: 'LEAVE_NOT_FOUND'
                });
            }
            
            if (checkResult.rows[0].user_id !== req.user.id && req.user.role !== 'CEO') {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            }
            
            if (checkResult.rows[0].status !== 'PENDING') {
                return res.status(400).json({
                    error: 'Cannot update non-pending leave request',
                    code: 'LEAVE_NOT_PENDING'
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
                UPDATE leave_requests 
                SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
                WHERE id = $${paramIndex}
                RETURNING *
            `;
            
            const result = await pool.query(query, values);
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'UPDATE_LEAVE_REQUEST', 'LEAVE_MANAGEMENT', 
                 JSON.stringify({ leaveId: id, updates }), req.ip]
            );
            
            res.json({
                message: 'Leave request updated',
                leaveRequest: result.rows[0]
            });
            
        } catch (error) {
            logger.error('Update leave request error:', error);
            res.status(500).json({
                error: 'Failed to update leave request',
                code: 'UPDATE_LEAVE_ERROR'
            });
        }
    }

    // Delete leave request
    async deleteLeaveRequest(req, res) {
        try {
            const { id } = req.params;
            
            // Check if user owns the leave request
            const checkResult = await pool.query(
                'SELECT user_id, status FROM leave_requests WHERE id = $1',
                [id]
            );
            
            if (checkResult.rows.length === 0) {
                return res.status(404).json({
                    error: 'Leave request not found',
                    code: 'LEAVE_NOT_FOUND'
                });
            }
            
            if (checkResult.rows[0].user_id !== req.user.id && req.user.role !== 'CEO') {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            }
            
            if (checkResult.rows[0].status === 'APPROVED') {
                return res.status(400).json({
                    error: 'Cannot delete approved leave request',
                    code: 'LEAVE_APPROVED'
                });
            }
            
            const result = await pool.query(
                'DELETE FROM leave_requests WHERE id = $1 RETURNING id',
                [id]
            );
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'DELETE_LEAVE_REQUEST', 'LEAVE_MANAGEMENT', 
                 JSON.stringify({ leaveId: id }), req.ip]
            );
            
            res.json({
                message: 'Leave request deleted'
            });
            
        } catch (error) {
            logger.error('Delete leave request error:', error);
            res.status(500).json({
                error: 'Failed to delete leave request',
                code: 'DELETE_LEAVE_ERROR'
            });
        }
    }

    // Approve leave request
    async approveLeave(req, res) {
        try {
            const { id } = req.params;
            
            // Only CEO and Team Members can approve
            if (req.user.role === 'EMPLOYEE') {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            }
            
            const result = await pool.query(
                `UPDATE leave_requests 
                 SET status = 'APPROVED', 
                     approved_by = $1,
                     approved_at = CURRENT_TIMESTAMP,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $2
                 RETURNING *`,
                [req.user.id, id]
            );
            
            if (result.rows.length === 0) {
                return res.status(404).json({
                    error: 'Leave request not found',
                    code: 'LEAVE_NOT_FOUND'
                });
            }
            
            const leaveRequest = result.rows[0];
            
            // Notify user
            await pool.query(
                `INSERT INTO notifications (user_id, title, message, type, link, created_at)
                 VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
                [leaveRequest.user_id, 'Leave Approved', 
                 `Your ${leaveRequest.leave_type} leave request has been approved`,
                 'LEAVE', `/leave/${id}`]
            );
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'APPROVE_LEAVE', 'LEAVE_MANAGEMENT', 
                 JSON.stringify({ leaveId: id }), req.ip]
            );
            
            res.json({
                message: 'Leave request approved',
                leaveRequest: result.rows[0]
            });
            
        } catch (error) {
            logger.error('Approve leave error:', error);
            res.status(500).json({
                error: 'Failed to approve leave',
                code: 'APPROVE_LEAVE_ERROR'
            });
        }
    }

    // Reject leave request
    async rejectLeave(req, res) {
        try {
            const { id } = req.params;
            const { comments } = req.body;
            
            // Only CEO and Team Members can reject
            if (req.user.role === 'EMPLOYEE') {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            }
            
            const result = await pool.query(
                `UPDATE leave_requests 
                 SET status = 'REJECTED', 
                     approved_by = $1,
                     approved_at = CURRENT_TIMESTAMP,
                     comments = COALESCE($2, comments),
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $3
                 RETURNING *`,
                [req.user.id, comments, id]
            );
            
            if (result.rows.length === 0) {
                return res.status(404).json({
                    error: 'Leave request not found',
                    code: 'LEAVE_NOT_FOUND'
                });
            }
            
            const leaveRequest = result.rows[0];
            
            // Notify user
            await pool.query(
                `INSERT INTO notifications (user_id, title, message, type, link, created_at)
                 VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
                [leaveRequest.user_id, 'Leave Rejected', 
                 `Your ${leaveRequest.leave_type} leave request was rejected${comments ? ': ' + comments : ''}`,
                 'LEAVE', `/leave/${id}`]
            );
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'REJECT_LEAVE', 'LEAVE_MANAGEMENT', 
                 JSON.stringify({ leaveId: id }), req.ip]
            );
            
            res.json({
                message: 'Leave request rejected',
                leaveRequest: result.rows[0]
            });
            
        } catch (error) {
            logger.error('Reject leave error:', error);
            res.status(500).json({
                error: 'Failed to reject leave',
                code: 'REJECT_LEAVE_ERROR'
            });
        }
    }

    // Get leave balance
    async getLeaveBalance(req, res) {
        try {
            const { userId } = req.params;
            
            const targetUserId = userId || req.user.id;
            
            // Check permission
            if (req.user.role === 'EMPLOYEE' && targetUserId !== req.user.id) {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            }
            
            // Get approved leaves
            const leaveResult = await pool.query(
                `SELECT 
                    leave_type,
                    COUNT(*) as used_count,
                    SUM((end_date - start_date) + 1) as used_days
                 FROM leave_requests 
                 WHERE user_id = $1 AND status = 'APPROVED'
                 GROUP BY leave_type`,
                [targetUserId]
            );
            
            // Calculate balance based on leave type
            const balances = {
                ANNUAL: { total: 20, used: 0, remaining: 20 },
                SICK: { total: 10, used: 0, remaining: 10 },
                PERSONAL: { total: 5, used: 0, remaining: 5 },
                MATERNITY: { total: 90, used: 0, remaining: 90 },
                OTHER: { total: 0, used: 0, remaining: 0 }
            };
            
            for (const row of leaveResult.rows) {
                if (balances[row.leave_type]) {
                    balances[row.leave_type].used = parseInt(row.used_days);
                    balances[row.leave_type].remaining = balances[row.leave_type].total - parseInt(row.used_days);
                }
            }
            
            res.json({ balances });
            
        } catch (error) {
            logger.error('Get leave balance error:', error);
            res.status(500).json({
                error: 'Failed to get leave balance',
                code: 'LEAVE_BALANCE_ERROR'
            });
        }
    }
}

module.exports = new LeaveController();