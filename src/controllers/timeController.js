const { pool } = require('../config/database');
const { logger } = require('../utils/logger');

class TimeController {
    // Start time tracking
    async startTracking(req, res) {
        try {
            const { taskId, projectId, description } = req.body;
            
            // Check if user already has active time entry
            const activeCheck = await pool.query(
                'SELECT id FROM time_entries WHERE user_id = $1 AND end_time IS NULL',
                [req.user.id]
            );
            
            if (activeCheck.rows.length > 0) {
                return res.status(400).json({
                    error: 'You already have an active time entry',
                    code: 'ACTIVE_ENTRY_EXISTS'
                });
            }
            
            const result = await pool.query(
                `INSERT INTO time_entries (user_id, task_id, project_id, start_time, description)
                 VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4)
                 RETURNING *`,
                [req.user.id, taskId, projectId, description]
            );
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'START_TIME_TRACKING', 'TIME_TRACKING', 
                 JSON.stringify({ entryId: result.rows[0].id }), req.ip]
            );
            
            res.json({
                message: 'Time tracking started',
                entry: result.rows[0]
            });
            
        } catch (error) {
            logger.error('Start tracking error:', error);
            res.status(500).json({
                error: 'Failed to start time tracking',
                code: 'START_TRACKING_ERROR'
            });
        }
    }

    // Stop time tracking
    async stopTracking(req, res) {
        try {
            const { id } = req.params;
            
            const result = await pool.query(
                `UPDATE time_entries 
                 SET end_time = CURRENT_TIMESTAMP,
                     duration_minutes = EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - start_time)) / 60
                 WHERE id = $1 AND user_id = $2 AND end_time IS NULL
                 RETURNING *`,
                [id, req.user.id]
            );
            
            if (result.rows.length === 0) {
                return res.status(404).json({
                    error: 'Active time entry not found',
                    code: 'ENTRY_NOT_FOUND'
                });
            }
            
            // Update task actual hours
            if (result.rows[0].task_id) {
                await pool.query(
                    `UPDATE tasks 
                     SET actual_hours = COALESCE(actual_hours, 0) + $1
                     WHERE id = $2`,
                    [result.rows[0].duration_minutes / 60, result.rows[0].task_id]
                );
            }
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'STOP_TIME_TRACKING', 'TIME_TRACKING', 
                 JSON.stringify({ entryId: id, duration: result.rows[0].duration_minutes }), req.ip]
            );
            
            res.json({
                message: 'Time tracking stopped',
                entry: result.rows[0]
            });
            
        } catch (error) {
            logger.error('Stop tracking error:', error);
            res.status(500).json({
                error: 'Failed to stop time tracking',
                code: 'STOP_TRACKING_ERROR'
            });
        }
    }

    // Get time entries
    async getTimeEntries(req, res) {
        try {
            const { 
                userId, taskId, projectId, 
                startDate, endDate, limit = 100, offset = 0 
            } = req.query;
            
            let query = `
                SELECT te.*, 
                       u.full_name as user_name,
                       t.title as task_title,
                       p.name as project_name
                FROM time_entries te
                LEFT JOIN users u ON te.user_id = u.id
                LEFT JOIN tasks t ON te.task_id = t.id
                LEFT JOIN projects p ON te.project_id = p.id
                WHERE 1=1
            `;
            let values = [];
            let paramIndex = 1;
            
            if (userId) {
                query += ` AND te.user_id = $${paramIndex}`;
                values.push(userId);
                paramIndex++;
            }
            
            if (taskId) {
                query += ` AND te.task_id = $${paramIndex}`;
                values.push(taskId);
                paramIndex++;
            }
            
            if (projectId) {
                query += ` AND te.project_id = $${paramIndex}`;
                values.push(projectId);
                paramIndex++;
            }
            
            if (startDate) {
                query += ` AND te.start_time >= $${paramIndex}`;
                values.push(startDate);
                paramIndex++;
            }
            
            if (endDate) {
                query += ` AND te.start_time <= $${paramIndex}`;
                values.push(endDate);
                paramIndex++;
            }
            
            // Role-based filtering
            if (req.user.role === 'EMPLOYEE') {
                query += ` AND te.user_id = $${paramIndex}`;
                values.push(req.user.id);
                paramIndex++;
            } else if (req.user.role === 'TEAM_MEMBER') {
                query += ` AND (te.user_id = $${paramIndex} OR te.user_id IN (
                    SELECT id FROM users WHERE role = 'EMPLOYEE'
                ))`;
                values.push(req.user.id);
                paramIndex++;
            }
            
            query += ` ORDER BY te.start_time DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
            values.push(parseInt(limit), parseInt(offset));
            
            const result = await pool.query(query, values);
            res.json({ entries: result.rows });
            
        } catch (error) {
            logger.error('Get time entries error:', error);
            res.status(500).json({
                error: 'Failed to get time entries',
                code: 'GET_ENTRIES_ERROR'
            });
        }
    }

    // Get time report
    async getTimeReport(req, res) {
        try {
            const { period = 'week', userId } = req.query;
            
            let dateFilter = '';
            if (period === 'week') {
                dateFilter = "date_trunc('week', start_time)";
            } else if (period === 'month') {
                dateFilter = "date_trunc('month', start_time)";
            } else {
                dateFilter = "date_trunc('day', start_time)";
            }
            
            let query = `
                SELECT 
                    ${dateFilter} as period,
                    user_id,
                    COUNT(*) as entries_count,
                    COALESCE(SUM(duration_minutes), 0) as total_minutes,
                    COALESCE(SUM(duration_minutes) / 60, 0) as total_hours
                FROM time_entries
                WHERE end_time IS NOT NULL
            `;
            let values = [];
            let paramIndex = 1;
            
            if (userId) {
                query += ` AND user_id = $${paramIndex}`;
                values.push(userId);
                paramIndex++;
            } else if (req.user.role === 'EMPLOYEE') {
                query += ` AND user_id = $${paramIndex}`;
                values.push(req.user.id);
                paramIndex++;
            }
            
            query += ` GROUP BY period, user_id
                     ORDER BY period DESC`;
            
            const result = await pool.query(query, values);
            
            // Get user names
            const reports = await Promise.all(result.rows.map(async (row) => {
                const userResult = await pool.query(
                    'SELECT full_name FROM users WHERE id = $1',
                    [row.user_id]
                );
                row.user_name = userResult.rows[0]?.full_name || 'Unknown';
                return row;
            }));
            
            res.json({ report: reports });
            
        } catch (error) {
            logger.error('Get time report error:', error);
            res.status(500).json({
                error: 'Failed to get time report',
                code: 'TIME_REPORT_ERROR'
            });
        }
    }

    // Get productivity metrics
    async getProductivityMetrics(req, res) {
        try {
            const userId = req.user.id;
            const role = req.user.role;
            
            let userFilter = '';
            let values = [];
            let paramIndex = 1;
            
            if (role === 'EMPLOYEE') {
                userFilter = `AND user_id = $${paramIndex}`;
                values.push(userId);
                paramIndex++;
            } else if (role === 'TEAM_MEMBER') {
                userFilter = `AND user_id IN (
                    SELECT id FROM users WHERE role = 'EMPLOYEE' OR created_by = $${paramIndex}
                )`;
                values.push(userId);
                paramIndex++;
            }
            
            const query = `
                WITH daily_stats AS (
                    SELECT 
                        user_id,
                        DATE(start_time) as day,
                        COUNT(*) as task_count,
                        COALESCE(SUM(duration_minutes), 0) as total_minutes
                    FROM time_entries
                    WHERE end_time IS NOT NULL
                    ${userFilter}
                    AND start_time >= DATE_TRUNC('month', CURRENT_DATE)
                    GROUP BY user_id, DATE(start_time)
                )
                SELECT 
                    user_id,
                    u.full_name,
                    COUNT(DISTINCT day) as active_days,
                    COALESCE(SUM(task_count), 0) as total_tasks,
                    COALESCE(SUM(total_minutes), 0) as total_minutes,
                    COALESCE(SUM(total_minutes) / NULLIF(COUNT(DISTINCT day), 0), 0) as avg_minutes_per_day,
                    COALESCE(SUM(total_minutes) / 60, 0) as total_hours
                FROM daily_stats ds
                LEFT JOIN users u ON ds.user_id = u.id
                GROUP BY user_id, u.full_name
                ORDER BY total_minutes DESC
            `;
            
            const result = await pool.query(query, values);
            
            res.json({ metrics: result.rows });
            
        } catch (error) {
            logger.error('Get productivity metrics error:', error);
            res.status(500).json({
                error: 'Failed to get productivity metrics',
                code: 'PRODUCTIVITY_METRICS_ERROR'
            });
        }
    }

    // Update time entry
    async updateTimeEntry(req, res) {
        try {
            const { id } = req.params;
            const { startTime, endTime, description } = req.body;
            
            const result = await pool.query(
                `UPDATE time_entries 
                 SET start_time = COALESCE($1, start_time),
                     end_time = COALESCE($2, end_time),
                     description = COALESCE($3, description),
                     duration_minutes = EXTRACT(EPOCH FROM (
                         COALESCE($2, end_time) - COALESCE($1, start_time)
                     )) / 60
                 WHERE id = $4 AND user_id = $5
                 RETURNING *`,
                [startTime, endTime, description, id, req.user.id]
            );
            
            if (result.rows.length === 0) {
                return res.status(404).json({
                    error: 'Time entry not found',
                    code: 'ENTRY_NOT_FOUND'
                });
            }
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'UPDATE_TIME_ENTRY', 'TIME_TRACKING', 
                 JSON.stringify({ entryId: id }), req.ip]
            );
            
            res.json({
                message: 'Time entry updated',
                entry: result.rows[0]
            });
            
        } catch (error) {
            logger.error('Update time entry error:', error);
            res.status(500).json({
                error: 'Failed to update time entry',
                code: 'UPDATE_ENTRY_ERROR'
            });
        }
    }

    // Delete time entry
    async deleteTimeEntry(req, res) {
        try {
            const { id } = req.params;
            
            const result = await pool.query(
                'DELETE FROM time_entries WHERE id = $1 AND user_id = $2 RETURNING id',
                [id, req.user.id]
            );
            
            if (result.rows.length === 0) {
                return res.status(404).json({
                    error: 'Time entry not found',
                    code: 'ENTRY_NOT_FOUND'
                });
            }
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'DELETE_TIME_ENTRY', 'TIME_TRACKING', 
                 JSON.stringify({ entryId: id }), req.ip]
            );
            
            res.json({
                message: 'Time entry deleted'
            });
            
        } catch (error) {
            logger.error('Delete time entry error:', error);
            res.status(500).json({
                error: 'Failed to delete time entry',
                code: 'DELETE_ENTRY_ERROR'
            });
        }
    }
}

module.exports = new TimeController();