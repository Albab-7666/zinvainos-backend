const { pool } = require('../config/database');
const { logger } = require('../utils/logger');

class AnnouncementController {
    // Create announcement
    async createAnnouncement(req, res) {
        try {
            const { 
                title, content, priority = 'NORMAL', 
                targetRoles, targetDepartments, expiresAt
            } = req.body;
            
            const result = await pool.query(
                `INSERT INTO announcements (
                    title, content, priority, target_roles, 
                    target_departments, expires_at, created_by
                ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING *`,
                [title, content, priority, targetRoles, 
                 targetDepartments, expiresAt, req.user.id]
            );
            
            // Notify relevant users
            await this.notifyUsers(result.rows[0]);
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'CREATE_ANNOUNCEMENT', 'ANNOUNCEMENT_BOARD', 
                 JSON.stringify({ announcementId: result.rows[0].id, title }), req.ip]
            );
            
            res.status(201).json({
                message: 'Announcement created',
                announcement: result.rows[0]
            });
            
        } catch (error) {
            logger.error('Create announcement error:', error);
            res.status(500).json({
                error: 'Failed to create announcement',
                code: 'CREATE_ANNOUNCEMENT_ERROR'
            });
        }
    }

    // Get announcements
    async getAnnouncements(req, res) {
        try {
            const { 
                limit = 50, offset = 0, 
                priority, includeExpired = 'false' 
            } = req.query;
            
            let query = `
                SELECT a.*, 
                       u.full_name as created_by_name
                FROM announcements a
                LEFT JOIN users u ON a.created_by = u.id
                WHERE 1=1
            `;
            let values = [];
            let paramIndex = 1;
            
            if (includeExpired === 'false') {
                query += ` AND (a.expires_at IS NULL OR a.expires_at > CURRENT_TIMESTAMP)`;
            }
            
            if (priority) {
                query += ` AND a.priority = $${paramIndex}`;
                values.push(priority);
                paramIndex++;
            }
            
            // Check if user is in target audience
            query += ` AND (
                a.target_roles IS NULL OR 
                $${paramIndex} = ANY(a.target_roles) OR
                $${paramIndex + 1} = ANY(a.target_departments) OR
                a.target_roles IS NULL AND a.target_departments IS NULL
            )`;
            values.push(req.user.role, req.user.department);
            paramIndex += 2;
            
            query += ` ORDER BY 
                CASE a.priority 
                    WHEN 'URGENT' THEN 1 
                    WHEN 'HIGH' THEN 2 
                    WHEN 'NORMAL' THEN 3 
                    WHEN 'LOW' THEN 4 
                END,
                a.created_at DESC
                LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
            values.push(parseInt(limit), parseInt(offset));
            
            const result = await pool.query(query, values);
            
            // Mark as read for current user
            for (const announcement of result.rows) {
                await pool.query(
                    `INSERT INTO announcement_reads (announcement_id, user_id, read_at)
                     VALUES ($1, $2, CURRENT_TIMESTAMP)
                     ON CONFLICT (announcement_id, user_id) DO NOTHING`,
                    [announcement.id, req.user.id]
                );
            }
            
            res.json({ announcements: result.rows });
            
        } catch (error) {
            logger.error('Get announcements error:', error);
            res.status(500).json({
                error: 'Failed to get announcements',
                code: 'GET_ANNOUNCEMENTS_ERROR'
            });
        }
    }

    // Get announcement by ID
    async getAnnouncement(req, res) {
        try {
            const { id } = req.params;
            
            const result = await pool.query(
                `SELECT a.*, 
                        u.full_name as created_by_name
                 FROM announcements a
                 LEFT JOIN users u ON a.created_by = u.id
                 WHERE a.id = $1`,
                [id]
            );
            
            if (result.rows.length === 0) {
                return res.status(404).json({
                    error: 'Announcement not found',
                    code: 'ANNOUNCEMENT_NOT_FOUND'
                });
            }
            
            const announcement = result.rows[0];
            
            // Mark as read
            await pool.query(
                `INSERT INTO announcement_reads (announcement_id, user_id, read_at)
                 VALUES ($1, $2, CURRENT_TIMESTAMP)
                 ON CONFLICT (announcement_id, user_id) DO NOTHING`,
                [id, req.user.id]
            );
            
            // Get read count
            const readResult = await pool.query(
                'SELECT COUNT(*) as count FROM announcement_reads WHERE announcement_id = $1',
                [id]
            );
            announcement.readCount = parseInt(readResult.rows[0].count);
            
            // Check if user already read
            const userRead = await pool.query(
                'SELECT read_at FROM announcement_reads WHERE announcement_id = $1 AND user_id = $2',
                [id, req.user.id]
            );
            announcement.userRead = userRead.rows.length > 0;
            
            res.json({ announcement });
            
        } catch (error) {
            logger.error('Get announcement error:', error);
            res.status(500).json({
                error: 'Failed to get announcement',
                code: 'GET_ANNOUNCEMENT_ERROR'
            });
        }
    }

    // Update announcement
    async updateAnnouncement(req, res) {
        try {
            const { id } = req.params;
            const updates = req.body;
            
            // Check permission (only creator or CEO can update)
            const checkResult = await pool.query(
                'SELECT created_by FROM announcements WHERE id = $1',
                [id]
            );
            
            if (checkResult.rows.length === 0) {
                return res.status(404).json({
                    error: 'Announcement not found',
                    code: 'ANNOUNCEMENT_NOT_FOUND'
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
                UPDATE announcements 
                SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
                WHERE id = $${paramIndex}
                RETURNING *
            `;
            
            const result = await pool.query(query, values);
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'UPDATE_ANNOUNCEMENT', 'ANNOUNCEMENT_BOARD', 
                 JSON.stringify({ announcementId: id, updates }), req.ip]
            );
            
            res.json({
                message: 'Announcement updated',
                announcement: result.rows[0]
            });
            
        } catch (error) {
            logger.error('Update announcement error:', error);
            res.status(500).json({
                error: 'Failed to update announcement',
                code: 'UPDATE_ANNOUNCEMENT_ERROR'
            });
        }
    }

    // Delete announcement
    async deleteAnnouncement(req, res) {
        try {
            const { id } = req.params;
            
            const result = await pool.query(
                'DELETE FROM announcements WHERE id = $1 RETURNING id',
                [id]
            );
            
            if (result.rows.length === 0) {
                return res.status(404).json({
                    error: 'Announcement not found',
                    code: 'ANNOUNCEMENT_NOT_FOUND'
                });
            }
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'DELETE_ANNOUNCEMENT', 'ANNOUNCEMENT_BOARD', 
                 JSON.stringify({ announcementId: id }), req.ip]
            );
            
            res.json({
                message: 'Announcement deleted'
            });
            
        } catch (error) {
            logger.error('Delete announcement error:', error);
            res.status(500).json({
                error: 'Failed to delete announcement',
                code: 'DELETE_ANNOUNCEMENT_ERROR'
            });
        }
    }

    // Notify users about announcement
    async notifyUsers(announcement) {
        try {
            let userQuery = `
                SELECT id FROM users WHERE status = 'ACTIVE'
            `;
            const values = [];
            
            if (announcement.target_roles) {
                userQuery += ` AND role = ANY($${values.length + 1})`;
                values.push(announcement.target_roles);
            }
            
            if (announcement.target_departments) {
                userQuery += ` AND department = ANY($${values.length + 1})`;
                values.push(announcement.target_departments);
            }
            
            const users = await pool.query(userQuery, values);
            
            for (const user of users.rows) {
                await pool.query(
                    `INSERT INTO notifications (user_id, title, message, type, link, created_at)
                     VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
                    [user.id, 'New Announcement', 
                     `${announcement.priority}: ${announcement.title}`,
                     'ANNOUNCEMENT', `/announcements/${announcement.id}`]
                );
            }
            
        } catch (error) {
            logger.error('Notify users error:', error);
        }
    }
}

module.exports = new AnnouncementController();