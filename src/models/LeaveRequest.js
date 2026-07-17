const { pool } = require('../config/database');

class LeaveRequest {
    static async create({ userId, leaveType, startDate, endDate, reason }) {
        const result = await pool.query(
            `INSERT INTO leave_requests (user_id, leave_type, start_date, end_date, reason, status)
             VALUES ($1, $2, $3, $4, $5, 'PENDING')
             RETURNING *`,
            [userId, leaveType, startDate, endDate, reason]
        );
        return result.rows[0];
    }

    static async findByUser(userId, { status, leaveType, startDate, endDate, limit = 100, offset = 0 }) {
        let query = 'SELECT * FROM leave_requests WHERE user_id = $1';
        let values = [userId];
        let paramIndex = 2;

        if (status) {
            query += ` AND status = $${paramIndex}`;
            values.push(status);
            paramIndex++;
        }
        if (leaveType) {
            query += ` AND leave_type = $${paramIndex}`;
            values.push(leaveType);
            paramIndex++;
        }
        if (startDate) {
            query += ` AND start_date >= $${paramIndex}`;
            values.push(startDate);
            paramIndex++;
        }
        if (endDate) {
            query += ` AND end_date <= $${paramIndex}`;
            values.push(endDate);
            paramIndex++;
        }

        query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        values.push(limit, offset);

        const result = await pool.query(query, values);
        return result.rows;
    }

    static async findAll({ status, leaveType, startDate, endDate, limit = 100, offset = 0 }) {
        let query = 'SELECT * FROM leave_requests WHERE 1=1';
        let values = [];
        let paramIndex = 1;

        if (status) {
            query += ` AND status = $${paramIndex}`;
            values.push(status);
            paramIndex++;
        }
        if (leaveType) {
            query += ` AND leave_type = $${paramIndex}`;
            values.push(leaveType);
            paramIndex++;
        }
        if (startDate) {
            query += ` AND start_date >= $${paramIndex}`;
            values.push(startDate);
            paramIndex++;
        }
        if (endDate) {
            query += ` AND end_date <= $${paramIndex}`;
            values.push(endDate);
            paramIndex++;
        }

        query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        values.push(limit, offset);

        const result = await pool.query(query, values);
        return result.rows;
    }

    static async findById(id) {
        const result = await pool.query('SELECT * FROM leave_requests WHERE id = $1', [id]);
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
            UPDATE leave_requests 
            SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
            WHERE id = $${paramIndex}
            RETURNING *
        `;
        const result = await pool.query(query, values);
        return result.rows[0];
    }

    static async updateStatus(id, status, approvedBy, comments) {
        const result = await pool.query(
            `UPDATE leave_requests 
             SET status = $1, approved_by = $2, approved_at = CURRENT_TIMESTAMP, comments = COALESCE($3, comments)
             WHERE id = $4
             RETURNING *`,
            [status, approvedBy, comments, id]
        );
        return result.rows[0];
    }

    static async delete(id) {
        const result = await pool.query('DELETE FROM leave_requests WHERE id = $1 RETURNING id', [id]);
        return result.rows[0];
    }

    static async getBalance(userId) {
        const result = await pool.query(
            `SELECT 
                leave_type,
                COUNT(*) as used_count,
                COALESCE(SUM((end_date - start_date) + 1), 0) as used_days
             FROM leave_requests 
             WHERE user_id = $1 AND status = 'APPROVED'
             GROUP BY leave_type`,
            [userId]
        );
        return result.rows;
    }
}

module.exports = LeaveRequest;