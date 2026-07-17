const { pool } = require('../config/database');

class Project {
    static async create({ name, description, clientId, status, priority, startDate, endDate, budget, projectType, assignedTo, createdBy }) {
        const result = await pool.query(
            `INSERT INTO projects (name, description, client_id, status, priority, start_date, end_date, budget, project_type, assigned_to, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             RETURNING *`,
            [name, description, clientId, status, priority, startDate, endDate, budget, projectType, assignedTo, createdBy]
        );
        return result.rows[0];
    }

    static async findAll({ limit = 100, offset = 0, status = null, clientId = null, search = null, userId = null, role = null }) {
        let query = `
            SELECT p.*, c.company_name as client_name, u.full_name as assigned_to_name
            FROM projects p
            LEFT JOIN clients c ON p.client_id = c.id
            LEFT JOIN users u ON p.assigned_to = u.id
            WHERE 1=1
        `;
        let values = [];
        let paramIndex = 1;

        if (status) {
            query += ` AND p.status = $${paramIndex}`;
            values.push(status);
            paramIndex++;
        }
        if (clientId) {
            query += ` AND p.client_id = $${paramIndex}`;
            values.push(clientId);
            paramIndex++;
        }
        if (search) {
            query += ` AND (p.name ILIKE $${paramIndex} OR p.description ILIKE $${paramIndex})`;
            values.push(`%${search}%`);
            paramIndex++;
        }
        if (role === 'EMPLOYEE' && userId) {
            query += ` AND p.id IN (SELECT DISTINCT project_id FROM tasks WHERE assigned_to = $${paramIndex})`;
            values.push(userId);
            paramIndex++;
        } else if (role === 'TEAM_MEMBER' && userId) {
            query += ` AND (p.assigned_to = $${paramIndex} OR p.created_by = $${paramIndex})`;
            values.push(userId);
            paramIndex++;
        }

        query += ` ORDER BY p.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        values.push(limit, offset);

        const result = await pool.query(query, values);
        return result.rows;
    }

    static async findById(id) {
        const result = await pool.query(
            `SELECT p.*, c.company_name as client_name, u.full_name as assigned_to_name
             FROM projects p
             LEFT JOIN clients c ON p.client_id = c.id
             LEFT JOIN users u ON p.assigned_to = u.id
             WHERE p.id = $1`,
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
            UPDATE projects 
            SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
            WHERE id = $${paramIndex}
            RETURNING *
        `;
        const result = await pool.query(query, values);
        return result.rows[0];
    }

    static async delete(id) {
        // Delete related data
        await pool.query('DELETE FROM sprint_tasks WHERE sprint_id IN (SELECT id FROM sprints WHERE project_id = $1)', [id]);
        await pool.query('DELETE FROM sprints WHERE project_id = $1', [id]);
        await pool.query('DELETE FROM tasks WHERE project_id = $1', [id]);
        const result = await pool.query('DELETE FROM projects WHERE id = $1 RETURNING id', [id]);
        return result.rows[0];
    }

    static async getTaskStats(projectId) {
        const result = await pool.query(
            `SELECT 
                COUNT(*) as total,
                COUNT(CASE WHEN status = 'TODO' THEN 1 END) as todo,
                COUNT(CASE WHEN status = 'IN_PROGRESS' THEN 1 END) as in_progress,
                COUNT(CASE WHEN status = 'REVIEW' THEN 1 END) as review,
                COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) as completed,
                COUNT(CASE WHEN status = 'BLOCKED' THEN 1 END) as blocked
             FROM tasks WHERE project_id = $1`,
            [projectId]
        );
        return result.rows[0];
    }
}

module.exports = Project;