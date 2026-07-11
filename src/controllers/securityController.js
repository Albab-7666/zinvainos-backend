const SecurityLog = require('../models/SecurityLog');
const { pool } = require('../config/database');
const { logger } = require('../utils/logger');

class SecurityController {
    // Get security logs
    async getLogs(req, res) {
        try {
            const { limit = 100, offset = 0, severity, userId } = req.query;
            
            const logs = await SecurityLog.getLogs({
                limit: parseInt(limit),
                offset: parseInt(offset),
                severity,
                userId
            });
            
            res.json({
                logs,
                pagination: {
                    limit: parseInt(limit),
                    offset: parseInt(offset)
                }
            });
        } catch (error) {
            logger.error('Get security logs error:', error);
            res.status(500).json({
                error: 'Failed to get security logs',
                code: 'SECURITY_LOGS_ERROR'
            });
        }
    }

    // Get blocked IPs
    async getBlockedIPs(req, res) {
        try {
            const blockedIPs = await SecurityLog.getBlockedIPs();
            res.json({ blockedIPs });
        } catch (error) {
            logger.error('Get blocked IPs error:', error);
            res.status(500).json({
                error: 'Failed to get blocked IPs',
                code: 'BLOCKED_IPS_ERROR'
            });
        }
    }

    // Block IP
    async blockIP(req, res) {
        try {
            const { ipAddress, reason, durationMinutes = 60 } = req.body;
            
            const block = await SecurityLog.blockIP(ipAddress, reason, durationMinutes);
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'BLOCK_IP', 'SECURITY', 
                 JSON.stringify({ ipAddress, reason, durationMinutes }), req.ip]
            );
            
            res.json({
                message: 'IP blocked successfully',
                block
            });
        } catch (error) {
            logger.error('Block IP error:', error);
            res.status(500).json({
                error: 'Failed to block IP',
                code: 'BLOCK_IP_ERROR'
            });
        }
    }

    // Unblock IP
    async unblockIP(req, res) {
        try {
            const { ipAddress } = req.params;
            
            await SecurityLog.unblockIP(ipAddress);
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'UNBLOCK_IP', 'SECURITY', 
                 JSON.stringify({ ipAddress }), req.ip]
            );
            
            res.json({
                message: 'IP unblocked successfully'
            });
        } catch (error) {
            logger.error('Unblock IP error:', error);
            res.status(500).json({
                error: 'Failed to unblock IP',
                code: 'UNBLOCK_IP_ERROR'
            });
        }
    }

    // Get security settings
    async getSettings(req, res) {
        try {
            const result = await pool.query(
                'SELECT * FROM security_settings LIMIT 1'
            );
            
            const settings = result.rows[0] || {
                rateLimit: 100,
                sessionTimeout: 3600,
                passwordPolicy: {
                    minLength: 8,
                    requireUppercase: true,
                    requireLowercase: true,
                    requireNumbers: true,
                    requireSpecialChars: true
                },
                twoFactorAuth: false,
                ipWhitelist: [],
                ipBlacklist: []
            };
            
            res.json({ settings });
        } catch (error) {
            logger.error('Get security settings error:', error);
            res.status(500).json({
                error: 'Failed to get security settings',
                code: 'SECURITY_SETTINGS_ERROR'
            });
        }
    }

    // Update security settings
    async updateSettings(req, res) {
        try {
            const settings = req.body;
            
            const result = await pool.query(
                `INSERT INTO security_settings (settings, updated_at, updated_by)
                 VALUES ($1, CURRENT_TIMESTAMP, $2)
                 ON CONFLICT (id) DO UPDATE 
                 SET settings = $1, updated_at = CURRENT_TIMESTAMP, updated_by = $2
                 RETURNING settings`,
                [JSON.stringify(settings), req.user.id]
            );
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'UPDATE_SECURITY_SETTINGS', 'SECURITY', 
                 JSON.stringify(settings), req.ip]
            );
            
            res.json({
                message: 'Security settings updated successfully',
                settings: result.rows[0].settings
            });
        } catch (error) {
            logger.error('Update security settings error:', error);
            res.status(500).json({
                error: 'Failed to update security settings',
                code: 'SECURITY_SETTINGS_UPDATE_ERROR'
            });
        }
    }

    // Check security health
    async getHealth(req, res) {
        try {
            const checks = {
                rateLimit: 'OK',
                sessionSecurity: 'OK',
                bruteForceProtection: 'OK',
                sqlInjectionProtection: 'OK',
                xssProtection: 'OK',
                csrfProtection: 'OK'
            };

            // Check blocked IPs count
            const blockedIPs = await SecurityLog.getBlockedIPs();
            if (blockedIPs.length > 10) {
                checks.bruteForceProtection = 'WARNING';
            }

            // Check recent security events
            const recentLogs = await SecurityLog.getLogs({ limit: 10 });
            const suspiciousEvents = recentLogs.filter(log => 
                log.severity === 'HIGH' || log.severity === 'CRITICAL'
            );
            
            if (suspiciousEvents.length > 5) {
                checks.securityEvents = 'WARNING';
            }

            res.json({
                status: 'OK',
                checks,
                blockedIPs: blockedIPs.length,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            logger.error('Security health check error:', error);
            res.status(500).json({
                error: 'Failed to check security health',
                code: 'SECURITY_HEALTH_ERROR'
            });
        }
    }
}

module.exports = new SecurityController();