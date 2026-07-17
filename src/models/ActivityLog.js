const { pool } = require('../config/database');

class ActivityLog {
    static async create({ userId, action, module, details, ipAddress }) {
        const result = await pool.query(
            `INSERT INTO activity_logs (user_id, action, module, details, ip_address, created_at)
             VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
             RETURNING *`,
            [userId, action, module, JSON.stringify(details), ipAddress]
        );
        return result.rows[0];
    }

    static async getLogs({ userId, module, action, startDate, endDate, limit = 100, offset = 0 }) {
        let query = 'SELECT * FROM activity_logs WHERE 1=1';
        let values = [];
        let paramIndex = 1;

        if (userId) {
            query += ` AND user_id = $${paramIndex}`;
            values.push(userId);
            paramIndex++;
        }
        if (module) {
            query += ` AND module = $${paramIndex}`;
            values.push(module);
            paramIndex++;
        }
        if (action) {
            query += ` AND action = $${paramIndex}`;
            values.push(action);
            paramIndex++;
        }
        if (startDate) {
            query += ` AND created_at >= $${paramIndex}`;
            values.push(startDate);
            paramIndex++;
        }
        if (endDate) {
            query += ` AND created_at <= $${paramIndex}`;
            values.push(endDate);
            paramIndex++;
        }

        query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        values.push(limit, offset);

        const result = await pool.query(query, values);
        return result.rows;
    }

    static async getSummary() {
        const result = await pool.query(
            `SELECT 
                module,
                COUNT(*) as count,
                DATE_TRUNC('day', created_at) as date
             FROM activity_logs
             GROUP BY module, DATE_TRUNC('day', created_at)
             ORDER BY date DESC
             LIMIT 30`
        );
        return result.rows;
    }
}

module.exports = ActivityLog;