const { pool } = require('../config/database');
const { logger } = require('../utils/logger');

class SearchController {
    // Global search
    async globalSearch(req, res) {
        try {
            const { query, type, limit = 20 } = req.query;
            
            if (!query || query.length < 2) {
                return res.status(400).json({
                    error: 'Search query must be at least 2 characters',
                    code: 'INVALID_SEARCH_QUERY'
                });
            }
            
            const searchTerm = `%${query}%`;
            const results = [];
            
            // Search users (CEO only or limited for others)
            if (!type || type === 'users') {
                const usersResult = await pool.query(
                    `SELECT 
                        'user' as result_type,
                        id,
                        full_name as title,
                        email as description,
                        role,
                        status,
                        NULL as link
                     FROM users
                     WHERE full_name ILIKE $1 OR email ILIKE $1
                     LIMIT $2`,
                    [searchTerm, parseInt(limit)]
                );
                results.push(...usersResult.rows);
            }
            
            // Search projects
            if (!type || type === 'projects') {
                let projectQuery = `
                    SELECT 
                        'project' as result_type,
                        id,
                        name as title,
                        description,
                        status,
                        created_at,
                        '/projects/' || id as link
                    FROM projects
                    WHERE name ILIKE $1 OR description ILIKE $1
                `;
                let values = [searchTerm];
                
                // Role-based filtering
                if (req.user.role === 'EMPLOYEE') {
                    projectQuery += ` AND id IN (
                        SELECT DISTINCT project_id FROM tasks WHERE assigned_to = $2
                    )`;
                    values.push(req.user.id);
                } else if (req.user.role === 'TEAM_MEMBER') {
                    projectQuery += ` AND (assigned_to = $2 OR created_by = $2)`;
                    values.push(req.user.id);
                }
                
                projectQuery += ` LIMIT $${values.length + 1}`;
                values.push(parseInt(limit));
                
                const projectsResult = await pool.query(projectQuery, values);
                results.push(...projectsResult.rows);
            }
            
            // Search tasks
            if (!type || type === 'tasks') {
                let taskQuery = `
                    SELECT 
                        'task' as result_type,
                        t.id,
                        t.title,
                        t.description,
                        t.status,
                        t.priority,
                        p.name as project_name,
                        '/tasks/' || t.id as link
                    FROM tasks t
                    LEFT JOIN projects p ON t.project_id = p.id
                    WHERE t.title ILIKE $1 OR t.description ILIKE $1
                `;
                let values = [searchTerm];
                
                // Role-based filtering
                if (req.user.role === 'EMPLOYEE') {
                    taskQuery += ` AND t.assigned_to = $2`;
                    values.push(req.user.id);
                } else if (req.user.role === 'TEAM_MEMBER') {
                    taskQuery += ` AND (t.assigned_to = $2 OR t.created_by = $2)`;
                    values.push(req.user.id);
                }
                
                taskQuery += ` LIMIT $${values.length + 1}`;
                values.push(parseInt(limit));
                
                const tasksResult = await pool.query(taskQuery, values);
                results.push(...tasksResult.rows);
            }
            
            // Search clients (CEO and Team Members only)
            if ((!type || type === 'clients') && req.user.role !== 'EMPLOYEE') {
                let clientQuery = `
                    SELECT 
                        'client' as result_type,
                        id,
                        company_name as title,
                        contact_name as description,
                        email,
                        '/clients/' || id as link
                    FROM clients
                    WHERE company_name ILIKE $1 OR contact_name ILIKE $1 OR email ILIKE $1
                `;
                let values = [searchTerm];
                
                if (req.user.role === 'TEAM_MEMBER') {
                    clientQuery += ` AND (assigned_to = $2 OR created_by = $2)`;
                    values.push(req.user.id);
                }
                
                clientQuery += ` LIMIT $${values.length + 1}`;
                values.push(parseInt(limit));
                
                const clientsResult = await pool.query(clientQuery, values);
                results.push(...clientsResult.rows);
            }
            
            // Search files
            if ((!type || type === 'files') && req.user.role !== 'EMPLOYEE') {
                const filesResult = await pool.query(
                    `SELECT 
                        'file' as result_type,
                        id,
                        filename as title,
                        mime_type as description,
                        file_size,
                        '/files/' || id as link
                     FROM files
                     WHERE filename ILIKE $1
                     LIMIT $2`,
                    [searchTerm, parseInt(limit)]
                );
                results.push(...filesResult.rows);
            }
            
            // Log search
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'GLOBAL_SEARCH', 'GLOBAL_SEARCH', 
                 JSON.stringify({ query, resultCount: results.length }), req.ip]
            );
            
            // Group results by type
            const groupedResults = {
                users: results.filter(r => r.result_type === 'user'),
                projects: results.filter(r => r.result_type === 'project'),
                tasks: results.filter(r => r.result_type === 'task'),
                clients: results.filter(r => r.result_type === 'client'),
                files: results.filter(r => r.result_type === 'file')
            };
            
            res.json({
                query,
                totalResults: results.length,
                results: groupedResults
            });
            
        } catch (error) {
            logger.error('Global search error:', error);
            res.status(500).json({
                error: 'Failed to perform search',
                code: 'SEARCH_ERROR'
            });
        }
    }

    // Advanced search with filters
    async advancedSearch(req, res) {
        try {
            const { 
                query, types, status, priority, 
                dateFrom, dateTo, assignedTo, limit = 50 
            } = req.body;
            
            const results = [];
            
            // Build search based on types
            const searchTypes = types || ['tasks', 'projects', 'clients', 'users'];
            
            for (const type of searchTypes) {
                let sql = '';
                let values = [];
                let paramIndex = 1;
                
                switch (type) {
                    case 'tasks':
                        sql = `
                            SELECT 
                                'task' as result_type,
                                t.id,
                                t.title,
                                t.description,
                                t.status,
                                t.priority,
                                t.due_date,
                                p.name as project_name,
                                u.full_name as assigned_to_name,
                                '/tasks/' || t.id as link
                            FROM tasks t
                            LEFT JOIN projects p ON t.project_id = p.id
                            LEFT JOIN users u ON t.assigned_to = u.id
                            WHERE 1=1
                        `;
                        
                        if (query) {
                            sql += ` AND (t.title ILIKE $${paramIndex} OR t.description ILIKE $${paramIndex})`;
                            values.push(`%${query}%`);
                            paramIndex++;
                        }
                        
                        if (status) {
                            sql += ` AND t.status = $${paramIndex}`;
                            values.push(status);
                            paramIndex++;
                        }
                        
                        if (priority) {
                            sql += ` AND t.priority = $${paramIndex}`;
                            values.push(priority);
                            paramIndex++;
                        }
                        
                        if (dateFrom) {
                            sql += ` AND t.due_date >= $${paramIndex}`;
                            values.push(dateFrom);
                            paramIndex++;
                        }
                        
                        if (dateTo) {
                            sql += ` AND t.due_date <= $${paramIndex}`;
                            values.push(dateTo);
                            paramIndex++;
                        }
                        
                        if (assignedTo) {
                            sql += ` AND t.assigned_to = $${paramIndex}`;
                            values.push(assignedTo);
                            paramIndex++;
                        }
                        
                        // Role-based filtering
                        if (req.user.role === 'EMPLOYEE') {
                            sql += ` AND t.assigned_to = $${paramIndex}`;
                            values.push(req.user.id);
                            paramIndex++;
                        } else if (req.user.role === 'TEAM_MEMBER') {
                            sql += ` AND (t.assigned_to = $${paramIndex} OR t.created_by = $${paramIndex})`;
                            values.push(req.user.id);
                            paramIndex++;
                        }
                        
                        sql += ` LIMIT $${paramIndex}`;
                        values.push(parseInt(limit));
                        
                        const result = await pool.query(sql, values);
                        results.push(...result.rows);
                        break;
                        
                    case 'projects':
                        // Similar for projects
                        break;
                        
                    // Add other types similarly
                }
            }
            
            res.json({
                query,
                totalResults: results.length,
                results
            });
            
        } catch (error) {
            logger.error('Advanced search error:', error);
            res.status(500).json({
                error: 'Failed to perform advanced search',
                code: 'ADVANCED_SEARCH_ERROR'
            });
        }
    }
}

module.exports = new SearchController();