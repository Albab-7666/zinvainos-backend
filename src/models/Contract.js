const { pool } = require('../config/database');

class Contract {
    static async create({ title, clientId, projectId, startDate, endDate, amount, paymentTerms, description, status, createdBy }) {
        const result = await pool.query(
            `INSERT INTO contracts (title, client_id, project_id, start_date, end_date, amount, payment_terms, description, status, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             RETURNING *`,
            [title, clientId, projectId, startDate, endDate, amount, paymentTerms, description, status, createdBy]
        );
        return result.rows[0];
    }

    static async findAll({ clientId, projectId, status, limit = 100, offset = 0, userId = null, role = null }) {
        let query = 'SELECT * FROM contracts WHERE 1=1';
        let values = [];
        let paramIndex = 1;

        if (clientId) {
            query += ` AND client_id = $${paramIndex}`;
            values.push(clientId);
            paramIndex++;
        }
        if (projectId) {
            query += ` AND project_id = $${paramIndex}`;
            values.push(projectId);
            paramIndex++;
        }
        if (status) {
            query += ` AND status = $${paramIndex}`;
            values.push(status);
            paramIndex++;
        }
        if (role === 'EMPLOYEE') {
            query += ` AND created_by = $${paramIndex}`;
            values.push(userId);
            paramIndex++;
        }

        query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        values.push(limit, offset);

        const result = await pool.query(query, values);
        return result.rows;
    }

    static async findById(id) {
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
        return result.rows[0];
    }

    static async update(id, updates) {
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

        if (fields.length === 0) return null;

        values.push(id);
        const query = `
            UPDATE contracts 
            SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
            WHERE id = $${paramIndex}
            RETURNING *
        `;
        const result = await pool.query(query, values);
        return result.rows[0];
    }

    static async sign(id, userId, signatureData) {
        const result = await pool.query(
            `UPDATE contracts 
             SET status = 'SIGNED', signed_by = $1, signed_at = CURRENT_TIMESTAMP, signature_data = $2
             WHERE id = $3
             RETURNING *`,
            [userId, signatureData, id]
        );
        return result.rows[0];
    }

    static async delete(id) {
        const result = await pool.query('DELETE FROM contracts WHERE id = $1 RETURNING id', [id]);
        return result.rows[0];
    }
}

module.exports = Contract;