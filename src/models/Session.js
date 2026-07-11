const { pool } = require('../config/database');

class Session {
    static async create({ userId, token, ipAddress = null, userAgent = null }) {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30); // 30 days

        const result = await pool.query(
            `INSERT INTO sessions (user_id, token, ip_address, user_agent, expires_at)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, created_at`,
            [userId, token, ipAddress, userAgent, expiresAt]
        );

        return result.rows[0];
    }

    static async findByToken(token) {
        const result = await pool.query(
            'SELECT * FROM sessions WHERE token = $1 AND expires_at > NOW()',
            [token]
        );
        return result.rows[0];
    }

    static async deleteByToken(token) {
        const result = await pool.query(
            'DELETE FROM sessions WHERE token = $1 RETURNING id',
            [token]
        );
        return result.rows[0];
    }

    static async deleteAllUserSessions(userId) {
        const result = await pool.query(
            'DELETE FROM sessions WHERE user_id = $1 RETURNING id',
            [userId]
        );
        return result.rows;
    }

    static async getActiveSessions(userId) {
        const result = await pool.query(
            'SELECT id, ip_address, user_agent, created_at, expires_at FROM sessions WHERE user_id = $1 AND expires_at > NOW() ORDER BY created_at DESC',
            [userId]
        );
        return result.rows;
    }
}

module.exports = Session;