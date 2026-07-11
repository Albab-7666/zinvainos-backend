const { pool } = require('../config/database');
const { hashPassword, comparePassword } = require('../utils/bcrypt');

class User {
    static async create(userData) {
        const { 
            email, 
            password, 
            fullName, 
            role = 'EMPLOYEE',
            department = null,
            position = null
        } = userData;

        // Hash password
        const passwordHash = await hashPassword(password);

        const result = await pool.query(
            `INSERT INTO users (email, password_hash, full_name, role, department, position, status)
             VALUES ($1, $2, $3, $4, $5, $6, 'PENDING')
             RETURNING id, email, full_name, role, department, position, status, created_at`,
            [email, passwordHash, fullName, role, department, position]
        );

        return result.rows[0];
    }

    static async findByEmail(email) {
        const result = await pool.query(
            'SELECT * FROM users WHERE email = $1',
            [email]
        );
        return result.rows[0];
    }

    static async findById(id) {
        const result = await pool.query(
            'SELECT id, email, full_name, role, department, position, status, avatar_url, created_at FROM users WHERE id = $1',
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
            UPDATE users 
            SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
            WHERE id = $${paramIndex}
            RETURNING id, email, full_name, role, department, position, status
        `;

        const result = await pool.query(query, values);
        return result.rows[0];
    }

    static async delete(id) {
        const result = await pool.query(
            'DELETE FROM users WHERE id = $1 RETURNING id',
            [id]
        );
        return result.rows[0];
    }

    static async getPendingUsers() {
        const result = await pool.query(
            'SELECT id, email, full_name, role, department, created_at FROM users WHERE status = $1',
            ['PENDING']
        );
        return result.rows;
    }

    static async approveUser(id, approvedBy) {
        const result = await pool.query(
            `UPDATE users 
             SET status = 'ACTIVE', approved_by = $1, approved_at = CURRENT_TIMESTAMP
             WHERE id = $2
             RETURNING id, email, full_name, role, status`,
            [approvedBy, id]
        );
        return result.rows[0];
    }

    static async suspendUser(id) {
        const result = await pool.query(
            'UPDATE users SET status = $1 WHERE id = $2 RETURNING id, status',
            ['SUSPENDED', id]
        );
        return result.rows[0];
    }

    static async restoreUser(id) {
        const result = await pool.query(
            'UPDATE users SET status = $1 WHERE id = $2 RETURNING id, status',
            ['ACTIVE', id]
        );
        return result.rows[0];
    }

    static async changePassword(id, newPassword) {
        const passwordHash = await hashPassword(newPassword);
        const result = await pool.query(
            'UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING id',
            [passwordHash, id]
        );
        return result.rows[0];
    }

    static async verifyPassword(email, password) {
        const user = await this.findByEmail(email);
        if (!user) return null;
        
        const isValid = await comparePassword(password, user.password_hash);
        if (!isValid) return null;
        
        return user;
    }

    static async getAll(options = {}) {
        const { limit = 100, offset = 0, role = null, status = null } = options;
        
        let conditions = [];
        let values = [];
        let paramIndex = 1;

        if (role) {
            conditions.push(`role = $${paramIndex}`);
            values.push(role);
            paramIndex++;
        }

        if (status) {
            conditions.push(`status = $${paramIndex}`);
            values.push(status);
            paramIndex++;
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        
        values.push(limit, offset);
        const query = `
            SELECT id, email, full_name, role, department, position, status, created_at
            FROM users
            ${whereClause}
            ORDER BY created_at DESC
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;

        const result = await pool.query(query, values);
        return result.rows;
    }
}

module.exports = User;