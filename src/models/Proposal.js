const { pool } = require('../config/database');

class Proposal {
    static async create({ title, clientId, projectId, description, amount, items, validUntil, status, createdBy }) {
        const result = await pool.query(
            `INSERT INTO proposals (title, client_id, project_id, description, amount, items, valid_until, status, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING *`,
            [title, clientId, projectId, description, amount, JSON.stringify(items), validUntil, status, createdBy]
        );
        return result.rows[0];
    }

    static async findAll({ clientId, projectId, status, limit = 100, offset = 0, userId = null, role = null }) {
        let query = `
            SELECT p.*, c.company_name as client_name, u.full_name as created_by_name
            FROM proposals p
            LEFT JOIN clients c ON p.client_id = c.id
            LEFT JOIN users u ON p.created_by = u.id
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
        if (role === 'EMPLOYEE') {
            return [];
        } else if (role === 'TEAM_MEMBER' && userId) {
            query += ` AND p.created_by = $${paramIndex}`;
            values.push(userId);
            paramIndex++;
        }

        query += ` ORDER BY p.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        values.push(limit, offset);

        const result = await pool.query(query, values);
        return result.rows;
    }

    static async findById(id) {
        const result = await pool.query(
            `SELECT p.*, c.company_name as client_name, u.full_name as created_by_name
             FROM proposals p
             LEFT JOIN clients c ON p.client_id = c.id
             LEFT JOIN users u ON p.created_by = u.id
             WHERE p.id = $1`,
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
            UPDATE proposals 
            SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
            WHERE id = $${paramIndex}
            RETURNING *
        `;
        const result = await pool.query(query, values);
        return result.rows[0];
    }

    static async convertToInvoice(id) {
        const result = await pool.query(
            `UPDATE proposals SET status = 'CONVERTED', updated_at = CURRENT_TIMESTAMP
             WHERE id = $1
             RETURNING *`,
            [id]
        );
        return result.rows[0];
    }

    static async delete(id) {
        const result = await pool.query('DELETE FROM proposals WHERE id = $1 RETURNING id', [id]);
        return result.rows[0];
    }
}

module.exports = Proposal;