const { pool } = require('../config/database');

class TimeEntry {
    static async start({ userId, taskId, projectId, description }) {
        const result = await pool.query(
            `INSERT INTO time_entries (user_id, task_id, project_id, start_time, description)
             VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4)
             RETURNING *`,
            [userId, taskId, projectId, description]
        );
        return result.rows[0];
    }

    static async stop(id, userId) {
        const result = await pool.query(
            `UPDATE time_entries 
             SET end_time = CURRENT_TIMESTAMP,
                 duration_minutes = EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - start_time)) / 60
             WHERE id = $1 AND user_id = $2 AND end_time IS NULL
             RETURNING *`,
            [id, userId]
        );
        return result.rows[0];
    }

    static async findByUser(userId, { taskId, projectId, startDate, endDate, limit = 100, offset = 0 }) {
        let query = 'SELECT * FROM time_entries WHERE user_id = $1';
        let values = [userId];
        let paramIndex = 2;

        if (taskId) {
            query += ` AND task_id = $${paramIndex}`;
            values.push(taskId);
            paramIndex++;
        }
        if (projectId) {
            query += ` AND project_id = $${paramIndex}`;
            values.push(projectId);
            paramIndex++;
        }
        if (startDate) {
            query += ` AND start_time >= $${paramIndex}`;
            values.push(startDate);
            paramIndex++;
        }
        if (endDate) {
            query += ` AND start_time <= $${paramIndex}`;
            values.push(endDate);
            paramIndex++;
        }

        query += ` ORDER BY start_time DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        values.push(limit, offset);

        const result = await pool.query(query, values);
        return result.rows;
    }

    static async findAll({ userId, taskId, projectId, startDate, endDate, limit = 100, offset = 0 }) {
        let query = `
            SELECT te.*, u.full_name as user_name, t.title as task_title, p.name as project_name
            FROM time_entries te
            LEFT JOIN users u ON te.user_id = u.id
            LEFT JOIN tasks t ON te.task_id = t.id
            LEFT JOIN projects p ON te.project_id = p.id
            WHERE 1=1
        `;
        let values = [];
        let paramIndex = 1;

        if (userId) {
            query += ` AND te.user_id = $${paramIndex}`;
            values.push(userId);
            paramIndex++;
        }
        if (taskId) {
            query += ` AND te.task_id = $${paramIndex}`;
            values.push(taskId);
            paramIndex++;
        }
        if (projectId) {
            query += ` AND te.project_id = $${paramIndex}`;
            values.push(projectId);
            paramIndex++;
        }
        if (startDate) {
            query += ` AND te.start_time >= $${paramIndex}`;
            values.push(startDate);
            paramIndex++;
        }
        if (endDate) {
            query += ` AND te.start_time <= $${paramIndex}`;
            values.push(endDate);
            paramIndex++;
        }

        query += ` ORDER BY te.start_time DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        values.push(limit, offset);

        const result = await pool.query(query, values);
        return result.rows;
    }

    static async getActive(userId) {
        const result = await pool.query(
            'SELECT * FROM time_entries WHERE user_id = $1 AND end_time IS NULL',
            [userId]
        );
        return result.rows[0];
    }

    static async update(id, userId, updates) {
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

        values.push(id, userId);
        const query = `
            UPDATE time_entries 
            SET ${fields.join(', ')}
            WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
            RETURNING *
        `;
        const result = await pool.query(query, values);
        return result.rows[0];
    }

    static async delete(id, userId) {
        const result = await pool.query(
            'DELETE FROM time_entries WHERE id = $1 AND user_id = $2 RETURNING id',
            [id, userId]
        );
        return result.rows[0];
    }

    static async getReport({ userId, period = 'week' }) {
        let dateFilter;
        if (period === 'week') {
            dateFilter = "DATE_TRUNC('week', start_time)";
        } else if (period === 'month') {
            dateFilter = "DATE_TRUNC('month', start_time)";
        } else {
            dateFilter = "DATE_TRUNC('day', start_time)";
        }

        let query = `
            SELECT 
                ${dateFilter} as period,
                user_id,
                COUNT(*) as entries_count,
                COALESCE(SUM(duration_minutes), 0) as total_minutes
            FROM time_entries
            WHERE end_time IS NOT NULL
        `;
        let values = [];
        let paramIndex = 1;

        if (userId) {
            query += ` AND user_id = $${paramIndex}`;
            values.push(userId);
            paramIndex++;
        }

        query += ` GROUP BY period, user_id ORDER BY period DESC`;

        const result = await pool.query(query, values);
        return result.rows;
    }
}

module.exports = TimeEntry;