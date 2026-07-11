const { pool } = require('../config/database');
const { logger } = require('../utils/logger');

class CalendarController {
    // Get calendar events
    async getCalendarEvents(req, res) {
        try {
            const { startDate, endDate, type } = req.query;
            
            let events = [];
            
            // Get meetings
            const meetings = await pool.query(
                `SELECT 
                    'meeting' as event_type,
                    id,
                    title,
                    description,
                    start_time as start,
                    end_time as end,
                    meeting_type,
                    location,
                    project_id,
                    created_by
                 FROM meetings
                 WHERE (created_by = $1 OR id IN (SELECT meeting_id FROM meeting_attendees WHERE user_id = $1))
                 AND start_time >= $2 AND start_time <= $3`,
                [req.user.id, startDate, endDate]
            );
            events.push(...meetings.rows);
            
            // Get task deadlines
            const tasks = await pool.query(
                `SELECT 
                    'task' as event_type,
                    id,
                    title,
                    description,
                    due_date as start,
                    due_date as end,
                    status,
                    priority,
                    project_id,
                    assigned_to
                 FROM tasks
                 WHERE assigned_to = $1
                 AND due_date >= $2 AND due_date <= $3
                 AND status != 'COMPLETED'`,
                [req.user.id, startDate, endDate]
            );
            events.push(...tasks.rows);
            
            // Get leave requests
            const leaves = await pool.query(
                `SELECT 
                    'leave' as event_type,
                    id,
                    CONCAT(leave_type, ' Leave') as title,
                    reason as description,
                    start_date as start,
                    end_date as end,
                    status,
                    leave_type
                 FROM leave_requests
                 WHERE user_id = $1
                 AND (start_date >= $2 AND end_date <= $3)
                 AND status = 'APPROVED'`,
                [req.user.id, startDate, endDate]
            );
            events.push(...leaves.rows);
            
            // Sort by start time
            events.sort((a, b) => new Date(a.start) - new Date(b.start));
            
            res.json({ events });
            
        } catch (error) {
            logger.error('Get calendar events error:', error);
            res.status(500).json({
                error: 'Failed to get calendar events',
                code: 'CALENDAR_EVENTS_ERROR'
            });
        }
    }

    // Create calendar event
    async createCalendarEvent(req, res) {
        try {
            const { 
                title, description, start, end, 
                type, location, allDay = false,
                projectId, attendees = []
            } = req.body;
            
            const result = await pool.query(
                `INSERT INTO calendar_events (
                    title, description, start_time, end_time,
                    event_type, location, all_day, project_id, created_by
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING *`,
                [title, description, start, end,
                 type, location, allDay, projectId, req.user.id]
            );
            
            const event = result.rows[0];
            
            // Add attendees
            for (const userId of attendees) {
                await pool.query(
                    `INSERT INTO calendar_attendees (event_id, user_id, status)
                     VALUES ($1, $2, 'PENDING')`,
                    [event.id, userId]
                );
            }
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'CREATE_CALENDAR_EVENT', 'CALENDAR', 
                 JSON.stringify({ eventId: event.id, title }), req.ip]
            );
            
            res.status(201).json({
                message: 'Calendar event created',
                event
            });
            
        } catch (error) {
            logger.error('Create calendar event error:', error);
            res.status(500).json({
                error: 'Failed to create calendar event',
                code: 'CREATE_CALENDAR_ERROR'
            });
        }
    }

    // Update calendar event
    async updateCalendarEvent(req, res) {
        try {
            const { id } = req.params;
            const updates = req.body;
            
            const checkResult = await pool.query(
                'SELECT created_by FROM calendar_events WHERE id = $1',
                [id]
            );
            
            if (checkResult.rows.length === 0) {
                return res.status(404).json({
                    error: 'Event not found',
                    code: 'EVENT_NOT_FOUND'
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
                UPDATE calendar_events 
                SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
                WHERE id = $${paramIndex}
                RETURNING *
            `;
            
            const result = await pool.query(query, values);
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'UPDATE_CALENDAR_EVENT', 'CALENDAR', 
                 JSON.stringify({ eventId: id, updates }), req.ip]
            );
            
            res.json({
                message: 'Event updated',
                event: result.rows[0]
            });
            
        } catch (error) {
            logger.error('Update calendar event error:', error);
            res.status(500).json({
                error: 'Failed to update calendar event',
                code: 'UPDATE_CALENDAR_ERROR'
            });
        }
    }

    // Delete calendar event
    async deleteCalendarEvent(req, res) {
        try {
            const { id } = req.params;
            
            const checkResult = await pool.query(
                'SELECT created_by FROM calendar_events WHERE id = $1',
                [id]
            );
            
            if (checkResult.rows.length === 0) {
                return res.status(404).json({
                    error: 'Event not found',
                    code: 'EVENT_NOT_FOUND'
                });
            }
            
            if (checkResult.rows[0].created_by !== req.user.id && req.user.role !== 'CEO') {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            }
            
            await pool.query('DELETE FROM calendar_attendees WHERE event_id = $1', [id]);
            await pool.query('DELETE FROM calendar_events WHERE id = $1', [id]);
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'DELETE_CALENDAR_EVENT', 'CALENDAR', 
                 JSON.stringify({ eventId: id }), req.ip]
            );
            
            res.json({
                message: 'Event deleted'
            });
            
        } catch (error) {
            logger.error('Delete calendar event error:', error);
            res.status(500).json({
                error: 'Failed to delete calendar event',
                code: 'DELETE_CALENDAR_ERROR'
            });
        }
    }

    // RSVP to event
    async rsvpEvent(req, res) {
        try {
            const { id } = req.params;
            const { status } = req.body; // ACCEPTED, DECLINED, MAYBE
            
            const result = await pool.query(
                `UPDATE calendar_attendees 
                 SET status = $1, updated_at = CURRENT_TIMESTAMP
                 WHERE event_id = $2 AND user_id = $3
                 RETURNING *`,
                [status, id, req.user.id]
            );
            
            if (result.rows.length === 0) {
                return res.status(404).json({
                    error: 'You are not an attendee of this event',
                    code: 'NOT_ATTENDEE'
                });
            }
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'RSVP_CALENDAR_EVENT', 'CALENDAR', 
                 JSON.stringify({ eventId: id, status }), req.ip]
            );
            
            res.json({
                message: `Event ${status.toLowerCase()}`,
                rsvp: result.rows[0]
            });
            
        } catch (error) {
            logger.error('RSVP event error:', error);
            res.status(500).json({
                error: 'Failed to RSVP to event',
                code: 'RSVP_CALENDAR_ERROR'
            });
        }
    }
}

module.exports = new CalendarController();