const { pool } = require('../config/database');

class Task {
    static async create({ projectId, title, description, assignedTo, dueDate, priority, estimatedHours, taskType, status, createdBy, isRecurring = false, recurringTaskId = null }) {
        const result = await pool.query(
            `INSERT INTO tasks (project_id, title, description, assigned_to, due_date, priority, estimated_hours, task_type, status, created_by, is_recurring, recurring_task_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
             RETURNING *`,
            [projectId, title, description, assignedTo, dueDate, priority, estimatedHours, taskType, status, createdBy, isRecurring, recurringTaskId]
        );
        return result.rows[0];
    }

    static async findAll({ limit = 100, offset = 0, projectId = null, assignedTo = null, status = null, priority = null, search = null, userId = null, role = null }) {
        let query = `
            SELECT t.*, p.name as project_name, u.full_name as assigned_to_name
            FROM tasks t
            LEFT JOIN projects p ON t.project_id = p.id
            LEFT JOIN users u ON t.assigned_to = u.id
            WHERE 1=1
        `;
        let values = [];
        let paramIndex = 1;

        if (projectId) {
            query += ` AND t.project_id = $${paramIndex}`;
            values.push(projectId);
            paramIndex++;
        }
        if (assignedTo) {
            query += ` AND t.assigned_to = $${paramIndex}`;
            values.push(assignedTo);
            paramIndex++;
        }
        if (status) {
            query += ` AND t.status = $${paramIndex}`;
            values.push(status);
            paramIndex++;
        }
        if (priority) {
            query += ` AND t.priority = $${paramIndex}`;
            values.push(priority);
            paramIndex++;
        }
        if (search) {
            query += ` AND (t.title ILIKE $${paramIndex} OR t.description ILIKE $${paramIndex})`;
            values.push(`%${search}%`);
            paramIndex++;
        }
        if (role === 'EMPLOYEE' && userId) {
            query += ` AND t.assigned_to = $${paramIndex}`;
            values.push(userId);
            paramIndex++;
        } else if (role === 'TEAM_MEMBER' && userId) {
            query += ` AND (t.assigned_to = $${paramIndex} OR t.created_by = $${paramIndex})`;
            values.push(userId);
            paramIndex++;
        }

        query += ` ORDER BY t.due_date ASC NULLS LAST, t.priority DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        values.push(limit, offset);

        const result = await pool.query(query, values);
        return result.rows;
    }

    static async findById(id) {
        const result = await pool.query(
            `SELECT t.*, p.name as project_name, u.full_name as assigned_to_name
             FROM tasks t
             LEFT JOIN projects p ON t.project_id = p.id
             LEFT JOIN users u ON t.assigned_to = u.id
             WHERE t.id = $1`,
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
            UPDATE tasks 
            SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
            WHERE id = $${paramIndex}
            RETURNING *
        `;
        const result = await pool.query(query, values);
        return result.rows[0];
    }

    static async updateStatus(id, status) {
        const result = await pool.query(
            `UPDATE tasks SET status = $1, updated_at = CURRENT_TIMESTAMP
             WHERE id = $2
             RETURNING *`,
            [status, id]
        );
        return result.rows[0];
    }

    static async assign(id, assignedTo) {
        const result = await pool.query(
            `UPDATE tasks SET assigned_to = $1, updated_at = CURRENT_TIMESTAMP
             WHERE id = $2
             RETURNING *`,
            [assignedTo, id]
        );
        return result.rows[0];
    }

    static async delete(id) {
        // Delete related data
        await pool.query('DELETE FROM time_entries WHERE task_id = $1', [id]);
        await pool.query('DELETE FROM sprint_tasks WHERE task_id = $1', [id]);
        await pool.query('DELETE FROM comments WHERE module_type = $1 AND module_id = $2', ['TASK', id]);
        await pool.query('DELETE FROM files WHERE module_type = $1 AND module_id = $2', ['TASK', id]);
        const result = await pool.query('DELETE FROM tasks WHERE id = $1 RETURNING id', [id]);
        return result.rows[0];
    }

    static async getStats(userId = null) {
        let query = `
            SELECT 
                COUNT(*) as total,
                COUNT(CASE WHEN status = 'TODO' THEN 1 END) as todo,
                COUNT(CASE WHEN status = 'IN_PROGRESS' THEN 1 END) as in_progress,
                COUNT(CASE WHEN status = 'REVIEW' THEN 1 END) as review,
                COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) as completed,
                COUNT(CASE WHEN status = 'BLOCKED' THEN 1 END) as blocked
            FROM tasks
        `;
        if (userId) {
            query += ` WHERE assigned_to = $1`;
        }
        const result = await pool.query(query, userId ? [userId] : []);
        return result.rows[0];
    }

    static async getUpcomingDeadlines(userId, limit = 5) {
        let query = `
            SELECT t.*, p.name as project_name, u.full_name as assigned_to_name
            FROM tasks t
            LEFT JOIN projects p ON t.project_id = p.id
            LEFT JOIN users u ON t.assigned_to = u.id
            WHERE t.due_date >= CURRENT_DATE
            AND t.due_date <= CURRENT_DATE + INTERVAL '7 days'
            AND t.status != 'COMPLETED'
        `;
        let values = [];
        let paramIndex = 1;

        if (userId) {
            query += ` AND t.assigned_to = $${paramIndex}`;
            values.push(userId);
            paramIndex++;
        }

        query += ` ORDER BY t.due_date ASC LIMIT $${paramIndex}`;
        values.push(limit);

        const result = await pool.query(query, values);
        return result.rows;
    }
}

module.exports = Task;