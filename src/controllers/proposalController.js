const { pool } = require('../config/database');
const { logger } = require('../utils/logger');

class ProposalController {
    // Create proposal
    async createProposal(req, res) {
        try {
            const { 
                title, clientId, projectId, description, 
                amount, items, validUntil, status = 'DRAFT'
            } = req.body;
            
            const result = await pool.query(
                `INSERT INTO proposals (
                    title, client_id, project_id, description,
                    amount, items, valid_until, status, created_by
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING *`,
                [title, clientId, projectId, description,
                 amount, JSON.stringify(items), validUntil, status, req.user.id]
            );
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'CREATE_PROPOSAL', 'PROPOSAL_QUOTATION', 
                 JSON.stringify({ proposalId: result.rows[0].id, title }), req.ip]
            );
            
            res.status(201).json({
                message: 'Proposal created successfully',
                proposal: result.rows[0]
            });
            
        } catch (error) {
            logger.error('Create proposal error:', error);
            res.status(500).json({
                error: 'Failed to create proposal',
                code: 'CREATE_PROPOSAL_ERROR'
            });
        }
    }

    // Get proposals
    async getProposals(req, res) {
        try {
            const { 
                clientId, projectId, status, 
                limit = 100, offset = 0 
            } = req.query;
            
            let query = `
                SELECT p.*, 
                       c.company_name as client_name,
                       u.full_name as created_by_name,
                       proj.name as project_name
                FROM proposals p
                LEFT JOIN clients c ON p.client_id = c.id
                LEFT JOIN users u ON p.created_by = u.id
                LEFT JOIN projects proj ON p.project_id = proj.id
                WHERE 1=1
            `;
            let values = [];
            let paramIndex = 1;
            
            if (clientId) {
                query += ` AND p.client_id = $${paramIndex}`;
                values.push(clientId);
                paramIndex++;
            }
            
            if (projectId) {
                query += ` AND p.project_id = $${paramIndex}`;
                values.push(projectId);
                paramIndex++;
            }
            
            if (status) {
                query += ` AND p.status = $${paramIndex}`;
                values.push(status);
                paramIndex++;
            }
            
            // Role-based filtering
            if (req.user.role === 'EMPLOYEE') {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            } else if (req.user.role === 'TEAM_MEMBER') {
                query += ` AND p.created_by = $${paramIndex}`;
                values.push(req.user.id);
                paramIndex++;
            }
            
            query += ` ORDER BY p.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
            values.push(parseInt(limit), parseInt(offset));
            
            const result = await pool.query(query, values);
            res.json({ proposals: result.rows });
            
        } catch (error) {
            logger.error('Get proposals error:', error);
            res.status(500).json({
                error: 'Failed to get proposals',
                code: 'GET_PROPOSALS_ERROR'
            });
        }
    }

    // Get proposal by ID
    async getProposal(req, res) {
        try {
            const { id } = req.params;
            
            const result = await pool.query(
                `SELECT p.*, 
                        c.company_name as client_name,
                        u.full_name as created_by_name
                 FROM proposals p
                 LEFT JOIN clients c ON p.client_id = c.id
                 LEFT JOIN users u ON p.created_by = u.id
                 WHERE p.id = $1`,
                [id]
            );
            
            if (result.rows.length === 0) {
                return res.status(404).json({
                    error: 'Proposal not found',
                    code: 'PROPOSAL_NOT_FOUND'
                });
            }
            
            const proposal = result.rows[0];
            
            // Check permission
            if (req.user.role === 'EMPLOYEE') {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            }
            
            res.json({ proposal });
            
        } catch (error) {
            logger.error('Get proposal error:', error);
            res.status(500).json({
                error: 'Failed to get proposal',
                code: 'GET_PROPOSAL_ERROR'
            });
        }
    }

    // Update proposal
    async updateProposal(req, res) {
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
                UPDATE proposals 
                SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
                WHERE id = $${paramIndex}
                RETURNING *
            `;
            
            const result = await pool.query(query, values);
            
            if (result.rows.length === 0) {
                return res.status(404).json({
                    error: 'Proposal not found',
                    code: 'PROPOSAL_NOT_FOUND'
                });
            }
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'UPDATE_PROPOSAL', 'PROPOSAL_QUOTATION', 
                 JSON.stringify({ proposalId: id, updates }), req.ip]
            );
            
            res.json({
                message: 'Proposal updated successfully',
                proposal: result.rows[0]
            });
            
        } catch (error) {
            logger.error('Update proposal error:', error);
            res.status(500).json({
                error: 'Failed to update proposal',
                code: 'UPDATE_PROPOSAL_ERROR'
            });
        }
    }

    // Delete proposal
    async deleteProposal(req, res) {
        try {
            const { id } = req.params;
            
            // Only CEO can delete proposals
            if (req.user.role !== 'CEO') {
                return res.status(403).json({
                    error: 'Only CEO can delete proposals',
                    code: 'ACCESS_DENIED'
                });
            }
            
            const result = await pool.query(
                'DELETE FROM proposals WHERE id = $1 RETURNING id',
                [id]
            );
            
            if (result.rows.length === 0) {
                return res.status(404).json({
                    error: 'Proposal not found',
                    code: 'PROPOSAL_NOT_FOUND'
                });
            }
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'DELETE_PROPOSAL', 'PROPOSAL_QUOTATION', 
                 JSON.stringify({ proposalId: id }), req.ip]
            );
            
            res.json({
                message: 'Proposal deleted successfully'
            });
            
        } catch (error) {
            logger.error('Delete proposal error:', error);
            res.status(500).json({
                error: 'Failed to delete proposal',
                code: 'DELETE_PROPOSAL_ERROR'
            });
        }
    }

    // Convert to invoice
    async convertToInvoice(req, res) {
        try {
            const { id } = req.params;
            
            const proposalResult = await pool.query(
                'SELECT * FROM proposals WHERE id = $1',
                [id]
            );
            
            if (proposalResult.rows.length === 0) {
                return res.status(404).json({
                    error: 'Proposal not found',
                    code: 'PROPOSAL_NOT_FOUND'
                });
            }
            
            const proposal = proposalResult.rows[0];
            
            // Generate invoice
            const invoiceResult = await pool.query(
                `INSERT INTO invoices (
                    invoice_number, client_id, project_id,
                    issue_date, due_date, subtotal, total,
                    status, created_by
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING *`,
                [
                    `INV-${Date.now()}`, proposal.client_id, proposal.project_id,
                    new Date().toISOString().split('T')[0],
                    proposal.valid_until || new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0],
                    proposal.amount, proposal.amount,
                    'DRAFT', req.user.id
                ]
            );
            
            // Update proposal status
            await pool.query(
                'UPDATE proposals SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                ['CONVERTED', id]
            );
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'CONVERT_PROPOSAL_TO_INVOICE', 'PROPOSAL_QUOTATION', 
                 JSON.stringify({ proposalId: id, invoiceId: invoiceResult.rows[0].id }), req.ip]
            );
            
            res.json({
                message: 'Proposal converted to invoice successfully',
                invoice: invoiceResult.rows[0]
            });
            
        } catch (error) {
            logger.error('Convert to invoice error:', error);
            res.status(500).json({
                error: 'Failed to convert proposal to invoice',
                code: 'CONVERT_TO_INVOICE_ERROR'
            });
        }
    }
}

module.exports = new ProposalController();