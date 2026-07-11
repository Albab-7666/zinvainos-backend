const { pool } = require('../config/database');
const { logger } = require('../utils/logger');

class MeetingController {
    // Create meeting
    async createMeeting(req, res) {
        try {
            const { 
                title, description, meetingType, startTime, endTime,
                location, meetingLink, projectId, attendees = []
            } = req.body;
            
            const result = await pool.query(
                `INSERT INTO meetings (
                    title, description, meeting_type, start_time, end_time,
                    location, meeting_link, project_id, created_by
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING *`,
                [title, description, meetingType, startTime, endTime,
                 location, meetingLink, projectId, req.user.id]
            );
            
            const meeting = result.rows[0];
            
            // Add attendees
            for (const userId of attendees) {
                await pool.query(
                    `INSERT INTO meeting_attendees (meeting_id, user_id, status)
                     VALUES ($1, $2, 'PENDING')`,
                    [meeting.id, userId]
                );
                
                // Send notification
                await pool.query(
                    `INSERT INTO notifications (user_id, title, message, type, link, created_at)
                     VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
                    [userId, 'New Meeting', 
                     `You have been invited to: ${title}`,
                     'MEETING', `/meetings/${meeting.id}`]
                );
            }
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'CREATE_MEETING', 'MEETING_MANAGEMENT', 
                 JSON.stringify({ meetingId: meeting.id, title }), req.ip]
            );
            
            res.status(201).json({
                message: 'Meeting created successfully',
                meeting
            });
            
        } catch (error) {
            logger.error('Create meeting error:', error);
            res.status(500).json({
                error: 'Failed to create meeting',
                code: 'CREATE_MEETING_ERROR'
            });
        }
    }

    // Get meetings
    async getMeetings(req, res) {
        try {
            const { 
                startDate, endDate, projectId, 
                status = 'UPCOMING', limit = 100, offset = 0 
            } = req.query;
            
            let query = `
                SELECT m.*, 
                       u.full_name as created_by_name,
                       p.name as project_name,
                       COUNT(ma.id) as attendee_count
                FROM meetings m
                LEFT JOIN users u ON m.created_by = u.id
                LEFT JOIN projects p ON m.project_id = p.id
                LEFT JOIN meeting_attendees ma ON m.id = ma.meeting_id
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
            
            // User should be creator or attendee
            query += ` AND (m.created_by = $${paramIndex} OR m.id IN (
                SELECT meeting_id FROM meeting_attendees WHERE user_id = $${paramIndex}
            ))`;
            values.push(req.user.id);
            paramIndex++;
            
            query += ` GROUP BY m.id, u.full_name, p.name
                     ORDER BY m.start_time ASC
                     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
            values.push(parseInt(limit), parseInt(offset));
            
            const result = await pool.query(query, values);
            
            // Get attendees for each meeting
            const meetings = await Promise.all(result.rows.map(async (meeting) => {
                const attendees = await pool.query(
                    `SELECT ma.*, u.full_name, u.email, u.avatar_url
                     FROM meeting_attendees ma
                     LEFT JOIN users u ON ma.user_id = u.id
                     WHERE ma.meeting_id = $1`,
                    [meeting.id]
                );
                meeting.attendees = attendees.rows;
                return meeting;
            }));
            
            res.json({ meetings });
            
        } catch (error) {
            logger.error('Get meetings error:', error);
            res.status(500).json({
                error: 'Failed to get meetings',
                code: 'GET_MEETINGS_ERROR'
            });
        }
    }

    // Get meeting by ID
    async getMeeting(req, res) {
        try {
            const { id } = req.params;
            
            const result = await pool.query(
                `SELECT m.*, 
                        u.full_name as created_by_name,
                        p.name as project_name
                 FROM meetings m
                 LEFT JOIN users u ON m.created_by = u.id
                 LEFT JOIN projects p ON m.project_id = p.id
                 WHERE m.id = $1`,
                [id]
            );
            
            if (result.rows.length === 0) {
                return res.status(404).json({
                    error: 'Meeting not found',
                    code: 'MEETING_NOT_FOUND'
                });
            }
            
            const meeting = result.rows[0];
            
            // Check access
            const accessCheck = await pool.query(
                `SELECT id FROM meeting_attendees 
                 WHERE meeting_id = $1 AND user_id = $2
                 UNION
                 SELECT id FROM meetings 
                 WHERE id = $1 AND created_by = $2`,
                [id, req.user.id]
            );
            
            if (accessCheck.rows.length === 0 && req.user.role !== 'CEO') {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            }
            
            // Get attendees
            const attendees = await pool.query(
                `SELECT ma.*, u.full_name, u.email, u.avatar_url
                 FROM meeting_attendees ma
                 LEFT JOIN users u ON ma.user_id = u.id
                 WHERE ma.meeting_id = $1`,
                [id]
            );
            meeting.attendees = attendees.rows;
            
            res.json({ meeting });
            
        } catch (error) {
            logger.error('Get meeting error:', error);
            res.status(500).json({
                error: 'Failed to get meeting',
                code: 'GET_MEETING_ERROR'
            });
        }
    }

    // Update meeting
    async updateMeeting(req, res) {
        try {
            const { id } = req.params;
            const updates = req.body;
            
            // Check if user is creator
            const checkResult = await pool.query(
                'SELECT created_by FROM meetings WHERE id = $1',
                [id]
            );
            
            if (checkResult.rows.length === 0) {
                return res.status(404).json({
                    error: 'Meeting not found',
                    code: 'MEETING_NOT_FOUND'
                });
            }
            
            if (checkResult.rows[0].created_by !== req.user.id && req.user.role !== 'CEO') {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            }
            
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
            
            if (fields.length === 0) {
                return res.status(400).json({
                    error: 'No fields to update',
                    code: 'NO_UPDATES'
                });
            }
            
            values.push(id);
            const query = `
                UPDATE meetings 
                SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
                WHERE id = $${paramIndex}
                RETURNING *
            `;
            
            const result = await pool.query(query, values);
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'UPDATE_MEETING', 'MEETING_MANAGEMENT', 
                 JSON.stringify({ meetingId: id, updates }), req.ip]
            );
            
            res.json({
                message: 'Meeting updated successfully',
                meeting: result.rows[0]
            });
            
        } catch (error) {
            logger.error('Update meeting error:', error);
            res.status(500).json({
                error: 'Failed to update meeting',
                code: 'UPDATE_MEETING_ERROR'
            });
        }
    }

    // Delete meeting
    async deleteMeeting(req, res) {
        try {
            const { id } = req.params;
            
            // Check if user is creator
            const checkResult = await pool.query(
                'SELECT created_by FROM meetings WHERE id = $1',
                [id]
            );
            
            if (checkResult.rows.length === 0) {
                return res.status(404).json({
                    error: 'Meeting not found',
                    code: 'MEETING_NOT_FOUND'
                });
            }
            
            if (checkResult.rows[0].created_by !== req.user.id && req.user.role !== 'CEO') {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            }
            
            // Delete attendees
            await pool.query('DELETE FROM meeting_attendees WHERE meeting_id = $1', [id]);
            
            const result = await pool.query(
                'DELETE FROM meetings WHERE id = $1 RETURNING id',
                [id]
            );
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'DELETE_MEETING', 'MEETING_MANAGEMENT', 
                 JSON.stringify({ meetingId: id }), req.ip]
            );
            
            res.json({
                message: 'Meeting deleted successfully'
            });
            
        } catch (error) {
            logger.error('Delete meeting error:', error);
            res.status(500).json({
                error: 'Failed to delete meeting',
                code: 'DELETE_MEETING_ERROR'
            });
        }
    }

    // RSVP to meeting
    async rsvpMeeting(req, res) {
        try {
            const { id } = req.params;
            const { status } = req.body; // ACCEPTED, DECLINED
            
            const result = await pool.query(
                `UPDATE meeting_attendees 
                 SET status = $1
                 WHERE meeting_id = $2 AND user_id = $3
                 RETURNING *`,
                [status, id, req.user.id]
            );
            
            if (result.rows.length === 0) {
                return res.status(404).json({
                    error: 'You are not an attendee of this meeting',
                    code: 'NOT_ATTENDEE'
                });
            }
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'RSVP_MEETING', 'MEETING_MANAGEMENT', 
                 JSON.stringify({ meetingId: id, status }), req.ip]
            );
            
            res.json({
                message: `Meeting ${status.toLowerCase()} successfully`,
                rsvp: result.rows[0]
            });
            
        } catch (error) {
            logger.error('RSVP meeting error:', error);
            res.status(500).json({
                error: 'Failed to RSVP to meeting',
                code: 'RSVP_ERROR'
            });
        }
    }

    // Get calendar events
    async getCalendarEvents(req, res) {
        try {
            const { startDate, endDate } = req.query;
            
            const result = await pool.query(
                `SELECT m.*, 
                        u.full_name as created_by_name,
                        COUNT(ma.id) as attendee_count
                 FROM meetings m
                 LEFT JOIN users u ON m.created_by = u.id
                 LEFT JOIN meeting_attendees ma ON m.id = ma.meeting_id
                 WHERE m.start_time >= $1 AND m.start_time <= $2
                 AND (m.created_by = $3 OR m.id IN (
                     SELECT meeting_id FROM meeting_attendees WHERE user_id = $3
                 ))
                 GROUP BY m.id, u.full_name
                 ORDER BY m.start_time ASC`,
                [startDate, endDate, req.user.id]
            );
            
            // Format for calendar
            const events = result.rows.map(meeting => ({
                id: meeting.id,
                title: meeting.title,
                start: meeting.start_time,
                end: meeting.end_time,
                description: meeting.description,
                location: meeting.location,
                link: meeting.meeting_link,
                createdBy: meeting.created_by_name,
                attendeeCount: meeting.attendee_count
            }));
            
            res.json({ events });
            
        } catch (error) {
            logger.error('Get calendar events error:', error);
            res.status(500).json({
                error: 'Failed to get calendar events',
                code: 'CALENDAR_EVENTS_ERROR'
            });
        }
    }
}

module.exports = new MeetingController();