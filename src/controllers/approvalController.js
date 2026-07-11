const { pool } = require('../config/database');
const { logger } = require('../utils/logger');

class ApprovalController {
    // Create approval request
    async createApproval(req, res) {
        try {
            const { moduleType, moduleId, comments } = req.body;
            
            const result = await pool.query(
                `INSERT INTO approvals (
                    module_type, module_id, requested_by, status, comments
                ) VALUES ($1, $2, $3, $4, $5)
                RETURNING *`,
                [moduleType, moduleId, req.user.id, 'PENDING', comments]
            );
            
            // Notify CEOs and managers
            const approvers = await pool.query(
                `SELECT id FROM users WHERE role IN ('CEO', 'TEAM_MEMBER') AND status = 'ACTIVE'`
            );
            
            for (const approver of approvers.rows) {
                await pool.query(
                    `INSERT INTO notifications (user_id, title, message, type, link, created_at)
                     VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
                    [approver.id, 'New Approval Request', 
                     `${req.user.full_name} submitted a request for approval`,
                     'APPROVAL', `/approvals/${result.rows[0].id}`]
                );
            }
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'CREATE_APPROVAL', 'APPROVAL_WORKFLOW', 
                 JSON.stringify({ approvalId: result.rows[0].id, moduleType, moduleId }), req.ip]
            );
            
            res.status(201).json({
                message: 'Approval request created',
                approval: result.rows[0]
            });
            
        } catch (error) {
            logger.error('Create approval error:', error);
            res.status(500).json({
                error: 'Failed to create approval request',
                code: 'CREATE_APPROVAL_ERROR'
            });
        }
    }

    // Get pending approvals
    async getPendingApprovals(req, res) {
        try {
            let query = `
                SELECT a.*, 
                       u.full_name as requested_by_name,
                       CASE 
                           WHEN a.module_type = 'TASK' THEN (SELECT title FROM tasks WHERE id = a.module_id)
                           WHEN a.module_type = 'PROJECT' THEN (SELECT name FROM projects WHERE id = a.module_id)
                           WHEN a.module_type = 'LEAVE' THEN (SELECT CONCAT(full_name, ' - ', leave_type) FROM leave_requests lr JOIN users u ON lr.user_id = u.id WHERE lr.id = a.module_id)
                           ELSE 'Unknown'
                       END as item_title
                FROM approvals a
                LEFT JOIN users u ON a.requested_by = u.id
                WHERE a.status = 'PENDING'
            `;
            
            // Only CEO and managers can see all pending approvals
            if (req.user.role !== 'CEO') {
                query += ` AND a.requested_by IN (
                    SELECT id FROM users WHERE created_by = $1 OR role = 'EMPLOYEE'
                )`;
            }
            
            query += ` ORDER BY a.created_at ASC`;
            
            const result = await pool.query(query, 
                req.user.role !== 'CEO' ? [req.user.id] : []
            );
            
            res.json({ approvals: result.rows });
            
        } catch (error) {
            logger.error('Get pending approvals error:', error);
            res.status(500).json({
                error: 'Failed to get pending approvals',
                code: 'GET_PENDING_APPROVALS_ERROR'
            });
        }
    }

    // Approve request
    async approveRequest(req, res) {
        try {
            const { id } = req.params;
            const { comments } = req.body;
            
            // Check if user has permission to approve
            if (req.user.role === 'EMPLOYEE') {
                return res.status(403).json({
                    error: 'Employees cannot approve requests',
                    code: 'ACCESS_DENIED'
                });
            }
            
            const result = await pool.query(
                `UPDATE approvals 
                 SET status = 'APPROVED', approved_by = $1, 
                     comments = COALESCE($2, comments), updated_at = CURRENT_TIMESTAMP
                 WHERE id = $3 AND status = 'PENDING'
                 RETURNING *`,
                [req.user.id, comments, id]
            );
            
            if (result.rows.length === 0) {
                return res.status(404).json({
                    error: 'Approval not found or already processed',
                    code: 'APPROVAL_NOT_FOUND'
                });
            }
            
            const approval = result.rows[0];
            
            // Update the actual item based on module type
            if (approval.module_type === 'TASK') {
                await pool.query(
                    'UPDATE tasks SET status = $1 WHERE id = $2',
                    ['IN_PROGRESS', approval.module_id]
                );
            } else if (approval.module_type === 'LEAVE') {
                await pool.query(
                    'UPDATE leave_requests SET status = $1, approved_by = $2, approved_at = CURRENT_TIMESTAMP WHERE id = $3',
                    ['APPROVED', req.user.id, approval.module_id]
                );
            }
            
            // Notify requester
            await pool.query(
                `INSERT INTO notifications (user_id, title, message, type, link, created_at)
                 VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
                [approval.requested_by, 'Request Approved', 
                 `Your request has been approved by ${req.user.full_name}`,
                 'APPROVAL', `/approvals/${id}`]
            );
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'APPROVE_REQUEST', 'APPROVAL_WORKFLOW', 
                 JSON.stringify({ approvalId: id }), req.ip]
            );
            
            res.json({
                message: 'Request approved successfully',
                approval: result.rows[0]
            });
            
        } catch (error) {
            logger.error('Approve request error:', error);
            res.status(500).json({
                error: 'Failed to approve request',
                code: 'APPROVE_REQUEST_ERROR'
            });
        }
    }

    // Reject request
    async rejectRequest(req, res) {
        try {
            const { id } = req.params;
            const { comments } = req.body;
            
            // Check if user has permission to reject
            if (req.user.role === 'EMPLOYEE') {
                return res.status(403).json({
                    error: 'Employees cannot reject requests',
                    code: 'ACCESS_DENIED'
                });
            }
            
            const result = await pool.query(
                `UPDATE approvals 
                 SET status = 'REJECTED', approved_by = $1, 
                     comments = COALESCE($2, comments), updated_at = CURRENT_TIMESTAMP
                 WHERE id = $3 AND status = 'PENDING'
                 RETURNING *`,
                [req.user.id, comments, id]
            );
            
            if (result.rows.length === 0) {
                return res.status(404).json({
                    error: 'Approval not found or already processed',
                    code: 'APPROVAL_NOT_FOUND'
                });
            }
            
            const approval = result.rows[0];
            
            // Update the actual item
            if (approval.module_type === 'LEAVE') {
                await pool.query(
                    'UPDATE leave_requests SET status = $1, approved_by = $2, approved_at = CURRENT_TIMESTAMP WHERE id = $3',
                    ['REJECTED', req.user.id, approval.module_id]
                );
            }
            
            // Notify requester
            await pool.query(
                `INSERT INTO notifications (user_id, title, message, type, link, created_at)
                 VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
                [approval.requested_by, 'Request Rejected', 
                 `Your request was rejected by ${req.user.full_name}. Reason: ${comments || 'No reason provided'}`,
                 'APPROVAL', `/approvals/${id}`]
            );
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'REJECT_REQUEST', 'APPROVAL_WORKFLOW', 
                 JSON.stringify({ approvalId: id }), req.ip]
            );
            
            res.json({
                message: 'Request rejected',
                approval: result.rows[0]
            });
            
        } catch (error) {
            logger.error('Reject request error:', error);
            res.status(500).json({
                error: 'Failed to reject request',
                code: 'REJECT_REQUEST_ERROR'
            });
        }
    }

    // Get approval history
    async getApprovalHistory(req, res) {
        try {
            const { limit = 100, offset = 0, status = null } = req.query;
            
            let query = `
                SELECT a.*, 
                       u.full_name as requested_by_name,
                       app.full_name as approved_by_name
                FROM approvals a
                LEFT JOIN users u ON a.requested_by = u.id
                LEFT JOIN users app ON a.approved_by = app.id
                WHERE 1=1
            `;
            let values = [];
            let paramIndex = 1;
            
            if (status) {
                query += ` AND a.status = $${paramIndex}`;
                values.push(status);
                paramIndex++;
            }
            
            // Role-based filtering
            if (req.user.role === 'EMPLOYEE') {
                query += ` AND a.requested_by = $${paramIndex}`;
                values.push(req.user.id);
                paramIndex++;
            }
            
            query += ` ORDER BY a.updated_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
            values.push(parseInt(limit), parseInt(offset));
            
            const result = await pool.query(query, values);
            res.json({ approvals: result.rows });
            
        } catch (error) {
            logger.error('Get approval history error:', error);
            res.status(500).json({
                error: 'Failed to get approval history',
                code: 'GET_APPROVAL_HISTORY_ERROR'
            });
        }
    }
}

module.exports = new ApprovalController();