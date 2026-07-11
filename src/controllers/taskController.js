const { pool } = require('../config/database');
const { logger } = require('../utils/logger');

class TaskController {
    // Create task
    async createTask(req, res) {
        try {
            const { 
                projectId, title, description, assignedTo, 
                dueDate, priority = 'MEDIUM', estimatedHours,
                taskType = 'GENERAL'
            } = req.body;
            
            const result = await pool.query(
                `INSERT INTO tasks (
                    project_id, title, description, assigned_to, 
                    due_date, priority, estimated_hours,
                    task_type, status, created_by
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                RETURNING *`,
                [projectId, title, description, assignedTo, 
                 dueDate, priority, estimatedHours,
                 taskType, 'TODO', req.user.id]
            );
            
            // Create notification for assigned user
            if (assignedTo) {
                await pool.query(
                    `INSERT INTO notifications (user_id, title, message, type, link, created_at)
                     VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
                    [assignedTo, 'New Task Assigned', 
                     `You have been assigned to task: ${title}`,
                     'TASK', `/tasks/${result.rows[0].id}`]
                );
            }
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'CREATE_TASK', 'TASK_MANAGEMENT', 
                 JSON.stringify({ taskId: result.rows[0].id, title }), req.ip]
            );
            
            res.status(201).json({
                message: 'Task created successfully',
                task: result.rows[0]
            });
            
        } catch (error) {
            logger.error('Create task error:', error);
            res.status(500).json({
                error: 'Failed to create task',
                code: 'CREATE_TASK_ERROR'
            });
        }
    }

    // Get tasks
    async getTasks(req, res) {
        try {
            const { 
                limit = 100, offset = 0, projectId, assignedTo, 
                status, priority, search, includeCompleted = 'false'
            } = req.query;
            
            let query = `
                SELECT t.*, 
                       p.name as project_name,
                       u.full_name as assigned_to_name,
                       creator.full_name as created_by_name
                FROM tasks t
                LEFT JOIN projects p ON t.project_id = p.id
                LEFT JOIN users u ON t.assigned_to = u.id
                LEFT JOIN users creator ON t.created_by = creator.id
                WHERE 1=1
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
            
            if (priority) {
                query += ` AND t.priority = $${paramIndex}`;
                values.push(priority);
                paramIndex++;
            }
            
            if (search) {
                query += ` AND (t.title ILIKE $${paramIndex} OR t.description ILIKE $${paramIndex})`;
                values.push(`%${search}%`);
                paramIndex++;
            }
            
            if (includeCompleted !== 'true') {
                query += ` AND t.status != 'COMPLETED'`;
            }
            
            // Role-based filtering
            if (req.user.role === 'EMPLOYEE') {
                query += ` AND t.assigned_to = $${paramIndex}`;
                values.push(req.user.id);
                paramIndex++;
            } else if (req.user.role === 'TEAM_MEMBER') {
                query += ` AND (t.assigned_to = $${paramIndex} OR t.created_by = $${paramIndex})`;
                values.push(req.user.id);
                paramIndex++;
            }
            
            // Get total count
            const countQuery = query.replace(
                'SELECT t.*, p.name as project_name, u.full_name as assigned_to_name, creator.full_name as created_by_name',
                'SELECT COUNT(*) as total'
            );
            const countResult = await pool.query(countQuery, values);
            const total = parseInt(countResult.rows[0].total);
            
            // Get paginated results
            query += ` ORDER BY t.due_date ASC NULLS LAST, t.priority DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
            values.push(parseInt(limit), parseInt(offset));
            
            const result = await pool.query(query, values);
            
            res.json({
                tasks: result.rows,
                pagination: {
                    total,
                    limit: parseInt(limit),
                    offset: parseInt(offset),
                    totalPages: Math.ceil(total / parseInt(limit))
                }
            });
            
        } catch (error) {
            logger.error('Get tasks error:', error);
            res.status(500).json({
                error: 'Failed to get tasks',
                code: 'GET_TASKS_ERROR'
            });
        }
    }

    // Get task by ID
    async getTask(req, res) {
        try {
            const { id } = req.params;
            
            const result = await pool.query(
                `SELECT t.*, 
                        p.name as project_name,
                        u.full_name as assigned_to_name,
                        creator.full_name as created_by_name
                 FROM tasks t
                 LEFT JOIN projects p ON t.project_id = p.id
                 LEFT JOIN users u ON t.assigned_to = u.id
                 LEFT JOIN users creator ON t.created_by = creator.id
                 WHERE t.id = $1`,
                [id]
            );
            
            if (result.rows.length === 0) {
                return res.status(404).json({
                    error: 'Task not found',
                    code: 'TASK_NOT_FOUND'
                });
            }
            
            const task = result.rows[0];
            
            // Check permission
            if (req.user.role === 'EMPLOYEE' && task.assigned_to !== req.user.id) {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            }
            
            // Get time entries
            const timeResult = await pool.query(
                `SELECT id, start_time, end_time, duration_minutes, description, created_at
                 FROM time_entries
                 WHERE task_id = $1
                 ORDER BY created_at DESC`,
                [id]
            );
            task.timeEntries = timeResult.rows;
            
            // Get comments
            const commentsResult = await pool.query(
                `SELECT c.*, u.full_name as user_name
                 FROM comments c
                 LEFT JOIN users u ON c.user_id = u.id
                 WHERE c.module_type = 'TASK' AND c.module_id = $1
                 ORDER BY c.created_at ASC`,
                [id]
            );
            task.comments = commentsResult.rows;
            
            res.json({ task });
            
        } catch (error) {
            logger.error('Get task error:', error);
            res.status(500).json({
                error: 'Failed to get task',
                code: 'GET_TASK_ERROR'
            });
        }
    }

    // Update task
    async updateTask(req, res) {
        try {
            const { id } = req.params;
            const updates = req.body;
            
            // Check if task exists and user has permission
            const checkResult = await pool.query(
                'SELECT assigned_to, created_by FROM tasks WHERE id = $1',
                [id]
            );
            
            if (checkResult.rows.length === 0) {
                return res.status(404).json({
                    error: 'Task not found',
                    code: 'TASK_NOT_FOUND'
                });
            }
            
            // Check permission
            if (req.user.role !== 'CEO' && 
                checkResult.rows[0].created_by !== req.user.id &&
                checkResult.rows[0].assigned_to !== req.user.id) {
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
                UPDATE tasks 
                SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
                WHERE id = $${paramIndex}
                RETURNING *
            `;
            
            const result = await pool.query(query, values);
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'UPDATE_TASK', 'TASK_MANAGEMENT', 
                 JSON.stringify({ taskId: id, updates }), req.ip]
            );
            
            res.json({
                message: 'Task updated successfully',
                task: result.rows[0]
            });
            
        } catch (error) {
            logger.error('Update task error:', error);
            res.status(500).json({
                error: 'Failed to update task',
                code: 'UPDATE_TASK_ERROR'
            });
        }
    }

    // Delete task
    async deleteTask(req, res) {
        try {
            const { id } = req.params;
            
            // Check if task exists and user has permission
            const checkResult = await pool.query(
                'SELECT created_by FROM tasks WHERE id = $1',
                [id]
            );
            
            if (checkResult.rows.length === 0) {
                return res.status(404).json({
                    error: 'Task not found',
                    code: 'TASK_NOT_FOUND'
                });
            }
            
            // Only CEO and task creator can delete
            if (req.user.role !== 'CEO' && checkResult.rows[0].created_by !== req.user.id) {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            }
            
            // Delete related data
            await pool.query('DELETE FROM time_entries WHERE task_id = $1', [id]);
            await pool.query('DELETE FROM sprint_tasks WHERE task_id = $1', [id]);
            await pool.query('DELETE FROM comments WHERE module_type = $1 AND module_id = $2', ['TASK', id]);
            await pool.query('DELETE FROM files WHERE module_type = $1 AND module_id = $2', ['TASK', id]);
            
            const result = await pool.query(
                'DELETE FROM tasks WHERE id = $1 RETURNING id',
                [id]
            );
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'DELETE_TASK', 'TASK_MANAGEMENT', 
                 JSON.stringify({ taskId: id }), req.ip]
            );
            
            res.json({
                message: 'Task deleted successfully'
            });
            
        } catch (error) {
            logger.error('Delete task error:', error);
            res.status(500).json({
                error: 'Failed to delete task',
                code: 'DELETE_TASK_ERROR'
            });
        }
    }

    // Update task status
    async updateStatus(req, res) {
        try {
            const { id } = req.params;
            const { status } = req.body;
            
            const result = await pool.query(
                `UPDATE tasks 
                 SET status = $1, updated_at = CURRENT_TIMESTAMP
                 WHERE id = $2
                 RETURNING *`,
                [status, id]
            );
            
            if (result.rows.length === 0) {
                return res.status(404).json({
                    error: 'Task not found',
                    code: 'TASK_NOT_FOUND'
                });
            }
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'UPDATE_TASK_STATUS', 'TASK_MANAGEMENT', 
                 JSON.stringify({ taskId: id, status }), req.ip]
            );
            
            res.json({
                message: 'Task status updated successfully',
                task: result.rows[0]
            });
            
        } catch (error) {
            logger.error('Update task status error:', error);
            res.status(500).json({
                error: 'Failed to update task status',
                code: 'UPDATE_STATUS_ERROR'
            });
        }
    }

    // Assign task
    async assignTask(req, res) {
        try {
            const { id } = req.params;
            const { assignedTo } = req.body;
            
            const result = await pool.query(
                `UPDATE tasks 
                 SET assigned_to = $1, updated_at = CURRENT_TIMESTAMP
                 WHERE id = $2
                 RETURNING *`,
                [assignedTo, id]
            );
            
            if (result.rows.length === 0) {
                return res.status(404).json({
                    error: 'Task not found',
                    code: 'TASK_NOT_FOUND'
                });
            }
            
            // Create notification
            await pool.query(
                `INSERT INTO notifications (user_id, title, message, type, link, created_at)
                 VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
                [assignedTo, 'Task Assigned', 
                 `You have been assigned to: ${result.rows[0].title}`,
                 'TASK', `/tasks/${id}`]
            );
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'ASSIGN_TASK', 'TASK_MANAGEMENT', 
                 JSON.stringify({ taskId: id, assignedTo }), req.ip]
            );
            
            res.json({
                message: 'Task assigned successfully',
                task: result.rows[0]
            });
            
        } catch (error) {
            logger.error('Assign task error:', error);
            res.status(500).json({
                error: 'Failed to assign task',
                code: 'ASSIGN_TASK_ERROR'
            });
        }
    }

    // Get task by status
    async getTasksByStatus(req, res) {
        try {
            const { status } = req.params;
            
            const result = await pool.query(
                `SELECT t.*, u.full_name as assigned_to_name
                 FROM tasks t
                 LEFT JOIN users u ON t.assigned_to = u.id
                 WHERE t.status = $1
                 ORDER BY t.priority DESC, t.due_date ASC`,
                [status]
            );
            
            res.json({ tasks: result.rows });
            
        } catch (error) {
            logger.error('Get tasks by status error:', error);
            res.status(500).json({
                error: 'Failed to get tasks',
                code: 'GET_TASKS_BY_STATUS_ERROR'
            });
        }
    }

    // Get task statistics
    async getTaskStats(req, res) {
        try {
            const stats = await pool.query(
                `SELECT 
                    COUNT(*) as total,
                    COUNT(CASE WHEN status = 'TODO' THEN 1 END) as todo,
                    COUNT(CASE WHEN status = 'IN_PROGRESS' THEN 1 END) as in_progress,
                    COUNT(CASE WHEN status = 'REVIEW' THEN 1 END) as review,
                    COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) as completed,
                    COUNT(CASE WHEN status = 'BLOCKED' THEN 1 END) as blocked,
                    COUNT(CASE WHEN priority = 'HIGH' THEN 1 END) as high_priority,
                    COUNT(CASE WHEN priority = 'CRITICAL' THEN 1 END) as critical
                 FROM tasks`
            );
            
            res.json({ stats: stats.rows[0] });
            
        } catch (error) {
            logger.error('Get task stats error:', error);
            res.status(500).json({
                error: 'Failed to get task statistics',
                code: 'TASK_STATS_ERROR'
            });
        }
    }
}

module.exports = new TaskController();