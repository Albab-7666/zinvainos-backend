const { pool } = require('../config/database');

class Workspace {
    static async create({ name, description, type, createdBy }) {
        const result = await pool.query(
            `INSERT INTO workspaces (name, description, type, created_by)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [name, description, type, createdBy]
        );
        return result.rows[0];
    }

    static async findAll(userId) {
        const result = await pool.query(
            `SELECT w.*, 
                    COUNT(wm.id) as member_count,
                    u.full_name as created_by_name
             FROM workspaces w
             LEFT JOIN workspace_members wm ON w.id = wm.workspace_id
             LEFT JOIN users u ON w.created_by = u.id
             WHERE w.id IN (SELECT workspace_id FROM workspace_members WHERE user_id = $1)
             GROUP BY w.id, u.full_name
             ORDER BY w.created_at DESC`,
            [userId]
        );
        return result.rows;
    }

    static async findById(id) {
        const result = await pool.query(
            `SELECT w.*, u.full_name as created_by_name
             FROM workspaces w
             LEFT JOIN users u ON w.created_by = u.id
             WHERE w.id = $1`,
            [id]
        );
        return result.rows[0];
    }

    static async addMember(workspaceId, userId, role = 'MEMBER') {
        const result = await pool.query(
            `INSERT INTO workspace_members (workspace_id, user_id, role)
             VALUES ($1, $2, $3)
             ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = $3
             RETURNING *`,
            [workspaceId, userId, role]
        );
        return result.rows[0];
    }

    static async removeMember(workspaceId, userId) {
        const result = await pool.query(
            'DELETE FROM workspace_members WHERE workspace_id = $1 AND user_id = $2 RETURNING *',
            [workspaceId, userId]
        );
        return result.rows[0];
    }

    static async getMembers(workspaceId) {
        const result = await pool.query(
            `SELECT wm.*, u.full_name, u.email, u.avatar_url, u.role
             FROM workspace_members wm
             LEFT JOIN users u ON wm.user_id = u.id
             WHERE wm.workspace_id = $1`,
            [workspaceId]
        );
        return result.rows;
    }

    static async sendMessage({ workspaceId, userId, content, parentId = null }) {
        const result = await pool.query(
            `INSERT INTO workspace_messages (workspace_id, user_id, content, parent_id)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [workspaceId, userId, content, parentId]
        );
        return result.rows[0];
    }

    static async getMessages(workspaceId, { limit = 50, offset = 0 }) {
        const result = await pool.query(
            `SELECT wm.*, u.full_name as user_name, u.avatar_url as user_avatar
             FROM workspace_messages wm
             LEFT JOIN users u ON wm.user_id = u.id
             WHERE wm.workspace_id = $1
             ORDER BY wm.created_at DESC
             LIMIT $2 OFFSET $3`,
            [workspaceId, limit, offset]
        );
        return result.rows;
    }

    static async deleteWorkspace(id) {
        await pool.query('DELETE FROM workspace_messages WHERE workspace_id = $1', [id]);
        await pool.query('DELETE FROM workspace_members WHERE workspace_id = $1', [id]);
        const result = await pool.query('DELETE FROM workspaces WHERE id = $1 RETURNING id', [id]);
        return result.rows[0];
    }
}

module.exports = Workspace;