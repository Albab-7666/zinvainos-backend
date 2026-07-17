const { pool } = require('../config/database');

class Comment {
    static async create({ moduleType, moduleId, userId, content, parentId = null }) {
        const result = await pool.query(
            `INSERT INTO comments (module_type, module_id, user_id, content, parent_id)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [moduleType, moduleId, userId, content, parentId]
        );
        return result.rows[0];
    }

    static async findByModule(moduleType, moduleId) {
        const result = await pool.query(
            `SELECT c.*, u.full_name as user_name, u.avatar_url
             FROM comments c
             LEFT JOIN users u ON c.user_id = u.id
             WHERE c.module_type = $1 AND c.module_id = $2
             ORDER BY c.created_at ASC`,
            [moduleType, moduleId]
        );
        return result.rows;
    }

    static async findById(id) {
        const result = await pool.query(
            `SELECT c.*, u.full_name as user_name
             FROM comments c
             LEFT JOIN users u ON c.user_id = u.id
             WHERE c.id = $1`,
            [id]
        );
        return result.rows[0];
    }

    static async update(id, content) {
        const result = await pool.query(
            `UPDATE comments SET content = $1, updated_at = CURRENT_TIMESTAMP
             WHERE id = $2
             RETURNING *`,
            [content, id]
        );
        return result.rows[0];
    }

    static async delete(id) {
        const result = await pool.query('DELETE FROM comments WHERE id = $1 RETURNING id', [id]);
        return result.rows[0];
    }

    static async getReplies(parentId) {
        const result = await pool.query(
            `SELECT c.*, u.full_name as user_name
             FROM comments c
             LEFT JOIN users u ON c.user_id = u.id
             WHERE c.parent_id = $1
             ORDER BY c.created_at ASC`,
            [parentId]
        );
        return result.rows;
    }
}

module.exports = Comment;