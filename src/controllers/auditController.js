const { pool } = require('../config/database');
const { logger } = require('../utils/logger');

class AuditController {
    // Get audit logs
    async getAuditLogs(req, res) {
        try {
            // Only CEO can access full audit logs
            if (req.user.role !== 'CEO') {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            }
            
            const { 
                userId, module, action, 
                startDate, endDate, 
                limit = 100, offset = 0 
            } = req.query;
            
            let query = `
                SELECT al.*, 
                       u.full_name as user_name,
                       u.email as user_email
                FROM activity_logs al
                LEFT JOIN users u ON al.user_id = u.id
                WHERE 1=1
            `;
            let values = [];
            let paramIndex = 1;
            
            if (userId) {
                query += ` AND al.user_id = $${paramIndex}`;
                values.push(userId);
                paramIndex++;
            }
            
            if (module) {
                query += ` AND al.module = $${paramIndex}`;
                values.push(module);
                paramIndex++;
            }
            
            if (action) {
                query += ` AND al.action = $${paramIndex}`;
                values.push(action);
                paramIndex++;
            }
            
            if (startDate) {
                query += ` AND al.created_at >= $${paramIndex}`;
                values.push(startDate);
                paramIndex++;
            }
            
            if (endDate) {
                query += ` AND al.created_at <= $${paramIndex}`;
                values.push(endDate);
                paramIndex++;
            }
            
            // Get total count
            const countQuery = query.replace(
                'SELECT al.*, u.full_name as user_name, u.email as user_email',
                'SELECT COUNT(*) as total'
            );
            const countResult = await pool.query(countQuery, values);
            const total = parseInt(countResult.rows[0].total);
            
            // Get paginated results
            query += ` ORDER BY al.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
            values.push(parseInt(limit), parseInt(offset));
            
            const result = await pool.query(query, values);
            
            res.json({
                logs: result.rows,
                pagination: {
                    total,
                    limit: parseInt(limit),
                    offset: parseInt(offset),
                    totalPages: Math.ceil(total / parseInt(limit))
                }
            });
            
        } catch (error) {
            logger.error('Get audit logs error:', error);
            res.status(500).json({
                error: 'Failed to get audit logs',
                code: 'GET_AUDIT_LOGS_ERROR'
            });
        }
    }

    // Get audit log by ID
    async getAuditLog(req, res) {
        try {
            // Only CEO can access audit logs
            if (req.user.role !== 'CEO') {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            }
            
            const { id } = req.params;
            
            const result = await pool.query(
                `SELECT al.*, 
                        u.full_name as user_name,
                        u.email as user_email
                 FROM activity_logs al
                 LEFT JOIN users u ON al.user_id = u.id
                 WHERE al.id = $1`,
                [id]
            );
            
            if (result.rows.length === 0) {
                return res.status(404).json({
                    error: 'Audit log not found',
                    code: 'AUDIT_LOG_NOT_FOUND'
                });
            }
            
            res.json({ log: result.rows[0] });
            
        } catch (error) {
            logger.error('Get audit log error:', error);
            res.status(500).json({
                error: 'Failed to get audit log',
                code: 'GET_AUDIT_LOG_ERROR'
            });
        }
    }

    // Get audit summary
    async getAuditSummary(req, res) {
        try {
            // Only CEO can access audit summary
            if (req.user.role !== 'CEO') {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            }
            
            // Get activity by module
            const byModule = await pool.query(
                `SELECT 
                    module,
                    COUNT(*) as count
                 FROM activity_logs
                 WHERE created_at >= DATE_TRUNC('week', CURRENT_DATE)
                 GROUP BY module
                 ORDER BY count DESC
                 LIMIT 10`
            );
            
            // Get activity by user
            const byUser = await pool.query(
                `SELECT 
                    u.full_name,
                    COUNT(*) as count
                 FROM activity_logs al
                 LEFT JOIN users u ON al.user_id = u.id
                 WHERE al.created_at >= DATE_TRUNC('week', CURRENT_DATE)
                 GROUP BY u.full_name
                 ORDER BY count DESC
                 LIMIT 10`
            );
            
            // Get activity by hour
            const byHour = await pool.query(
                `SELECT 
                    EXTRACT(HOUR FROM created_at) as hour,
                    COUNT(*) as count
                 FROM activity_logs
                 WHERE created_at >= DATE_TRUNC('week', CURRENT_DATE)
                 GROUP BY EXTRACT(HOUR FROM created_at)
                 ORDER BY hour ASC`
            );
            
            // Get activity by day
            const byDay = await pool.query(
                `SELECT 
                    DATE_TRUNC('day', created_at) as day,
                    COUNT(*) as count
                 FROM activity_logs
                 WHERE created_at >= DATE_TRUNC('week', CURRENT_DATE)
                 GROUP BY DATE_TRUNC('day', created_at)
                 ORDER BY day DESC`
            );
            
            res.json({
                summary: {
                    byModule: byModule.rows,
                    byUser: byUser.rows,
                    byHour: byHour.rows,
                    byDay: byDay.rows,
                    totalActivities: byDay.rows.reduce((sum, r) => sum + parseInt(r.count), 0)
                },
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            logger.error('Get audit summary error:', error);
            res.status(500).json({
                error: 'Failed to get audit summary',
                code: 'AUDIT_SUMMARY_ERROR'
            });
        }
    }

    // Export audit logs
    async exportAuditLogs(req, res) {
        try {
            // Only CEO can export audit logs
            if (req.user.role !== 'CEO') {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            }
            
            const { format = 'json', startDate, endDate } = req.query;
            
            let query = `
                SELECT al.*, 
                       u.full_name as user_name,
                       u.email as user_email
                FROM activity_logs al
                LEFT JOIN users u ON al.user_id = u.id
                WHERE 1=1
            `;
            let values = [];
            let paramIndex = 1;
            
            if (startDate) {
                query += ` AND al.created_at >= $${paramIndex}`;
                values.push(startDate);
                paramIndex++;
            }
            
            if (endDate) {
                query += ` AND al.created_at <= $${paramIndex}`;
                values.push(endDate);
                paramIndex++;
            }
            
            query += ` ORDER BY al.created_at DESC`;
            
            const result = await pool.query(query, values);
            
            if (format === 'csv') {
                const csv = this.convertToCSV(result.rows);
                res.setHeader('Content-Type', 'text/csv');
                res.setHeader('Content-Disposition', 'attachment; filename=audit_logs.csv');
                return res.send(csv);
            }
            
            res.json({
                logs: result.rows,
                exportedAt: new Date().toISOString(),
                totalRecords: result.rows.length
            });
            
        } catch (error) {
            logger.error('Export audit logs error:', error);
            res.status(500).json({
                error: 'Failed to export audit logs',
                code: 'EXPORT_AUDIT_ERROR'
            });
        }
    }

    // Helper: Convert to CSV
    convertToCSV(data) {
        if (!data || !data.length) return '';
        
        const headers = Object.keys(data[0]);
        const rows = data.map(item => 
            headers.map(header => JSON.stringify(item[header] || '')).join(',')
        );
        
        return [headers.join(','), ...rows].join('\n');
    }

    // Clean old audit logs
    async cleanOldLogs(req, res) {
        try {
            // Only CEO can clean audit logs
            if (req.user.role !== 'CEO') {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            }
            
            const { days = 90 } = req.body;
            
            const result = await pool.query(
                'DELETE FROM activity_logs WHERE created_at < CURRENT_DATE - INTERVAL $1 DAY RETURNING id',
                [days]
            );
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'CLEAN_AUDIT_LOGS', 'AUDIT_LOGS', 
                 JSON.stringify({ days, deletedCount: result.rows.length }), req.ip]
            );
            
            res.json({
                message: `Audit logs older than ${days} days cleaned`,
                deletedCount: result.rows.length
            });
            
        } catch (error) {
            logger.error('Clean audit logs error:', error);
            res.status(500).json({
                error: 'Failed to clean audit logs',
                code: 'CLEAN_AUDIT_LOGS_ERROR'
            });
        }
    }
}

module.exports = new AuditController();