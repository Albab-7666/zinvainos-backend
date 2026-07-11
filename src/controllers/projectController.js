const { pool } = require('../config/database');
const { logger } = require('../utils/logger');

class ProjectController {
    // Create project
    async createProject(req, res) {
        try {
            const { 
                name, description, clientId, status = 'PLANNING', 
                priority = 'MEDIUM', startDate, endDate, budget, 
                projectType, assignedTo 
            } = req.body;
            
            const result = await pool.query(
                `INSERT INTO projects (
                    name, description, client_id, status, priority, 
                    start_date, end_date, budget, project_type, 
                    assigned_to, created_by
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                RETURNING *`,
                [name, description, clientId, status, priority, 
                 startDate, endDate, budget, projectType, 
                 assignedTo || req.user.id, req.user.id]
            );
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'CREATE_PROJECT', 'PROJECT_MANAGEMENT', 
                 JSON.stringify({ projectId: result.rows[0].id, name }), req.ip]
            );
            
            res.status(201).json({
                message: 'Project created successfully',
                project: result.rows[0]
            });
            
        } catch (error) {
            logger.error('Create project error:', error);
            res.status(500).json({
                error: 'Failed to create project',
                code: 'CREATE_PROJECT_ERROR'
            });
        }
    }

    // Get projects
    async getProjects(req, res) {
        try {
            const { limit = 100, offset = 0, status = null, clientId = null, search = null } = req.query;
            
            let query = `
                SELECT p.*, 
                       c.company_name as client_name,
                       u.full_name as assigned_to_name,
                       creator.full_name as created_by_name
                FROM projects p
                LEFT JOIN clients c ON p.client_id = c.id
                LEFT JOIN users u ON p.assigned_to = u.id
                LEFT JOIN users creator ON p.created_by = creator.id
                WHERE 1=1
            `;
            let values = [];
            let paramIndex = 1;
            
            if (status) {
                query += ` AND p.status = $${paramIndex}`;
                values.push(status);
                paramIndex++;
            }
            
            if (clientId) {
                query += ` AND p.client_id = $${paramIndex}`;
                values.push(clientId);
                paramIndex++;
            }
            
            if (search) {
                query += ` AND (p.name ILIKE $${paramIndex} OR p.description ILIKE $${paramIndex})`;
                values.push(`%${search}%`);
                paramIndex++;
            }
            
            // Role-based filtering
            if (req.user.role === 'EMPLOYEE') {
                query += ` AND p.id IN (
                    SELECT DISTINCT project_id FROM tasks WHERE assigned_to = $${paramIndex}
                )`;
                values.push(req.user.id);
                paramIndex++;
            } else if (req.user.role === 'TEAM_MEMBER') {
                query += ` AND (p.assigned_to = $${paramIndex} OR p.created_by = $${paramIndex})`;
                values.push(req.user.id);
                paramIndex++;
            }
            
            // Get total count
            const countQuery = query.replace(
                'SELECT p.*, c.company_name as client_name, u.full_name as assigned_to_name, creator.full_name as created_by_name',
                'SELECT COUNT(*) as total'
            );
            const countResult = await pool.query(countQuery, values);
            const total = parseInt(countResult.rows[0].total);
            
            // Get paginated results
            query += ` ORDER BY p.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
            values.push(parseInt(limit), parseInt(offset));
            
            const result = await pool.query(query, values);
            
            // Get task counts for each project
            const projects = await Promise.all(result.rows.map(async (project) => {
                const taskResult = await pool.query(
                    `SELECT 
                        COUNT(*) as total,
                        COUNT(CASE WHEN status = 'TODO' THEN 1 END) as todo,
                        COUNT(CASE WHEN status = 'IN_PROGRESS' THEN 1 END) as in_progress,
                        COUNT(CASE WHEN status = 'REVIEW' THEN 1 END) as review,
                        COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) as completed
                     FROM tasks WHERE project_id = $1`,
                    [project.id]
                );
                project.taskStats = taskResult.rows[0];
                return project;
            }));
            
            res.json({
                projects,
                pagination: {
                    total,
                    limit: parseInt(limit),
                    offset: parseInt(offset),
                    totalPages: Math.ceil(total / parseInt(limit))
                }
            });
            
        } catch (error) {
            logger.error('Get projects error:', error);
            res.status(500).json({
                error: 'Failed to get projects',
                code: 'GET_PROJECTS_ERROR'
            });
        }
    }

    // Get project by ID
    async getProject(req, res) {
        try {
            const { id } = req.params;
            
            const result = await pool.query(
                `SELECT p.*, 
                        c.company_name as client_name,
                        u.full_name as assigned_to_name,
                        creator.full_name as created_by_name
                 FROM projects p
                 LEFT JOIN clients c ON p.client_id = c.id
                 LEFT JOIN users u ON p.assigned_to = u.id
                 LEFT JOIN users creator ON p.created_by = creator.id
                 WHERE p.id = $1`,
                [id]
            );
            
            if (result.rows.length === 0) {
                return res.status(404).json({
                    error: 'Project not found',
                    code: 'PROJECT_NOT_FOUND'
                });
            }
            
            const project = result.rows[0];
            
            // Check permission
            if (req.user.role === 'EMPLOYEE') {
                const taskCheck = await pool.query(
                    'SELECT id FROM tasks WHERE project_id = $1 AND assigned_to = $2 LIMIT 1',
                    [id, req.user.id]
                );
                if (taskCheck.rows.length === 0) {
                    return res.status(403).json({
                        error: 'Access denied',
                        code: 'ACCESS_DENIED'
                    });
                }
            }
            
            // Get all tasks
            const tasksResult = await pool.query(
                `SELECT t.*, u.full_name as assigned_to_name
                 FROM tasks t
                 LEFT JOIN users u ON t.assigned_to = u.id
                 WHERE t.project_id = $1
                 ORDER BY t.created_at DESC`,
                [id]
            );
            project.tasks = tasksResult.rows;
            
            // Get team members
            const membersResult = await pool.query(
                `SELECT DISTINCT u.id, u.full_name, u.email, u.role
                 FROM users u
                 JOIN tasks t ON t.assigned_to = u.id
                 WHERE t.project_id = $1`,
                [id]
            );
            project.teamMembers = membersResult.rows;
            
            res.json({ project });
            
        } catch (error) {
            logger.error('Get project error:', error);
            res.status(500).json({
                error: 'Failed to get project',
                code: 'GET_PROJECT_ERROR'
            });
        }
    }

    // Update project
    async updateProject(req, res) {
        try {
            const { id } = req.params;
            const updates = req.body;
            
            // Check if project exists
            const checkResult = await pool.query(
                'SELECT created_by FROM projects WHERE id = $1',
                [id]
            );
            
            if (checkResult.rows.length === 0) {
                return res.status(404).json({
                    error: 'Project not found',
                    code: 'PROJECT_NOT_FOUND'
                });
            }
            
            // Check permission
            if (req.user.role !== 'CEO' && 
                checkResult.rows[0].created_by !== req.user.id) {
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
                UPDATE projects 
                SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
                WHERE id = $${paramIndex}
                RETURNING *
            `;
            
            const result = await pool.query(query, values);
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'UPDATE_PROJECT', 'PROJECT_MANAGEMENT', 
                 JSON.stringify({ projectId: id, updates }), req.ip]
            );
            
            res.json({
                message: 'Project updated successfully',
                project: result.rows[0]
            });
            
        } catch (error) {
            logger.error('Update project error:', error);
            res.status(500).json({
                error: 'Failed to update project',
                code: 'UPDATE_PROJECT_ERROR'
            });
        }
    }

    // Delete project
    async deleteProject(req, res) {
        try {
            const { id } = req.params;
            
            // Only CEO can delete projects
            if (req.user.role !== 'CEO') {
                return res.status(403).json({
                    error: 'Only CEO can delete projects',
                    code: 'ACCESS_DENIED'
                });
            }
            
            // Check if project has tasks
            const taskResult = await pool.query(
                'SELECT COUNT(*) as count FROM tasks WHERE project_id = $1',
                [id]
            );
            
            if (parseInt(taskResult.rows[0].count) > 0) {
                // Move tasks to archive or delete them
                await pool.query('DELETE FROM tasks WHERE project_id = $1', [id]);
            }
            
            const result = await pool.query(
                'DELETE FROM projects WHERE id = $1 RETURNING id',
                [id]
            );
            
            if (result.rows.length === 0) {
                return res.status(404).json({
                    error: 'Project not found',
                    code: 'PROJECT_NOT_FOUND'
                });
            }
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'DELETE_PROJECT', 'PROJECT_MANAGEMENT', 
                 JSON.stringify({ projectId: id }), req.ip]
            );
            
            res.json({
                message: 'Project deleted successfully'
            });
            
        } catch (error) {
            logger.error('Delete project error:', error);
            res.status(500).json({
                error: 'Failed to delete project',
                code: 'DELETE_PROJECT_ERROR'
            });
        }
    }

    // Get project timeline
    async getProjectTimeline(req, res) {
        try {
            const { id } = req.params;
            
            const result = await pool.query(
                `SELECT 
                    DATE_TRUNC('week', created_at) as week,
                    COUNT(*) as tasks_added,
                    COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) as tasks_completed
                 FROM tasks
                 WHERE project_id = $1
                 GROUP BY DATE_TRUNC('week', created_at)
                 ORDER BY week DESC
                 LIMIT 12`,
                [id]
            );
            
            res.json({ timeline: result.rows });
            
        } catch (error) {
            logger.error('Get project timeline error:', error);
            res.status(500).json({
                error: 'Failed to get project timeline',
                code: 'TIMELINE_ERROR'
            });
        }
    }

    // Get project budget
    async getProjectBudget(req, res) {
        try {
            const { id } = req.params;
            
            const projectResult = await pool.query(
                'SELECT budget FROM projects WHERE id = $1',
                [id]
            );
            
            if (projectResult.rows.length === 0) {
                return res.status(404).json({
                    error: 'Project not found',
                    code: 'PROJECT_NOT_FOUND'
                });
            }
            
            const budget = parseFloat(projectResult.rows[0].budget) || 0;
            
            const costResult = await pool.query(
                `SELECT COALESCE(SUM(estimated_hours * 50), 0) as estimated_cost,
                        COALESCE(SUM(actual_hours * 50), 0) as actual_cost
                 FROM tasks
                 WHERE project_id = $1`,
                [id]
            );
            
            res.json({
                projectId: id,
                budget,
                estimatedCost: parseFloat(costResult.rows[0].estimated_cost),
                actualCost: parseFloat(costResult.rows[0].actual_cost),
                remainingBudget: budget - parseFloat(costResult.rows[0].actual_cost)
            });
            
        } catch (error) {
            logger.error('Get project budget error:', error);
            res.status(500).json({
                error: 'Failed to get project budget',
                code: 'BUDGET_ERROR'
            });
        }
    }
}

module.exports = new ProjectController();