const { pool } = require('../config/database');

class Attendance {
    static async checkIn(userId) {
        const today = new Date().toISOString().split('T')[0];
        const now = new Date();

        const existing = await pool.query(
            'SELECT id FROM attendance WHERE user_id = $1 AND date = $2 AND check_out IS NULL',
            [userId, today]
        );

        if (existing.rows.length > 0) {
            return null;
        }

        const result = await pool.query(
            `INSERT INTO attendance (user_id, date, check_in, status)
             VALUES ($1, $2, $3, 'PRESENT')
             ON CONFLICT (user_id, date) DO UPDATE 
             SET check_in = EXCLUDED.check_in, status = 'PRESENT'
             RETURNING *`,
            [userId, today, now]
        );
        return result.rows[0];
    }

    static async checkOut(userId) {
        const today = new Date().toISOString().split('T')[0];
        const now = new Date();

        const existing = await pool.query(
            'SELECT id, check_in FROM attendance WHERE user_id = $1 AND date = $2 AND check_out IS NULL',
            [userId, today]
        );

        if (existing.rows.length === 0) {
            return null;
        }

        const checkInTime = new Date(existing.rows[0].check_in);
        const durationMinutes = Math.floor((now - checkInTime) / (1000 * 60));

        const result = await pool.query(
            `UPDATE attendance 
             SET check_out = $1, 
                 overtime_minutes = GREATEST($2 - 480, 0),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $3
             RETURNING *`,
            [now, durationMinutes, existing.rows[0].id]
        );
        return result.rows[0];
    }

    static async findByUser(userId, { startDate, endDate, limit = 100, offset = 0 }) {
        let query = 'SELECT * FROM attendance WHERE user_id = $1';
        let values = [userId];
        let paramIndex = 2;

        if (startDate) {
            query += ` AND date >= $${paramIndex}`;
            values.push(startDate);
            paramIndex++;
        }
        if (endDate) {
            query += ` AND date <= $${paramIndex}`;
            values.push(endDate);
            paramIndex++;
        }

        query += ` ORDER BY date DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        values.push(limit, offset);

        const result = await pool.query(query, values);
        return result.rows;
    }

    static async getSummary(userId, period = 'month') {
        let dateFilter;
        if (period === 'week') {
            dateFilter = "DATE_TRUNC('week', date)";
        } else if (period === 'year') {
            dateFilter = "DATE_TRUNC('year', date)";
        } else {
            dateFilter = "DATE_TRUNC('month', date)";
        }

        const result = await pool.query(
            `SELECT 
                ${dateFilter} as period,
                COUNT(*) as total_days,
                COUNT(CASE WHEN status = 'PRESENT' THEN 1 END) as present_days,
                COUNT(CASE WHEN status = 'ABSENT' THEN 1 END) as absent_days,
                COALESCE(SUM(overtime_minutes), 0) as total_overtime_minutes
             FROM attendance
             WHERE user_id = $1
             GROUP BY period
             ORDER BY period DESC`,
            [userId]
        );
        return result.rows;
    }
}

module.exports = Attendance;