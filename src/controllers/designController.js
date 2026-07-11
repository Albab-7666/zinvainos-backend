const { pool } = require('../config/database');
const { logger } = require('../utils/logger');

class DesignController {
    // Create design task
    async createDesignTask(req, res) {
        try {
            const { 
                projectId, title, description, assignedTo, 
                dueDate, priority = 'MEDIUM', designType,
                dimensions, format, revisions = 3
            } = req.body;
            
            const result = await pool.query(
                `INSERT INTO tasks (
                    project_id, title, description, assigned_to, 
                    due_date, priority, task_type, 
                    design_type, dimensions, format, revisions,
                    status, created_by
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                RETURNING *`,
                [projectId, title, description, assignedTo, 
                 dueDate, priority, 'DESIGN',
                 designType, dimensions, format, revisions,
                 'TODO', req.user.id]
            );
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'CREATE_DESIGN_TASK', 'GRAPHIC_DESIGN', 
                 JSON.stringify({ taskId: result.rows[0].id, title }), req.ip]
            );
            
            res.status(201).json({
                message: 'Design task created successfully',
                task: result.rows[0]
            });
            
        } catch (error) {
            logger.error('Create design task error:', error);
            res.status(500).json({
                error: 'Failed to create design task',
                code: 'CREATE_DESIGN_ERROR'
            });
        }
    }

    // Get design tasks
    async getDesignTasks(req, res) {
        try {
            const { projectId, assignedTo, status } = req.query;
            
            let query = `
                SELECT t.*, 
                       p.name as project_name,
                       u.full_name as assigned_to_name,
                       creator.full_name as created_by_name
                FROM tasks t
                LEFT JOIN projects p ON t.project_id = p.id
                LEFT JOIN users u ON t.assigned_to = u.id
                LEFT JOIN users creator ON t.created_by = creator.id
                WHERE t.task_type = 'DESIGN'
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
            
            // Role-based filtering
            if (req.user.role === 'EMPLOYEE') {
                query += ` AND t.assigned_to = $${paramIndex}`;
                values.push(req.user.id);
                paramIndex++;
            }
            
            query += ` ORDER BY t.due_date ASC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
            values.push(100, 0);
            
            const result = await pool.query(query, values);
            
            // Get design files for each task
            const tasks = await Promise.all(result.rows.map(async (task) => {
                const filesResult = await pool.query(
                    `SELECT id, filename, file_path, file_size, mime_type, created_at
                     FROM files 
                     WHERE module_type = 'DESIGN' AND module_id = $1
                     ORDER BY created_at DESC`,
                    [task.id]
                );
                task.designFiles = filesResult.rows;
                return task;
            }));
            
            res.json({ tasks });
            
        } catch (error) {
            logger.error('Get design tasks error:', error);
            res.status(500).json({
                error: 'Failed to get design tasks',
                code: 'GET_DESIGN_ERROR'
            });
        }
    }

    // Submit design work
    async submitDesign(req, res) {
        try {
            const { taskId } = req.params;
            const { fileId, notes } = req.body;
            
            // Check if task exists and user is assigned
            const taskResult = await pool.query(
                'SELECT assigned_to FROM tasks WHERE id = $1 AND task_type = $2',
                [taskId, 'DESIGN']
            );
            
            if (taskResult.rows.length === 0) {
                return res.status(404).json({
                    error: 'Design task not found',
                    code: 'DESIGN_NOT_FOUND'
                });
            }
            
            if (taskResult.rows[0].assigned_to !== req.user.id && req.user.role !== 'CEO') {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            }
            
            // Update task status
            const updateResult = await pool.query(
                `UPDATE tasks 
                 SET status = 'REVIEW', updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1
                 RETURNING *`,
                [taskId]
            );
            
            // Create submission record
            await pool.query(
                `INSERT INTO design_submissions (task_id, file_id, submitted_by, notes, submitted_at)
                 VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
                [taskId, fileId, req.user.id, notes]
            );
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'SUBMIT_DESIGN', 'GRAPHIC_DESIGN', 
                 JSON.stringify({ taskId }), req.ip]
            );
            
            res.json({
                message: 'Design submitted successfully',
                task: updateResult.rows[0]
            });
            
        } catch (error) {
            logger.error('Submit design error:', error);
            res.status(500).json({
                error: 'Failed to submit design',
                code: 'SUBMIT_DESIGN_ERROR'
            });
        }
    }

    // Review design
    async reviewDesign(req, res) {
        try {
            const { taskId } = req.params;
            const { approved, feedback } = req.body;
            
            // Only CEO and Team Members can review
            if (req.user.role === 'EMPLOYEE') {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            }
            
            const updateResult = await pool.query(
                `UPDATE tasks 
                 SET status = $1, updated_at = CURRENT_TIMESTAMP
                 WHERE id = $2
                 RETURNING *`,
                [approved ? 'COMPLETED' : 'IN_PROGRESS', taskId]
            );
            
            if (updateResult.rows.length === 0) {
                return res.status(404).json({
                    error: 'Design task not found',
                    code: 'DESIGN_NOT_FOUND'
                });
            }
            
            // Save feedback
            await pool.query(
                `INSERT INTO design_feedback (task_id, reviewer_id, approved, feedback, created_at)
                 VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
                [taskId, req.user.id, approved, feedback]
            );
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'REVIEW_DESIGN', 'GRAPHIC_DESIGN', 
                 JSON.stringify({ taskId, approved }), req.ip]
            );
            
            res.json({
                message: `Design ${approved ? 'approved' : 'returned for revisions'}`,
                task: updateResult.rows[0]
            });
            
        } catch (error) {
            logger.error('Review design error:', error);
            res.status(500).json({
                error: 'Failed to review design',
                code: 'REVIEW_DESIGN_ERROR'
            });
        }
    }

    // Get design templates
    async getDesignTemplates(req, res) {
        try {
            const result = await pool.query(
                `SELECT id, name, description, category, preview_url, file_path
                 FROM design_templates
                 ORDER BY name ASC`
            );
            
            res.json({ templates: result.rows });
            
        } catch (error) {
            logger.error('Get design templates error:', error);
            res.status(500).json({
                error: 'Failed to get design templates',
                code: 'GET_TEMPLATES_ERROR'
            });
        }
    }
}

module.exports = new DesignController();