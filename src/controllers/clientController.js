const { pool } = require('../config/database');
const { logger } = require('../utils/logger');

class ClientController {
    // Create client
    async createClient(req, res) {
        try {
            const { companyName, contactName, email, phone, address, industry, notes } = req.body;
            
            const result = await pool.query(
                `INSERT INTO clients (company_name, contact_name, email, phone, address, industry, notes, created_by)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                 RETURNING *`,
                [companyName, contactName, email, phone, address, industry, notes, req.user.id]
            );
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'CREATE_CLIENT', 'CLIENT_CRM', 
                 JSON.stringify({ clientId: result.rows[0].id, companyName }), req.ip]
            );
            
            res.status(201).json({
                message: 'Client created successfully',
                client: result.rows[0]
            });
            
        } catch (error) {
            logger.error('Create client error:', error);
            res.status(500).json({
                error: 'Failed to create client',
                code: 'CREATE_CLIENT_ERROR'
            });
        }
    }

    // Get clients
    async getClients(req, res) {
        try {
            const { limit = 100, offset = 0, search = null } = req.query;
            
            let query = `
                SELECT id, company_name, contact_name, email, phone, address, industry, 
                       status, notes, assigned_to, created_by, created_at, updated_at
                FROM clients
                WHERE 1=1
            `;
            let values = [];
            let paramIndex = 1;
            
            if (search) {
                query += ` AND (company_name ILIKE $${paramIndex} OR contact_name ILIKE $${paramIndex} OR email ILIKE $${paramIndex})`;
                values.push(`%${search}%`);
                paramIndex++;
            }
            
            // Non-CEO users only see assigned clients
            if (req.user.role !== 'CEO') {
                query += ` AND (assigned_to = $${paramIndex} OR created_by = $${paramIndex})`;
                values.push(req.user.id);
                paramIndex++;
            }
            
            // Get total count
            const countQuery = query.replace(
                'SELECT id, company_name, contact_name, email, phone, address, industry, status, notes, assigned_to, created_by, created_at, updated_at',
                'SELECT COUNT(*) as total'
            );
            const countResult = await pool.query(countQuery, values);
            const total = parseInt(countResult.rows[0].total);
            
            // Get paginated results
            query += ` ORDER BY company_name ASC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
            values.push(parseInt(limit), parseInt(offset));
            
            const result = await pool.query(query, values);
            
            // Get related data
            const clients = await Promise.all(result.rows.map(async (client) => {
                // Get assigned user name
                if (client.assigned_to) {
                    const userResult = await pool.query(
                        'SELECT full_name FROM users WHERE id = $1',
                        [client.assigned_to]
                    );
                    client.assignedToName = userResult.rows[0]?.full_name || null;
                }
                
                // Get project count
                const projectResult = await pool.query(
                    'SELECT COUNT(*) as count FROM projects WHERE client_id = $1',
                    [client.id]
                );
                client.projectCount = parseInt(projectResult.rows[0].count);
                
                return client;
            }));
            
            res.json({
                clients,
                pagination: {
                    total,
                    limit: parseInt(limit),
                    offset: parseInt(offset),
                    totalPages: Math.ceil(total / parseInt(limit))
                }
            });
            
        } catch (error) {
            logger.error('Get clients error:', error);
            res.status(500).json({
                error: 'Failed to get clients',
                code: 'GET_CLIENTS_ERROR'
            });
        }
    }

    // Get client by ID
    async getClient(req, res) {
        try {
            const { id } = req.params;
            
            const result = await pool.query(
                `SELECT id, company_name, contact_name, email, phone, address, industry, 
                        status, notes, assigned_to, created_by, created_at, updated_at
                 FROM clients WHERE id = $1`,
                [id]
            );
            
            if (result.rows.length === 0) {
                return res.status(404).json({
                    error: 'Client not found',
                    code: 'CLIENT_NOT_FOUND'
                });
            }
            
            const client = result.rows[0];
            
            // Check permission
            if (req.user.role !== 'CEO' && 
                client.assigned_to !== req.user.id && 
                client.created_by !== req.user.id) {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            }
            
            // Get projects
            const projectsResult = await pool.query(
                `SELECT id, name, status, start_date, end_date, budget
                 FROM projects WHERE client_id = $1
                 ORDER BY created_at DESC`,
                [id]
            );
            client.projects = projectsResult.rows;
            
            // Get assigned user name
            if (client.assigned_to) {
                const userResult = await pool.query(
                    'SELECT full_name, email FROM users WHERE id = $1',
                    [client.assigned_to]
                );
                client.assignedToName = userResult.rows[0]?.full_name || null;
                client.assignedToEmail = userResult.rows[0]?.email || null;
            }
            
            res.json({ client });
            
        } catch (error) {
            logger.error('Get client error:', error);
            res.status(500).json({
                error: 'Failed to get client',
                code: 'GET_CLIENT_ERROR'
            });
        }
    }

    // Update client
    async updateClient(req, res) {
        try {
            const { id } = req.params;
            const updates = req.body;
            
            // Check if client exists
            const checkResult = await pool.query(
                'SELECT assigned_to, created_by FROM clients WHERE id = $1',
                [id]
            );
            
            if (checkResult.rows.length === 0) {
                return res.status(404).json({
                    error: 'Client not found',
                    code: 'CLIENT_NOT_FOUND'
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
                UPDATE clients 
                SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
                WHERE id = $${paramIndex}
                RETURNING *
            `;
            
            const result = await pool.query(query, values);
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'UPDATE_CLIENT', 'CLIENT_CRM', 
                 JSON.stringify({ clientId: id, updates }), req.ip]
            );
            
            res.json({
                message: 'Client updated successfully',
                client: result.rows[0]
            });
            
        } catch (error) {
            logger.error('Update client error:', error);
            res.status(500).json({
                error: 'Failed to update client',
                code: 'UPDATE_CLIENT_ERROR'
            });
        }
    }

    // Delete client
    async deleteClient(req, res) {
        try {
            const { id } = req.params;
            
            // Check if client exists
            const checkResult = await pool.query(
                'SELECT created_by FROM clients WHERE id = $1',
                [id]
            );
            
            if (checkResult.rows.length === 0) {
                return res.status(404).json({
                    error: 'Client not found',
                    code: 'CLIENT_NOT_FOUND'
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
            
            // Check if client has projects
            const projectResult = await pool.query(
                'SELECT COUNT(*) as count FROM projects WHERE client_id = $1',
                [id]
            );
            
            if (parseInt(projectResult.rows[0].count) > 0) {
                return res.status(400).json({
                    error: 'Cannot delete client with existing projects',
                    code: 'CLIENT_HAS_PROJECTS'
                });
            }
            
            await pool.query('DELETE FROM clients WHERE id = $1', [id]);
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'DELETE_CLIENT', 'CLIENT_CRM', 
                 JSON.stringify({ clientId: id }), req.ip]
            );
            
            res.json({
                message: 'Client deleted successfully'
            });
            
        } catch (error) {
            logger.error('Delete client error:', error);
            res.status(500).json({
                error: 'Failed to delete client',
                code: 'DELETE_CLIENT_ERROR'
            });
        }
    }

    // Assign client to user
    async assignClient(req, res) {
        try {
            const { id } = req.params;
            const { assignedTo } = req.body;
            
            // Only CEO can assign clients
            if (req.user.role !== 'CEO') {
                return res.status(403).json({
                    error: 'Only CEO can assign clients',
                    code: 'ACCESS_DENIED'
                });
            }
            
            const result = await pool.query(
                `UPDATE clients 
                 SET assigned_to = $1, updated_at = CURRENT_TIMESTAMP
                 WHERE id = $2
                 RETURNING *`,
                [assignedTo, id]
            );
            
            if (result.rows.length === 0) {
                return res.status(404).json({
                    error: 'Client not found',
                    code: 'CLIENT_NOT_FOUND'
                });
            }
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'ASSIGN_CLIENT', 'CLIENT_CRM', 
                 JSON.stringify({ clientId: id, assignedTo }), req.ip]
            );
            
            res.json({
                message: 'Client assigned successfully',
                client: result.rows[0]
            });
            
        } catch (error) {
            logger.error('Assign client error:', error);
            res.status(500).json({
                error: 'Failed to assign client',
                code: 'ASSIGN_CLIENT_ERROR'
            });
        }
    }
}

module.exports = new ClientController();