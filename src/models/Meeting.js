const { pool } = require('../config/database');

class Meeting {
    static async create({ title, description, meetingType, startTime, endTime, location, meetingLink, projectId, createdBy }) {
        const result = await pool.query(
            `INSERT INTO meetings (title, description, meeting_type, start_time, end_time, location, meeting_link, project_id, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING *`,
            [title, description, meetingType, startTime, endTime, location, meetingLink, projectId, createdBy]
        );
        return result.rows[0];
    }

    static async findAll({ startDate, endDate, projectId, status, limit = 100, offset = 0, userId }) {
        let query = `
            SELECT m.*, u.full_name as created_by_name
            FROM meetings m
            LEFT JOIN users u ON m.created_by = u.id
            WHERE 1=1
        `;
        let values = [];
        let paramIndex = 1;

        if (startDate) {
            query += ` AND m.start_time >= $${paramIndex}`;
            values.push(startDate);
            paramIndex++;
        }
        if (endDate) {
            query += ` AND m.start_time <= $${paramIndex}`;
            values.push(endDate);
            paramIndex++;
        }
        if (projectId) {
            query += ` AND m.project_id = $${paramIndex}`;
            values.push(projectId);
            paramIndex++;
        }
        if (status === 'UPCOMING') {
            query += ` AND m.start_time > CURRENT_TIMESTAMP`;
        } else if (status === 'PAST') {
            query += ` AND m.start_time < CURRENT_TIMESTAMP`;
        }
        if (userId) {
            query += ` AND (m.created_by = $${paramIndex} OR m.id IN (
                SELECT meeting_id FROM meeting_attendees WHERE user_id = $${paramIndex}
            ))`;
            values.push(userId);
            paramIndex++;
        }

        query += ` ORDER BY m.start_time ASC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        values.push(limit, offset);

        const result = await pool.query(query, values);
        return result.rows;
    }

    static async findById(id) {
        const result = await pool.query(
            `SELECT m.*, u.full_name as created_by_name
             FROM meetings m
             LEFT JOIN users u ON m.created_by = u.id
             WHERE m.id = $1`,
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
            UPDATE meetings 
            SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
            WHERE id = $${paramIndex}
            RETURNING *
        `;
        const result = await pool.query(query, values);
        return result.rows[0];
    }

    static async delete(id) {
        await pool.query('DELETE FROM meeting_attendees WHERE meeting_id = $1', [id]);
        const result = await pool.query('DELETE FROM meetings WHERE id = $1 RETURNING id', [id]);
        return result.rows[0];
    }

    static async addAttendee(meetingId, userId) {
        const result = await pool.query(
            `INSERT INTO meeting_attendees (meeting_id, user_id, status)
             VALUES ($1, $2, 'PENDING')
             ON CONFLICT (meeting_id, user_id) DO NOTHING
             RETURNING *`,
            [meetingId, userId]
        );
        return result.rows[0];
    }

    static async updateAttendeeStatus(meetingId, userId, status) {
        const result = await pool.query(
            `UPDATE meeting_attendees 
             SET status = $1
             WHERE meeting_id = $2 AND user_id = $3
             RETURNING *`,
            [status, meetingId, userId]
        );
        return result.rows[0];
    }

    static async getAttendees(meetingId) {
        const result = await pool.query(
            `SELECT ma.*, u.full_name, u.email, u.avatar_url
             FROM meeting_attendees ma
             LEFT JOIN users u ON ma.user_id = u.id
             WHERE ma.meeting_id = $1`,
            [meetingId]
        );
        return result.rows;
    }
}

module.exports = Meeting;