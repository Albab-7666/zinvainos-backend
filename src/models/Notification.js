const { pool } = require('../config/database');

class Notification {
    static async create({ userId, title, message, type, link = null }) {
        const result = await pool.query(
            `INSERT INTO notifications (user_id, title, message, type, link, created_at)
             VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
             RETURNING *`,
            [userId, title, message, type, link]
        );
        return result.rows[0];
    }

    static async findByUser(userId, { limit = 50, offset = 0, unreadOnly = false }) {
        let query = 'SELECT * FROM notifications WHERE user_id = $1';
        let values = [userId];
        let paramIndex = 2;

        if (unreadOnly) {
            query += ` AND is_read = false`;
        }

        query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        values.push(limit, offset);

        const result = await pool.query(query, values);
        return result.rows;
    }

    static async getUnreadCount(userId) {
        const result = await pool.query(
            'SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = false',
            [userId]
        );
        return parseInt(result.rows[0].count);
    }

    static async markAsRead(id, userId) {
        const result = await pool.query(
            `UPDATE notifications SET is_read = true, updated_at = CURRENT_TIMESTAMP
             WHERE id = $1 AND user_id = $2
             RETURNING *`,
            [id, userId]
        );
        return result.rows[0];
    }

    static async markAllAsRead(userId) {
        const result = await pool.query(
            `UPDATE notifications SET is_read = true, updated_at = CURRENT_TIMESTAMP
             WHERE user_id = $1 AND is_read = false
             RETURNING *`,
            [userId]
        );
        return result.rows;
    }

    static async delete(id, userId) {
        const result = await pool.query(
            'DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING id',
            [id, userId]
        );
        return result.rows[0];
    }
}

module.exports = Notification;