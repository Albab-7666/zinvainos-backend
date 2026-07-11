const { pool } = require('../config/database');
const { logger } = require('../utils/logger');

class NotificationController {
    // Get notifications
    async getNotifications(req, res) {
        try {
            const { limit = 50, offset = 0, unreadOnly = 'false' } = req.query;
            
            let query = `
                SELECT n.*
                FROM notifications n
                WHERE n.user_id = $1
            `;
            let values = [req.user.id];
            let paramIndex = 2;
            
            if (unreadOnly === 'true') {
                query += ` AND n.is_read = false`;
            }
            
            query += ` ORDER BY n.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
            values.push(parseInt(limit), parseInt(offset));
            
            const result = await pool.query(query, values);
            
            // Get unread count
            const unreadResult = await pool.query(
                'SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = false',
                [req.user.id]
            );
            
            res.json({
                notifications: result.rows,
                unreadCount: parseInt(unreadResult.rows[0].count),
                pagination: {
                    limit: parseInt(limit),
                    offset: parseInt(offset)
                }
            });
            
        } catch (error) {
            logger.error('Get notifications error:', error);
            res.status(500).json({
                error: 'Failed to get notifications',
                code: 'GET_NOTIFICATIONS_ERROR'
            });
        }
    }

    // Get unread count
    async getUnreadCount(req, res) {
        try {
            const result = await pool.query(
                'SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = false',
                [req.user.id]
            );
            
            res.json({ unreadCount: parseInt(result.rows[0].count) });
            
        } catch (error) {
            logger.error('Get unread count error:', error);
            res.status(500).json({
                error: 'Failed to get unread count',
                code: 'UNREAD_COUNT_ERROR'
            });
        }
    }

    // Mark notification as read
    async markAsRead(req, res) {
        try {
            const { id } = req.params;
            
            const result = await pool.query(
                `UPDATE notifications 
                 SET is_read = true, updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1 AND user_id = $2
                 RETURNING *`,
                [id, req.user.id]
            );
            
            if (result.rows.length === 0) {
                return res.status(404).json({
                    error: 'Notification not found',
                    code: 'NOTIFICATION_NOT_FOUND'
                });
            }
            
            res.json({
                message: 'Notification marked as read',
                notification: result.rows[0]
            });
            
        } catch (error) {
            logger.error('Mark as read error:', error);
            res.status(500).json({
                error: 'Failed to mark notification as read',
                code: 'MARK_AS_READ_ERROR'
            });
        }
    }

    // Mark all as read
    async markAllAsRead(req, res) {
        try {
            await pool.query(
                `UPDATE notifications 
                 SET is_read = true, updated_at = CURRENT_TIMESTAMP
                 WHERE user_id = $1 AND is_read = false`,
                [req.user.id]
            );
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'MARK_ALL_NOTIFICATIONS_READ', 'NOTIFICATION_CENTER', 
                 JSON.stringify({}), req.ip]
            );
            
            res.json({
                message: 'All notifications marked as read'
            });
            
        } catch (error) {
            logger.error('Mark all as read error:', error);
            res.status(500).json({
                error: 'Failed to mark all notifications as read',
                code: 'MARK_ALL_READ_ERROR'
            });
        }
    }

    // Delete notification
    async deleteNotification(req, res) {
        try {
            const { id } = req.params;
            
            const result = await pool.query(
                'DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING id',
                [id, req.user.id]
            );
            
            if (result.rows.length === 0) {
                return res.status(404).json({
                    error: 'Notification not found',
                    code: 'NOTIFICATION_NOT_FOUND'
                });
            }
            
            res.json({
                message: 'Notification deleted'
            });
            
        } catch (error) {
            logger.error('Delete notification error:', error);
            res.status(500).json({
                error: 'Failed to delete notification',
                code: 'DELETE_NOTIFICATION_ERROR'
            });
        }
    }

    // Create notification (internal)
    async createNotification(userId, title, message, type, link = null) {
        try {
            await pool.query(
                `INSERT INTO notifications (user_id, title, message, type, link, created_at)
                 VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
                [userId, title, message, type, link]
            );
        } catch (error) {
            logger.error('Create notification error:', error);
        }
    }

    // Get notification preferences
    async getPreferences(req, res) {
        try {
            const result = await pool.query(
                'SELECT * FROM notification_preferences WHERE user_id = $1',
                [req.user.id]
            );
            
            if (result.rows.length === 0) {
                // Create default preferences
                const defaultPrefs = {
                    email: true,
                    push: true,
                    inApp: true,
                    taskAssignments: true,
                    projectUpdates: true,
                    approvals: true,
                    mentions: true,
                    systemAlerts: true
                };
                
                await pool.query(
                    `INSERT INTO notification_preferences (user_id, preferences)
                     VALUES ($1, $2)`,
                    [req.user.id, JSON.stringify(defaultPrefs)]
                );
                
                return res.json({ preferences: defaultPrefs });
            }
            
            res.json({ preferences: result.rows[0].preferences });
            
        } catch (error) {
            logger.error('Get notification preferences error:', error);
            res.status(500).json({
                error: 'Failed to get notification preferences',
                code: 'GET_PREFERENCES_ERROR'
            });
        }
    }

    // Update notification preferences
    async updatePreferences(req, res) {
        try {
            const { preferences } = req.body;
            
            await pool.query(
                `INSERT INTO notification_preferences (user_id, preferences, updated_at)
                 VALUES ($1, $2, CURRENT_TIMESTAMP)
                 ON CONFLICT (user_id) DO UPDATE 
                 SET preferences = $2, updated_at = CURRENT_TIMESTAMP`,
                [req.user.id, JSON.stringify(preferences)]
            );
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'UPDATE_NOTIFICATION_PREFERENCES', 'NOTIFICATION_CENTER', 
                 JSON.stringify({ preferences }), req.ip]
            );
            
            res.json({
                message: 'Preferences updated successfully',
                preferences
            });
            
        } catch (error) {
            logger.error('Update notification preferences error:', error);
            res.status(500).json({
                error: 'Failed to update notification preferences',
                code: 'UPDATE_PREFERENCES_ERROR'
            });
        }
    }
}

module.exports = new NotificationController();