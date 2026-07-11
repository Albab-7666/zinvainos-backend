const { pool } = require('../config/database');
const { logger } = require('../utils/logger');

class ContractController {
    // Create contract
    async createContract(req, res) {
        try {
            const { 
                title, clientId, projectId, startDate, endDate,
                amount, paymentTerms, description, status = 'DRAFT'
            } = req.body;
            
            const result = await pool.query(
                `INSERT INTO contracts (
                    title, client_id, project_id, start_date, end_date,
                    amount, payment_terms, description, status, created_by
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                RETURNING *`,
                [title, clientId, projectId, startDate, endDate,
                 amount, paymentTerms, description, status, req.user.id]
            );
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'CREATE_CONTRACT', 'CONTRACT_MANAGEMENT', 
                 JSON.stringify({ contractId: result.rows[0].id, title }), req.ip]
            );
            
            res.status(201).json({
                message: 'Contract created successfully',
                contract: result.rows[0]
            });
            
        } catch (error) {
            logger.error('Create contract error:', error);
            res.status(500).json({
                error: 'Failed to create contract',
                code: 'CREATE_CONTRACT_ERROR'
            });
        }
    }

    // Get contracts
    async getContracts(req, res) {
        try {
            const { clientId, projectId, status, limit = 100, offset = 0 } = req.query;
            
            let query = `
                SELECT c.*, 
                       cl.company_name as client_name,
                       u.full_name as created_by_name
                FROM contracts c
                LEFT JOIN clients cl ON c.client_id = cl.id
                LEFT JOIN users u ON c.created_by = u.id
                WHERE 1=1
            `;
            let values = [];
            let paramIndex = 1;
            
            if (clientId) {
                query += ` AND c.client_id = $${paramIndex}`;
                values.push(clientId);
                paramIndex++;
            }
            
            if (projectId) {
                query += ` AND c.project_id = $${paramIndex}`;
                values.push(projectId);
                paramIndex++;
            }
            
            if (status) {
                query += ` AND c.status = $${paramIndex}`;
                values.push(status);
                paramIndex++;
            }
            
            // Role-based filtering
            if (req.user.role === 'EMPLOYEE') {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            }
            
            query += ` ORDER BY c.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
            values.push(parseInt(limit), parseInt(offset));
            
            const result = await pool.query(query, values);
            res.json({ contracts: result.rows });
            
        } catch (error) {
            logger.error('Get contracts error:', error);
            res.status(500).json({
                error: 'Failed to get contracts',
                code: 'GET_CONTRACTS_ERROR'
            });
        }
    }

    // Get contract by ID
    async getContract(req, res) {
        try {
            const { id } = req.params;
            
            const result = await pool.query(
                `SELECT c.*, 
                        cl.company_name as client_name,
                        u.full_name as created_by_name
                 FROM contracts c
                 LEFT JOIN clients cl ON c.client_id = cl.id
                 LEFT JOIN users u ON c.created_by = u.id
                 WHERE c.id = $1`,
                [id]
            );
            
            if (result.rows.length === 0) {
                return res.status(404).json({
                    error: 'Contract not found',
                    code: 'CONTRACT_NOT_FOUND'
                });
            }
            
            const contract = result.rows[0];
            
            // Check permission
            if (req.user.role === 'EMPLOYEE') {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            }
            
            // Get attachments
            const attachments = await pool.query(
                `SELECT id, filename, file_path, file_size, mime_type, created_at
                 FROM files 
                 WHERE module_type = 'CONTRACT' AND module_id = $1`,
                [id]
            );
            contract.attachments = attachments.rows;
            
            res.json({ contract });
            
        } catch (error) {
            logger.error('Get contract error:', error);
            res.status(500).json({
                error: 'Failed to get contract',
                code: 'GET_CONTRACT_ERROR'
            });
        }
    }

    // Update contract
    async updateContract(req, res) {
        try {
            const { id } = req.params;
            const updates = req.body;
            
            // Check permission
            if (req.user.role === 'EMPLOYEE') {
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
                UPDATE contracts 
                SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
                WHERE id = $${paramIndex}
                RETURNING *
            `;
            
            const result = await pool.query(query, values);
            
            if (result.rows.length === 0) {
                return res.status(404).json({
                    error: 'Contract not found',
                    code: 'CONTRACT_NOT_FOUND'
                });
            }
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'UPDATE_CONTRACT', 'CONTRACT_MANAGEMENT', 
                 JSON.stringify({ contractId: id, updates }), req.ip]
            );
            
            res.json({
                message: 'Contract updated successfully',
                contract: result.rows[0]
            });
            
        } catch (error) {
            logger.error('Update contract error:', error);
            res.status(500).json({
                error: 'Failed to update contract',
                code: 'UPDATE_CONTRACT_ERROR'
            });
        }
    }

    // Delete contract
    async deleteContract(req, res) {
        try {
            const { id } = req.params;
            
            // Only CEO can delete contracts
            if (req.user.role !== 'CEO') {
                return res.status(403).json({
                    error: 'Only CEO can delete contracts',
                    code: 'ACCESS_DENIED'
                });
            }
            
            const result = await pool.query(
                'DELETE FROM contracts WHERE id = $1 RETURNING id',
                [id]
            );
            
            if (result.rows.length === 0) {
                return res.status(404).json({
                    error: 'Contract not found',
                    code: 'CONTRACT_NOT_FOUND'
                });
            }
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'DELETE_CONTRACT', 'CONTRACT_MANAGEMENT', 
                 JSON.stringify({ contractId: id }), req.ip]
            );
            
            res.json({
                message: 'Contract deleted successfully'
            });
            
        } catch (error) {
            logger.error('Delete contract error:', error);
            res.status(500).json({
                error: 'Failed to delete contract',
                code: 'DELETE_CONTRACT_ERROR'
            });
        }
    }

    // Sign contract
    async signContract(req, res) {
        try {
            const { id } = req.params;
            const { signatureData } = req.body;
            
            const result = await pool.query(
                `UPDATE contracts 
                 SET status = 'SIGNED', 
                     signed_by = $1, 
                     signed_at = CURRENT_TIMESTAMP,
                     signature_data = $2,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $3
                 RETURNING *`,
                [req.user.id, signatureData, id]
            );
            
            if (result.rows.length === 0) {
                return res.status(404).json({
                    error: 'Contract not found',
                    code: 'CONTRACT_NOT_FOUND'
                });
            }
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'SIGN_CONTRACT', 'CONTRACT_MANAGEMENT', 
                 JSON.stringify({ contractId: id }), req.ip]
            );
            
            res.json({
                message: 'Contract signed successfully',
                contract: result.rows[0]
            });
            
        } catch (error) {
            logger.error('Sign contract error:', error);
            res.status(500).json({
                error: 'Failed to sign contract',
                code: 'SIGN_CONTRACT_ERROR'
            });
        }
    }
}

module.exports = new ContractController();