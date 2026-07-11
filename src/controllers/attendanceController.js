const { pool } = require('../config/database');
const { logger } = require('../utils/logger');

class AttendanceController {
    // Check in
    async checkIn(req, res) {
        try {
            const today = new Date().toISOString().split('T')[0];
            
            // Check if already checked in today
            const existing = await pool.query(
                'SELECT id, check_in FROM attendance WHERE user_id = $1 AND date = $2',
                [req.user.id, today]
            );
            
            if (existing.rows.length > 0) {
                if (existing.rows[0].check_in) {
                    return res.status(400).json({
                        error: 'Already checked in today',
                        code: 'ALREADY_CHECKED_IN'
                    });
                }
            }
            
            const now = new Date();
            const checkInTime = now.toTimeString().split(' ')[0];
            
            let result;
            if (existing.rows.length > 0) {
                result = await pool.query(
                    `UPDATE attendance 
                     SET check_in = $1, status = 'PRESENT', updated_at = CURRENT_TIMESTAMP
                     WHERE id = $2
                     RETURNING *`,
                    [now, existing.rows[0].id]
                );
            } else {
                result = await pool.query(
                    `INSERT INTO attendance (user_id, date, check_in, status)
                     VALUES ($1, $2, $3, 'PRESENT')
                     RETURNING *`,
                    [req.user.id, today, now]
                );
            }
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'CHECK_IN', 'ATTENDANCE', 
                 JSON.stringify({ time: checkInTime }), req.ip]
            );
            
            res.json({
                message: 'Checked in successfully',
                attendance: result.rows[0]
            });
            
        } catch (error) {
            logger.error('Check in error:', error);
            res.status(500).json({
                error: 'Failed to check in',
                code: 'CHECK_IN_ERROR'
            });
        }
    }

    // Check out
    async checkOut(req, res) {
        try {
            const today = new Date().toISOString().split('T')[0];
            
            const existing = await pool.query(
                'SELECT id, check_in FROM attendance WHERE user_id = $1 AND date = $2 AND check_out IS NULL',
                [req.user.id, today]
            );
            
            if (existing.rows.length === 0) {
                return res.status(400).json({
                    error: 'No active check-in found',
                    code: 'NO_ACTIVE_CHECK_IN'
                });
            }
            
            const now = new Date();
            const checkOutTime = now.toTimeString().split(' ')[0];
            
            // Calculate duration
            const checkInTime = new Date(existing.rows[0].check_in);
            const durationMinutes = Math.floor((now - checkInTime) / (1000 * 60));
            
            const result = await pool.query(
                `UPDATE attendance 
                 SET check_out = $1, 
                     overtime_minutes = GREATEST($2 - 480, 0),
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $3
                 RETURNING *`,
                [now, durationMinutes, existing.rows[0].id]
            );
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'CHECK_OUT', 'ATTENDANCE', 
                 JSON.stringify({ time: checkOutTime, duration: durationMinutes }), req.ip]
            );
            
            res.json({
                message: 'Checked out successfully',
                attendance: result.rows[0],
                duration: {
                    minutes: durationMinutes,
                    hours: (durationMinutes / 60).toFixed(2)
                }
            });
            
        } catch (error) {
            logger.error('Check out error:', error);
            res.status(500).json({
                error: 'Failed to check out',
                code: 'CHECK_OUT_ERROR'
            });
        }
    }

    // Get attendance
    async getAttendance(req, res) {
        try {
            const { 
                userId, startDate, endDate, 
                limit = 100, offset = 0 
            } = req.query;
            
            let query = `
                SELECT a.*, u.full_name as user_name
                FROM attendance a
                LEFT JOIN users u ON a.user_id = u.id
                WHERE 1=1
            `;
            let values = [];
            let paramIndex = 1;
            
            if (userId) {
                query += ` AND a.user_id = $${paramIndex}`;
                values.push(userId);
                paramIndex++;
            } else if (req.user.role === 'EMPLOYEE') {
                query += ` AND a.user_id = $${paramIndex}`;
                values.push(req.user.id);
                paramIndex++;
            }
            
            if (startDate) {
                query += ` AND a.date >= $${paramIndex}`;
                values.push(startDate);
                paramIndex++;
            }
            
            if (endDate) {
                query += ` AND a.date <= $${paramIndex}`;
                values.push(endDate);
                paramIndex++;
            }
            
            query += ` ORDER BY a.date DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
            values.push(parseInt(limit), parseInt(offset));
            
            const result = await pool.query(query, values);
            res.json({ attendance: result.rows });
            
        } catch (error) {
            logger.error('Get attendance error:', error);
            res.status(500).json({
                error: 'Failed to get attendance',
                code: 'GET_ATTENDANCE_ERROR'
            });
        }
    }

    // Get attendance summary
    async getAttendanceSummary(req, res) {
        try {
            const { userId, period = 'month' } = req.query;
            
            let dateFilter;
            if (period === 'week') {
                dateFilter = "DATE_TRUNC('week', date)";
            } else if (period === 'year') {
                dateFilter = "DATE_TRUNC('year', date)";
            } else {
                dateFilter = "DATE_TRUNC('month', date)";
            }
            
            let query = `
                SELECT 
                    ${dateFilter} as period,
                    user_id,
                    u.full_name as user_name,
                    COUNT(*) as total_days,
                    COUNT(CASE WHEN status = 'PRESENT' THEN 1 END) as present_days,
                    COUNT(CASE WHEN status = 'ABSENT' THEN 1 END) as absent_days,
                    COUNT(CASE WHEN status = 'LATE' THEN 1 END) as late_days,
                    COALESCE(SUM(overtime_minutes), 0) as total_overtime_minutes
                FROM attendance a
                LEFT JOIN users u ON a.user_id = u.id
                WHERE 1=1
            `;
            let values = [];
            let paramIndex = 1;
            
            if (userId) {
                query += ` AND a.user_id = $${paramIndex}`;
                values.push(userId);
                paramIndex++;
            } else if (req.user.role === 'EMPLOYEE') {
                query += ` AND a.user_id = $${paramIndex}`;
                values.push(req.user.id);
                paramIndex++;
            }
            
            query += ` GROUP BY period, user_id, u.full_name
                     ORDER BY period DESC`;
            
            const result = await pool.query(query, values);
            
            res.json({ summary: result.rows });
            
        } catch (error) {
            logger.error('Get attendance summary error:', error);
            res.status(500).json({
                error: 'Failed to get attendance summary',
                code: 'ATTENDANCE_SUMMARY_ERROR'
            });
        }
    }

    // Update attendance
    async updateAttendance(req, res) {
        try {
            const { id } = req.params;
            const updates = req.body;
            
            // Only CEO and Team Members can update attendance
            if (req.user.role === 'EMPLOYEE') {
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
                UPDATE attendance 
                SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
                WHERE id = $${paramIndex}
                RETURNING *
            `;
            
            const result = await pool.query(query, values);
            
            if (result.rows.length === 0) {
                return res.status(404).json({
                    error: 'Attendance record not found',
                    code: 'ATTENDANCE_NOT_FOUND'
                });
            }
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'UPDATE_ATTENDANCE', 'ATTENDANCE', 
                 JSON.stringify({ attendanceId: id, updates }), req.ip]
            );
            
            res.json({
                message: 'Attendance updated successfully',
                attendance: result.rows[0]
            });
            
        } catch (error) {
            logger.error('Update attendance error:', error);
            res.status(500).json({
                error: 'Failed to update attendance',
                code: 'UPDATE_ATTENDANCE_ERROR'
            });
        }
    }
}

module.exports = new AttendanceController();