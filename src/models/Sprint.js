const { pool } = require('../config/database');

class Sprint {
    static async create({ projectId, name, startDate, endDate, goal, createdBy }) {
        const result = await pool.query(
            `INSERT INTO sprints (project_id, name, start_date, end_date, goal, created_by)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [projectId, name, startDate, endDate, goal, createdBy]
        );
        return result.rows[0];
    }

    static async findAll({ projectId, status, limit = 100, offset = 0 }) {
        let query = `
            SELECT s.*, u.full_name as created_by_name,
                   COUNT(st.id) as task_count
            FROM sprints s
            LEFT JOIN users u ON s.created_by = u.id
            LEFT JOIN sprint_tasks st ON s.id = st.sprint_id
            WHERE 1=1
        `;
        let values = [];
        let paramIndex = 1;

        if (projectId) {
            query += ` AND s.project_id = $${paramIndex}`;
            values.push(projectId);
            paramIndex++;
        }
        if (status) {
            query += ` AND s.status = $${paramIndex}`;
            values.push(status);
            paramIndex++;
        }

        query += ` GROUP BY s.id, u.full_name
                  ORDER BY s.start_date DESC
                  LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        values.push(limit, offset);

        const result = await pool.query(query, values);
        return result.rows;
    }

    static async findById(id) {
        const result = await pool.query(
            `SELECT s.*, u.full_name as created_by_name
             FROM sprints s
             LEFT JOIN users u ON s.created_by = u.id
             WHERE s.id = $1`,
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
            UPDATE sprints 
            SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
            WHERE id = $${paramIndex}
            RETURNING *
        `;
        const result = await pool.query(query, values);
        return result.rows[0];
    }

    static async addTask(sprintId, taskId) {
        const result = await pool.query(
            `INSERT INTO sprint_tasks (sprint_id, task_id)
             VALUES ($1, $2)
             ON CONFLICT (sprint_id, task_id) DO NOTHING
             RETURNING *`,
            [sprintId, taskId]
        );
        return result.rows[0];
    }

    static async removeTask(sprintId, taskId) {
        const result = await pool.query(
            'DELETE FROM sprint_tasks WHERE sprint_id = $1 AND task_id = $2 RETURNING *',
            [sprintId, taskId]
        );
        return result.rows[0];
    }

    static async getTasks(sprintId) {
        const result = await pool.query(
            `SELECT t.*, u.full_name as assigned_to_name
             FROM tasks t
             JOIN sprint_tasks st ON t.id = st.task_id
             LEFT JOIN users u ON t.assigned_to = u.id
             WHERE st.sprint_id = $1
             ORDER BY t.priority DESC, t.due_date ASC`,
            [sprintId]
        );
        return result.rows;
    }

    static async delete(id) {
        await pool.query('DELETE FROM sprint_tasks WHERE sprint_id = $1', [id]);
        const result = await pool.query('DELETE FROM sprints WHERE id = $1 RETURNING id', [id]);
        return result.rows[0];
    }
}

module.exports = Sprint;