const { pool } = require('../config/database');

class Approval {
    static async create({ moduleType, moduleId, requestedBy, comments }) {
        const result = await pool.query(
            `INSERT INTO approvals (module_type, module_id, requested_by, status, comments)
             VALUES ($1, $2, $3, 'PENDING', $4)
             RETURNING *`,
            [moduleType, moduleId, requestedBy, comments]
        );
        return result.rows[0];
    }

    static async findPending() {
        const result = await pool.query(
            `SELECT a.*, u.full_name as requested_by_name
             FROM approvals a
             LEFT JOIN users u ON a.requested_by = u.id
             WHERE a.status = 'PENDING'
             ORDER BY a.created_at ASC`
        );
        return result.rows;
    }

    static async findById(id) {
        const result = await pool.query('SELECT * FROM approvals WHERE id = $1', [id]);
        return result.rows[0];
    }

    static async updateStatus(id, status, approvedBy, comments) {
        const result = await pool.query(
            `UPDATE approvals 
             SET status = $1, approved_by = $2, comments = COALESCE($3, comments), updated_at = CURRENT_TIMESTAMP
             WHERE id = $4
             RETURNING *`,
            [status, approvedBy, comments, id]
        );
        return result.rows[0];
    }

    static async getHistory({ limit = 100, offset = 0, status = null }) {
        let query = 'SELECT * FROM approvals WHERE 1=1';
        let values = [];
        let paramIndex = 1;

        if (status) {
            query += ` AND status = $${paramIndex}`;
            values.push(status);
            paramIndex++;
        }

        query += ` ORDER BY updated_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        values.push(limit, offset);

        const result = await pool.query(query, values);
        return result.rows;
    }
}

module.exports = Approval;