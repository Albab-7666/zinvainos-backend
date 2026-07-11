const { pool } = require('../config/database');

class SecurityLog {
    static async logEvent({ userId, ipAddress, action, details, severity = 'INFO' }) {
        const result = await pool.query(
            `INSERT INTO security_logs (user_id, ip_address, action, details, severity, created_at)
             VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
             RETURNING id`,
            [userId, ipAddress, action, JSON.stringify(details), severity]
        );
        return result.rows[0];
    }

    static async getLogs(options = {}) {
        const { limit = 100, offset = 0, severity = null, userId = null } = options;
        
        let conditions = [];
        let values = [];
        let paramIndex = 1;

        if (severity) {
            conditions.push(`severity = $${paramIndex}`);
            values.push(severity);
            paramIndex++;
        }

        if (userId) {
            conditions.push(`user_id = $${paramIndex}`);
            values.push(userId);
            paramIndex++;
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        values.push(limit, offset);

        const query = `
            SELECT id, user_id, ip_address, action, details, severity, created_at
            FROM security_logs
            ${whereClause}
            ORDER BY created_at DESC
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;

        const result = await pool.query(query, values);
        return result.rows;
    }

    static async blockIP(ipAddress, reason, durationMinutes = 60) {
        const expiresAt = new Date();
        expiresAt.setMinutes(expiresAt.getMinutes() + durationMinutes);

        const result = await pool.query(
            `INSERT INTO security_blocks (ip_address, reason, expires_at, created_at)
             VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
             ON CONFLICT (ip_address) DO UPDATE 
             SET reason = $2, expires_at = $3, created_at = CURRENT_TIMESTAMP
             RETURNING id`,
            [ipAddress, reason, expiresAt]
        );
        return result.rows[0];
    }

    static async unblockIP(ipAddress) {
        const result = await pool.query(
            'DELETE FROM security_blocks WHERE ip_address = $1 RETURNING id',
            [ipAddress]
        );
        return result.rows[0];
    }

    static async getBlockedIPs() {
        const result = await pool.query(
            'SELECT ip_address, reason, expires_at FROM security_blocks WHERE expires_at > NOW()'
        );
        return result.rows;
    }
}

module.exports = SecurityLog;