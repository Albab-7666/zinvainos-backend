const { pool } = require('../config/database');

class Announcement {
    static async create({ title, content, priority, targetRoles, targetDepartments, expiresAt, createdBy }) {
        const result = await pool.query(
            `INSERT INTO announcements (title, content, priority, target_roles, target_departments, expires_at, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [title, content, priority, targetRoles, targetDepartments, expiresAt, createdBy]
        );
        return result.rows[0];
    }

    static async findAll({ limit = 50, offset = 0, includeExpired = false }) {
        let query = 'SELECT * FROM announcements WHERE 1=1';
        let values = [];
        let paramIndex = 1;

        if (!includeExpired) {
            query += ` AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)`;
        }

        query += ` ORDER BY 
            CASE priority 
                WHEN 'URGENT' THEN 1 
                WHEN 'HIGH' THEN 2 
                WHEN 'NORMAL' THEN 3 
                WHEN 'LOW' THEN 4 
            END,
            created_at DESC
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        values.push(limit, offset);

        const result = await pool.query(query, values);
        return result.rows;
    }

    static async findById(id) {
        const result = await pool.query('SELECT * FROM announcements WHERE id = $1', [id]);
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
            UPDATE announcements 
            SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
            WHERE id = $${paramIndex}
            RETURNING *
        `;
        const result = await pool.query(query, values);
        return result.rows[0];
    }

    static async delete(id) {
        const result = await pool.query('DELETE FROM announcements WHERE id = $1 RETURNING id', [id]);
        return result.rows[0];
    }

    static async markAsRead(announcementId, userId) {
        const result = await pool.query(
            `INSERT INTO announcement_reads (announcement_id, user_id, read_at)
             VALUES ($1, $2, CURRENT_TIMESTAMP)
             ON CONFLICT (announcement_id, user_id) DO NOTHING
             RETURNING *`,
            [announcementId, userId]
        );
        return result.rows[0];
    }
}

module.exports = Announcement;