const { pool } = require('../config/database');
const { logger } = require('../utils/logger');

class SprintController {
    // Create sprint
    async createSprint(req, res) {
        try {
            const { projectId, name, startDate, endDate, goal } = req.body;
            
            const result = await pool.query(
                `INSERT INTO sprints (project_id, name, start_date, end_date, goal, created_by)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 RETURNING *`,
                [projectId, name, startDate, endDate, goal, req.user.id]
            );
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'CREATE_SPRINT', 'SPRINT_MANAGEMENT', 
                 JSON.stringify({ sprintId: result.rows[0].id, name }), req.ip]
            );
            
            res.status(201).json({
                message: 'Sprint created successfully',
                sprint: result.rows[0]
            });
            
        } catch (error) {
            logger.error('Create sprint error:', error);
            res.status(500).json({
                error: 'Failed to create sprint',
                code: 'CREATE_SPRINT_ERROR'
            });
        }
    }

    // Get sprints
    async getSprints(req, res) {
        try {
            const { projectId, status } = req.query;
            
            let query = `
                SELECT s.*, 
                       u.full_name as created_by_name,
                       COUNT(st.id) as task_count,
                       COUNT(CASE WHEN t.status = 'COMPLETED' THEN 1 END) as completed_tasks
                FROM sprints s
                LEFT JOIN users u ON s.created_by = u.id
                LEFT JOIN sprint_tasks st ON s.id = st.sprint_id
                LEFT JOIN tasks t ON st.task_id = t.id
                WHERE 1=1
            `;
            let values = [];
            let paramIndex = 1;
            
            if (projectId) {
                query += ` AND s.project_id = $${paramIndex}`;
                values.push(projectId);
                paramIndex++;
            }
            
            if (status) {
                query += ` AND s.status = $${paramIndex}`;
                values.push(status);
                paramIndex++;
            }
            
            query += ` GROUP BY s.id, u.full_name
                     ORDER BY s.start_date DESC
                     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
            values.push(100, 0);
            
            const result = await pool.query(query, values);
            res.json({ sprints: result.rows });
            
        } catch (error) {
            logger.error('Get sprints error:', error);
            res.status(500).json({
                error: 'Failed to get sprints',
                code: 'GET_SPRINTS_ERROR'
            });
        }
    }

    // Get sprint by ID
    async getSprint(req, res) {
        try {
            const { id } = req.params;
            
            const result = await pool.query(
                `SELECT s.*, u.full_name as created_by_name
                 FROM sprints s
                 LEFT JOIN users u ON s.created_by = u.id
                 WHERE s.id = $1`,
                [id]
            );
            
            if (result.rows.length === 0) {
                return res.status(404).json({
                    error: 'Sprint not found',
                    code: 'SPRINT_NOT_FOUND'
                });
            }
            
            const sprint = result.rows[0];
            
            // Get tasks in sprint
            const tasksResult = await pool.query(
                `SELECT t.*, u.full_name as assigned_to_name
                 FROM tasks t
                 JOIN sprint_tasks st ON t.id = st.task_id
                 LEFT JOIN users u ON t.assigned_to = u.id
                 WHERE st.sprint_id = $1
                 ORDER BY t.priority DESC, t.due_date ASC`,
                [id]
            );
            sprint.tasks = tasksResult.rows;
            
            res.json({ sprint });
            
        } catch (error) {
            logger.error('Get sprint error:', error);
            res.status(500).json({
                error: 'Failed to get sprint',
                code: 'GET_SPRINT_ERROR'
            });
        }
    }

    // Update sprint
    async updateSprint(req, res) {
        try {
            const { id } = req.params;
            const updates = req.body;
            
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
                UPDATE sprints 
                SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
                WHERE id = $${paramIndex}
                RETURNING *
            `;
            
            const result = await pool.query(query, values);
            
            if (result.rows.length === 0) {
                return res.status(404).json({
                    error: 'Sprint not found',
                    code: 'SPRINT_NOT_FOUND'
                });
            }
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'UPDATE_SPRINT', 'SPRINT_MANAGEMENT', 
                 JSON.stringify({ sprintId: id, updates }), req.ip]
            );
            
            res.json({
                message: 'Sprint updated successfully',
                sprint: result.rows[0]
            });
            
        } catch (error) {
            logger.error('Update sprint error:', error);
            res.status(500).json({
                error: 'Failed to update sprint',
                code: 'UPDATE_SPRINT_ERROR'
            });
        }
    }

    // Delete sprint
    async deleteSprint(req, res) {
        try {
            const { id } = req.params;
            
            // Remove sprint-task associations
            await pool.query('DELETE FROM sprint_tasks WHERE sprint_id = $1', [id]);
            
            const result = await pool.query(
                'DELETE FROM sprints WHERE id = $1 RETURNING id',
                [id]
            );
            
            if (result.rows.length === 0) {
                return res.status(404).json({
                    error: 'Sprint not found',
                    code: 'SPRINT_NOT_FOUND'
                });
            }
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'DELETE_SPRINT', 'SPRINT_MANAGEMENT', 
                 JSON.stringify({ sprintId: id }), req.ip]
            );
            
            res.json({
                message: 'Sprint deleted successfully'
            });
            
        } catch (error) {
            logger.error('Delete sprint error:', error);
            res.status(500).json({
                error: 'Failed to delete sprint',
                code: 'DELETE_SPRINT_ERROR'
            });
        }
    }

    // Add tasks to sprint
    async addTasksToSprint(req, res) {
        try {
            const { id } = req.params;
            const { taskIds } = req.body;
            
            const tasks = [];
            for (const taskId of taskIds) {
                const result = await pool.query(
                    `INSERT INTO sprint_tasks (sprint_id, task_id)
                     VALUES ($1, $2)
                     ON CONFLICT (sprint_id, task_id) DO NOTHING
                     RETURNING *`,
                    [id, taskId]
                );
                if (result.rows.length > 0) {
                    tasks.push(result.rows[0]);
                }
            }
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'ADD_TASKS_TO_SPRINT', 'SPRINT_MANAGEMENT', 
                 JSON.stringify({ sprintId: id, taskCount: taskIds.length }), req.ip]
            );
            
            res.json({
                message: 'Tasks added to sprint successfully',
                addedTasks: tasks.length
            });
            
        } catch (error) {
            logger.error('Add tasks to sprint error:', error);
            res.status(500).json({
                error: 'Failed to add tasks to sprint',
                code: 'ADD_TASKS_ERROR'
            });
        }
    }

    // Remove task from sprint
    async removeTaskFromSprint(req, res) {
        try {
            const { id, taskId } = req.params;
            
            const result = await pool.query(
                'DELETE FROM sprint_tasks WHERE sprint_id = $1 AND task_id = $2 RETURNING *',
                [id, taskId]
            );
            
            if (result.rows.length === 0) {
                return res.status(404).json({
                    error: 'Task not found in sprint',
                    code: 'TASK_NOT_IN_SPRINT'
                });
            }
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'REMOVE_TASK_FROM_SPRINT', 'SPRINT_MANAGEMENT', 
                 JSON.stringify({ sprintId: id, taskId }), req.ip]
            );
            
            res.json({
                message: 'Task removed from sprint successfully'
            });
            
        } catch (error) {
            logger.error('Remove task from sprint error:', error);
            res.status(500).json({
                error: 'Failed to remove task from sprint',
                code: 'REMOVE_TASK_ERROR'
            });
        }
    }
}

module.exports = new SprintController();