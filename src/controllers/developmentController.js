const { pool } = require('../config/database');
const { logger } = require('../utils/logger');

class DevelopmentController {
    // Create development task
    async createDevTask(req, res) {
        try {
            const { 
                projectId, title, description, assignedTo, 
                dueDate, priority = 'MEDIUM', devType,
                repository, branch, estimatedHours
            } = req.body;
            
            const result = await pool.query(
                `INSERT INTO tasks (
                    project_id, title, description, assigned_to, 
                    due_date, priority, task_type, 
                    dev_type, repository, branch, estimated_hours,
                    status, created_by
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                RETURNING *`,
                [projectId, title, description, assignedTo, 
                 dueDate, priority, 'DEVELOPMENT',
                 devType, repository, branch, estimatedHours,
                 'TODO', req.user.id]
            );
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'CREATE_DEV_TASK', 'SOFTWARE_DEVELOPMENT', 
                 JSON.stringify({ taskId: result.rows[0].id, title }), req.ip]
            );
            
            res.status(201).json({
                message: 'Development task created successfully',
                task: result.rows[0]
            });
            
        } catch (error) {
            logger.error('Create development task error:', error);
            res.status(500).json({
                error: 'Failed to create development task',
                code: 'CREATE_DEV_ERROR'
            });
        }
    }

    // Get development tasks
    async getDevTasks(req, res) {
        try {
            const { projectId, assignedTo, status, devType } = req.query;
            
            let query = `
                SELECT t.*, 
                       p.name as project_name,
                       u.full_name as assigned_to_name,
                       creator.full_name as created_by_name,
                       (SELECT COUNT(*) FROM development_commits WHERE task_id = t.id) as commit_count
                FROM tasks t
                LEFT JOIN projects p ON t.project_id = p.id
                LEFT JOIN users u ON t.assigned_to = u.id
                LEFT JOIN users creator ON t.created_by = creator.id
                WHERE t.task_type = 'DEVELOPMENT'
            `;
            let values = [];
            let paramIndex = 1;
            
            if (projectId) {
                query += ` AND t.project_id = $${paramIndex}`;
                values.push(projectId);
                paramIndex++;
            }
            
            if (assignedTo) {
                query += ` AND t.assigned_to = $${paramIndex}`;
                values.push(assignedTo);
                paramIndex++;
            }
            
            if (status) {
                query += ` AND t.status = $${paramIndex}`;
                values.push(status);
                paramIndex++;
            }
            
            if (devType) {
                query += ` AND t.dev_type = $${paramIndex}`;
                values.push(devType);
                paramIndex++;
            }
            
            // Role-based filtering
            if (req.user.role === 'EMPLOYEE') {
                query += ` AND t.assigned_to = $${paramIndex}`;
                values.push(req.user.id);
                paramIndex++;
            }
            
            query += ` ORDER BY t.due_date ASC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
            values.push(100, 0);
            
            const result = await pool.query(query, values);
            
            // Get commits for each task
            const tasks = await Promise.all(result.rows.map(async (task) => {
                const commitsResult = await pool.query(
                    `SELECT id, commit_hash, message, branch, 
                            author_id, committed_at
                     FROM development_commits 
                     WHERE task_id = $1
                     ORDER BY committed_at DESC
                     LIMIT 5`,
                    [task.id]
                );
                task.recentCommits = commitsResult.rows;
                return task;
            }));
            
            res.json({ tasks });
            
        } catch (error) {
            logger.error('Get development tasks error:', error);
            res.status(500).json({
                error: 'Failed to get development tasks',
                code: 'GET_DEV_ERROR'
            });
        }
    }

    // Log development commit
    async logCommit(req, res) {
        try {
            const { taskId } = req.params;
            const { commitHash, message, branch } = req.body;
            
            // Check if user is assigned to task
            const taskResult = await pool.query(
                'SELECT assigned_to FROM tasks WHERE id = $1 AND task_type = $2',
                [taskId, 'DEVELOPMENT']
            );
            
            if (taskResult.rows.length === 0) {
                return res.status(404).json({
                    error: 'Development task not found',
                    code: 'DEV_NOT_FOUND'
                });
            }
            
            if (taskResult.rows[0].assigned_to !== req.user.id && req.user.role !== 'CEO') {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            }
            
            const result = await pool.query(
                `INSERT INTO development_commits (task_id, commit_hash, message, branch, author_id, committed_at)
                 VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
                 RETURNING *`,
                [taskId, commitHash, message, branch, req.user.id]
            );
            
            // Update task status if not started
            await pool.query(
                `UPDATE tasks 
                 SET status = 'IN_PROGRESS', updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1 AND status = 'TODO'`,
                [taskId]
            );
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'LOG_COMMIT', 'SOFTWARE_DEVELOPMENT', 
                 JSON.stringify({ taskId, commitHash }), req.ip]
            );
            
            res.json({
                message: 'Commit logged successfully',
                commit: result.rows[0]
            });
            
        } catch (error) {
            logger.error('Log commit error:', error);
            res.status(500).json({
                error: 'Failed to log commit',
                code: 'LOG_COMMIT_ERROR'
            });
        }
    }

    // Get development metrics
    async getDevMetrics(req, res) {
        try {
            const { projectId } = req.params;
            
            const metrics = await pool.query(
                `SELECT 
                    COUNT(*) as total_tasks,
                    COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) as completed_tasks,
                    COUNT(CASE WHEN status = 'IN_PROGRESS' THEN 1 END) as in_progress_tasks,
                    COUNT(CASE WHEN status = 'BLOCKED' THEN 1 END) as blocked_tasks,
                    COALESCE(SUM(estimated_hours), 0) as total_estimated_hours,
                    COALESCE(SUM(actual_hours), 0) as total_actual_hours
                 FROM tasks
                 WHERE project_id = $1 AND task_type = 'DEVELOPMENT'`,
                [projectId]
            );
            
            const commits = await pool.query(
                `SELECT 
                    COUNT(*) as total_commits,
                    COUNT(DISTINCT author_id) as active_developers,
                    DATE_TRUNC('day', committed_at) as date
                 FROM development_commits dc
                 JOIN tasks t ON dc.task_id = t.id
                 WHERE t.project_id = $1
                 GROUP BY DATE_TRUNC('day', committed_at)
                 ORDER BY date DESC
                 LIMIT 30`,
                [projectId]
            );
            
            res.json({
                metrics: metrics.rows[0],
                commitActivity: commits.rows
            });
            
        } catch (error) {
            logger.error('Get development metrics error:', error);
            res.status(500).json({
                error: 'Failed to get development metrics',
                code: 'GET_DEV_METRICS_ERROR'
            });
        }
    }
}

module.exports = new DevelopmentController();