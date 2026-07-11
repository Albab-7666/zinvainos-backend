const { pool } = require('../config/database');
const { logger } = require('../utils/logger');

class PerformanceController {
    // Create evaluation
    async createEvaluation(req, res) {
        try {
            const { 
                userId, periodStart, periodEnd,
                ratings, comments, goals
            } = req.body;
            
            // Only CEO and Team Members can create evaluations
            if (req.user.role === 'EMPLOYEE') {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            }
            
            const result = await pool.query(
                `INSERT INTO performance_evaluations (
                    user_id, evaluator_id, period_start, period_end,
                    ratings, comments, goals, status
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'DRAFT')
                RETURNING *`,
                [userId, req.user.id, periodStart, periodEnd,
                 JSON.stringify(ratings), comments, JSON.stringify(goals)]
            );
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'CREATE_PERFORMANCE_EVALUATION', 'PERFORMANCE_EVALUATION', 
                 JSON.stringify({ evaluationId: result.rows[0].id, userId }), req.ip]
            );
            
            res.status(201).json({
                message: 'Performance evaluation created',
                evaluation: result.rows[0]
            });
            
        } catch (error) {
            logger.error('Create evaluation error:', error);
            res.status(500).json({
                error: 'Failed to create performance evaluation',
                code: 'CREATE_EVALUATION_ERROR'
            });
        }
    }

    // Get evaluations
    async getEvaluations(req, res) {
        try {
            const { userId, status, limit = 100, offset = 0 } = req.query;
            
            let query = `
                SELECT pe.*, 
                       u.full_name as user_name,
                       e.full_name as evaluator_name
                FROM performance_evaluations pe
                LEFT JOIN users u ON pe.user_id = u.id
                LEFT JOIN users e ON pe.evaluator_id = e.id
                WHERE 1=1
            `;
            let values = [];
            let paramIndex = 1;
            
            if (userId) {
                query += ` AND pe.user_id = $${paramIndex}`;
                values.push(userId);
                paramIndex++;
            } else if (req.user.role === 'EMPLOYEE') {
                query += ` AND pe.user_id = $${paramIndex}`;
                values.push(req.user.id);
                paramIndex++;
            }
            
            if (status) {
                query += ` AND pe.status = $${paramIndex}`;
                values.push(status);
                paramIndex++;
            }
            
            query += ` ORDER BY pe.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
            values.push(parseInt(limit), parseInt(offset));
            
            const result = await pool.query(query, values);
            res.json({ evaluations: result.rows });
            
        } catch (error) {
            logger.error('Get evaluations error:', error);
            res.status(500).json({
                error: 'Failed to get evaluations',
                code: 'GET_EVALUATIONS_ERROR'
            });
        }
    }

    // Get evaluation by ID
    async getEvaluation(req, res) {
        try {
            const { id } = req.params;
            
            const result = await pool.query(
                `SELECT pe.*, 
                        u.full_name as user_name,
                        e.full_name as evaluator_name
                 FROM performance_evaluations pe
                 LEFT JOIN users u ON pe.user_id = u.id
                 LEFT JOIN users e ON pe.evaluator_id = e.id
                 WHERE pe.id = $1`,
                [id]
            );
            
            if (result.rows.length === 0) {
                return res.status(404).json({
                    error: 'Evaluation not found',
                    code: 'EVALUATION_NOT_FOUND'
                });
            }
            
            const evaluation = result.rows[0];
            
            // Check permission
            if (req.user.role === 'EMPLOYEE' && evaluation.user_id !== req.user.id) {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            }
            
            res.json({ evaluation });
            
        } catch (error) {
            logger.error('Get evaluation error:', error);
            res.status(500).json({
                error: 'Failed to get evaluation',
                code: 'GET_EVALUATION_ERROR'
            });
        }
    }

    // Update evaluation
    async updateEvaluation(req, res) {
        try {
            const { id } = req.params;
            const updates = req.body;
            
            // Check permission
            const checkResult = await pool.query(
                'SELECT evaluator_id FROM performance_evaluations WHERE id = $1',
                [id]
            );
            
            if (checkResult.rows.length === 0) {
                return res.status(404).json({
                    error: 'Evaluation not found',
                    code: 'EVALUATION_NOT_FOUND'
                });
            }
            
            if (checkResult.rows[0].evaluator_id !== req.user.id && req.user.role !== 'CEO') {
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
                UPDATE performance_evaluations 
                SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
                WHERE id = $${paramIndex}
                RETURNING *
            `;
            
            const result = await pool.query(query, values);
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'UPDATE_PERFORMANCE_EVALUATION', 'PERFORMANCE_EVALUATION', 
                 JSON.stringify({ evaluationId: id, updates }), req.ip]
            );
            
            res.json({
                message: 'Evaluation updated',
                evaluation: result.rows[0]
            });
            
        } catch (error) {
            logger.error('Update evaluation error:', error);
            res.status(500).json({
                error: 'Failed to update evaluation',
                code: 'UPDATE_EVALUATION_ERROR'
            });
        }
    }

    // Submit evaluation
    async submitEvaluation(req, res) {
        try {
            const { id } = req.params;
            
            const result = await pool.query(
                `UPDATE performance_evaluations 
                 SET status = 'SUBMITTED', submitted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1
                 RETURNING *`,
                [id]
            );
            
            if (result.rows.length === 0) {
                return res.status(404).json({
                    error: 'Evaluation not found',
                    code: 'EVALUATION_NOT_FOUND'
                });
            }
            
            const evaluation = result.rows[0];
            
            // Notify employee
            await pool.query(
                `INSERT INTO notifications (user_id, title, message, type, link, created_at)
                 VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
                [evaluation.user_id, 'Performance Evaluation Submitted', 
                 'Your performance evaluation has been submitted for review',
                 'PERFORMANCE', `/performance/${id}`]
            );
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'SUBMIT_PERFORMANCE_EVALUATION', 'PERFORMANCE_EVALUATION', 
                 JSON.stringify({ evaluationId: id }), req.ip]
            );
            
            res.json({
                message: 'Evaluation submitted',
                evaluation: result.rows[0]
            });
            
        } catch (error) {
            logger.error('Submit evaluation error:', error);
            res.status(500).json({
                error: 'Failed to submit evaluation',
                code: 'SUBMIT_EVALUATION_ERROR'
            });
        }
    }

    // Get performance metrics
    async getPerformanceMetrics(req, res) {
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
            
            // Get evaluations summary
            const evalSummary = await pool.query(
                `SELECT 
                    COUNT(*) as total,
                    AVG((ratings->>'overall')::float) as avg_overall,
                    COUNT(CASE WHEN status = 'SUBMITTED' THEN 1 END) as submitted_count
                 FROM performance_evaluations
                 WHERE user_id = $1`,
                [targetUserId]
            );
            
            // Get task completion rate
            const taskStats = await pool.query(
                `SELECT 
                    COUNT(*) as total_tasks,
                    COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) as completed_tasks,
                    CASE 
                        WHEN COUNT(*) > 0 
                        THEN (COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) * 100.0 / COUNT(*))
                        ELSE 0 
                    END as completion_rate
                 FROM tasks
                 WHERE assigned_to = $1`,
                [targetUserId]
            );
            
            // Get time tracking
            const timeStats = await pool.query(
                `SELECT 
                    COALESCE(SUM(duration_minutes), 0) as total_minutes,
                    COUNT(*) as entries_count,
                    AVG(duration_minutes) as avg_duration
                 FROM time_entries
                 WHERE user_id = $1 AND end_time IS NOT NULL
                 AND created_at >= DATE_TRUNC('month', CURRENT_DATE)`,
                [targetUserId]
            );
            
            res.json({
                userId: targetUserId,
                evaluations: evalSummary.rows[0],
                tasks: taskStats.rows[0],
                time: {
                    totalHours: (parseFloat(timeStats.rows[0].total_minutes) / 60).toFixed(2),
                    entriesCount: parseInt(timeStats.rows[0].entries_count),
                    avgDuration: parseFloat(timeStats.rows[0].avg_duration || 0)
                },
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            logger.error('Get performance metrics error:', error);
            res.status(500).json({
                error: 'Failed to get performance metrics',
                code: 'PERFORMANCE_METRICS_ERROR'
            });
        }
    }
}

module.exports = new PerformanceController();