const { pool } = require('../config/database');
const { logger } = require('../utils/logger');

class RecurringTaskController {
    // Create recurring task
    async createRecurringTask(req, res) {
        try {
            const { 
                title, description, projectId, assignedTo, 
                priority, frequency, interval, startDate, endDate,
                dayOfWeek, dayOfMonth, estimatedHours
            } = req.body;
            
            const result = await pool.query(
                `INSERT INTO recurring_tasks (
                    title, description, project_id, assigned_to,
                    priority, frequency, interval_days, start_date, end_date,
                    day_of_week, day_of_month, estimated_hours, created_by
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                RETURNING *`,
                [title, description, projectId, assignedTo,
                 priority, frequency, interval, startDate, endDate,
                 dayOfWeek, dayOfMonth, estimatedHours, req.user.id]
            );
            
            // Generate initial tasks
            await this.generateRecurringTasks(result.rows[0]);
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'CREATE_RECURRING_TASK', 'RECURRING_TASKS', 
                 JSON.stringify({ recurringTaskId: result.rows[0].id, title }), req.ip]
            );
            
            res.status(201).json({
                message: 'Recurring task created successfully',
                recurringTask: result.rows[0]
            });
            
        } catch (error) {
            logger.error('Create recurring task error:', error);
            res.status(500).json({
                error: 'Failed to create recurring task',
                code: 'CREATE_RECURRING_ERROR'
            });
        }
    }

    // Generate tasks from recurring pattern
    async generateRecurringTasks(recurringTask) {
        try {
            const { id, title, description, project_id, assigned_to, 
                    priority, interval_days, start_date, end_date, 
                    estimated_hours } = recurringTask;
            
            const tasks = [];
            let currentDate = new Date(start_date);
            const endDate = new Date(end_date);
            
            while (currentDate <= endDate) {
                const taskResult = await pool.query(
                    `INSERT INTO tasks (
                        project_id, title, description, assigned_to,
                        priority, due_date, estimated_hours, status, created_by,
                        is_recurring, recurring_task_id
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                    RETURNING *`,
                    [project_id, `${title} - ${currentDate.toISOString().split('T')[0]}`, 
                     description, assigned_to, priority, currentDate, 
                     estimated_hours, 'TODO', req.user?.id || 'SYSTEM',
                     true, id]
                );
                
                tasks.push(taskResult.rows[0]);
                
                // Next occurrence
                currentDate.setDate(currentDate.getDate() + interval_days);
            }
            
            return tasks;
            
        } catch (error) {
            logger.error('Generate recurring tasks error:', error);
            throw error;
        }
    }

    // Get recurring tasks
    async getRecurringTasks(req, res) {
        try {
            const { limit = 100, offset = 0 } = req.query;
            
            let query = `
                SELECT rt.*, 
                       u.full_name as assigned_to_name,
                       creator.full_name as created_by_name,
                       COUNT(rti.id) as generated_tasks
                FROM recurring_tasks rt
                LEFT JOIN users u ON rt.assigned_to = u.id
                LEFT JOIN users creator ON rt.created_by = creator.id
                LEFT JOIN tasks rti ON rti.recurring_task_id = rt.id
                WHERE 1=1
            `;
            let values = [];
            let paramIndex = 1;
            
            // Role-based filtering
            if (req.user.role !== 'CEO') {
                query += ` AND (rt.assigned_to = $${paramIndex} OR rt.created_by = $${paramIndex})`;
                values.push(req.user.id);
                paramIndex++;
            }
            
            query += ` GROUP BY rt.id, u.full_name, creator.full_name
                     ORDER BY rt.created_at DESC
                     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
            values.push(parseInt(limit), parseInt(offset));
            
            const result = await pool.query(query, values);
            res.json({ recurringTasks: result.rows });
            
        } catch (error) {
            logger.error('Get recurring tasks error:', error);
            res.status(500).json({
                error: 'Failed to get recurring tasks',
                code: 'GET_RECURRING_ERROR'
            });
        }
    }

    // Update recurring task
    async updateRecurringTask(req, res) {
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
                UPDATE recurring_tasks 
                SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
                WHERE id = $${paramIndex}
                RETURNING *
            `;
            
            const result = await pool.query(query, values);
            
            if (result.rows.length === 0) {
                return res.status(404).json({
                    error: 'Recurring task not found',
                    code: 'RECURRING_NOT_FOUND'
                });
            }
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'UPDATE_RECURRING_TASK', 'RECURRING_TASKS', 
                 JSON.stringify({ recurringTaskId: id, updates }), req.ip]
            );
            
            res.json({
                message: 'Recurring task updated successfully',
                recurringTask: result.rows[0]
            });
            
        } catch (error) {
            logger.error('Update recurring task error:', error);
            res.status(500).json({
                error: 'Failed to update recurring task',
                code: 'UPDATE_RECURRING_ERROR'
            });
        }
    }

    // Delete recurring task
    async deleteRecurringTask(req, res) {
        try {
            const { id } = req.params;
            const { deleteGenerated = false } = req.query;
            
            if (deleteGenerated === 'true') {
                await pool.query('DELETE FROM tasks WHERE recurring_task_id = $1', [id]);
            }
            
            const result = await pool.query(
                'DELETE FROM recurring_tasks WHERE id = $1 RETURNING id',
                [id]
            );
            
            if (result.rows.length === 0) {
                return res.status(404).json({
                    error: 'Recurring task not found',
                    code: 'RECURRING_NOT_FOUND'
                });
            }
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'DELETE_RECURRING_TASK', 'RECURRING_TASKS', 
                 JSON.stringify({ recurringTaskId: id }), req.ip]
            );
            
            res.json({
                message: 'Recurring task deleted successfully'
            });
            
        } catch (error) {
            logger.error('Delete recurring task error:', error);
            res.status(500).json({
                error: 'Failed to delete recurring task',
                code: 'DELETE_RECURRING_ERROR'
            });
        }
    }

    // Generate tasks now
    async generateTasksNow(req, res) {
        try {
            const { id } = req.params;
            
            const result = await pool.query(
                'SELECT * FROM recurring_tasks WHERE id = $1',
                [id]
            );
            
            if (result.rows.length === 0) {
                return res.status(404).json({
                    error: 'Recurring task not found',
                    code: 'RECURRING_NOT_FOUND'
                });
            }
            
            const tasks = await this.generateRecurringTasks(result.rows[0]);
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'GENERATE_RECURRING_TASKS', 'RECURRING_TASKS', 
                 JSON.stringify({ recurringTaskId: id, taskCount: tasks.length }), req.ip]
            );
            
            res.json({
                message: 'Tasks generated successfully',
                tasksGenerated: tasks.length
            });
            
        } catch (error) {
            logger.error('Generate tasks now error:', error);
            res.status(500).json({
                error: 'Failed to generate tasks',
                code: 'GENERATE_TASKS_ERROR'
            });
        }
    }
}

module.exports = new RecurringTaskController();