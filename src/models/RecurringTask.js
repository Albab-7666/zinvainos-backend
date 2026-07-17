const { pool } = require('../config/database');

class RecurringTask {
    static async create({ title, description, projectId, assignedTo, priority, frequency, interval, startDate, endDate, dayOfWeek, dayOfMonth, estimatedHours, createdBy }) {
        const result = await pool.query(
            `INSERT INTO recurring_tasks (title, description, project_id, assigned_to, priority, frequency, interval_days, start_date, end_date, day_of_week, day_of_month, estimated_hours, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
             RETURNING *`,
            [title, description, projectId, assignedTo, priority, frequency, interval, startDate, endDate, dayOfWeek, dayOfMonth, estimatedHours, createdBy]
        );
        return result.rows[0];
    }

    static async findAll({ limit = 100, offset = 0, userId = null, role = null }) {
        let query = `
            SELECT rt.*, u.full_name as assigned_to_name, creator.full_name as created_by_name
            FROM recurring_tasks rt
            LEFT JOIN users u ON rt.assigned_to = u.id
            LEFT JOIN users creator ON rt.created_by = creator.id
            WHERE 1=1
        `;
        let values = [];
        let paramIndex = 1;

        if (role !== 'CEO' && userId) {
            query += ` AND (rt.assigned_to = $${paramIndex} OR rt.created_by = $${paramIndex})`;
            values.push(userId);
            paramIndex++;
        }

        query += ` ORDER BY rt.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        values.push(limit, offset);

        const result = await pool.query(query, values);
        return result.rows;
    }

    static async findById(id) {
        const result = await pool.query('SELECT * FROM recurring_tasks WHERE id = $1', [id]);
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
            UPDATE recurring_tasks 
            SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
            WHERE id = $${paramIndex}
            RETURNING *
        `;
        const result = await pool.query(query, values);
        return result.rows[0];
    }

    static async delete(id) {
        const result = await pool.query('DELETE FROM recurring_tasks WHERE id = $1 RETURNING id', [id]);
        return result.rows[0];
    }

    static async generateTasks(recurringTaskId) {
        const task = await this.findById(recurringTaskId);
        if (!task) return [];

        const tasks = [];
        let currentDate = new Date(task.start_date);
        const endDate = new Date(task.end_date);

        while (currentDate <= endDate) {
            const result = await pool.query(
                `INSERT INTO tasks (project_id, title, description, assigned_to, priority, due_date, estimated_hours, status, created_by, is_recurring, recurring_task_id)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, 'TODO', $8, true, $9)
                 RETURNING *`,
                [task.project_id, `${task.title} - ${currentDate.toISOString().split('T')[0]}`, 
                 task.description, task.assigned_to, task.priority, currentDate, 
                 task.estimated_hours, task.created_by, recurringTaskId]
            );
            tasks.push(result.rows[0]);
            currentDate.setDate(currentDate.getDate() + task.interval_days);
        }

        return tasks;
    }
}

module.exports = RecurringTask;