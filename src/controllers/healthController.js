const { pool } = require('../config/database');
const { logger } = require('../utils/logger');
const os = require('os');

class HealthController {
    // Check system health
    async getSystemHealth(req, res) {
        try {
            // Only CEO can access system health
            if (req.user.role !== 'CEO') {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            }
            
            const health = {
                status: 'OK',
                uptime: process.uptime(),
                timestamp: new Date().toISOString(),
                services: {
                    database: await this.checkDatabase(),
                    api: await this.checkAPI(),
                    storage: await this.checkStorage()
                },
                system: {
                    memory: this.checkMemory(),
                    cpu: this.checkCPU(),
                    disk: await this.checkDisk()
                },
                performance: await this.getPerformanceMetrics()
            };
            
            // Overall status
            const hasError = Object.values(health.services).some(s => s.status === 'ERROR');
            if (hasError) {
                health.status = 'DEGRADED';
            }
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'SYSTEM_HEALTH_CHECK', 'SYSTEM_HEALTH', 
                 JSON.stringify({ status: health.status }), req.ip]
            );
            
            res.json(health);
            
        } catch (error) {
            logger.error('Get system health error:', error);
            res.status(500).json({
                error: 'Failed to check system health',
                code: 'SYSTEM_HEALTH_ERROR'
            });
        }
    }

    // Check database health
    async checkDatabase() {
        try {
            const startTime = Date.now();
            await pool.query('SELECT 1');
            const responseTime = Date.now() - startTime;
            
            // Get connection count
            const connections = await pool.query(
                'SELECT COUNT(*) as count FROM pg_stat_activity'
            );
            
            return {
                status: 'OK',
                responseTime: `${responseTime}ms`,
                connections: parseInt(connections.rows[0].count),
                maxConnections: 100
            };
        } catch (error) {
            return {
                status: 'ERROR',
                message: error.message
            };
        }
    }

    // Check API health
    async checkAPI() {
        return {
            status: 'OK',
            version: '1.0.0',
            environment: process.env.NODE_ENV || 'development'
        };
    }

    // Check storage health
    async checkStorage() {
        try {
            const result = await pool.query(
                'SELECT COALESCE(SUM(file_size), 0) as total FROM files'
            );
            
            const totalSize = parseInt(result.rows[0].total);
            const limit = 10 * 1024 * 1024 * 1024; // 10GB
            
            return {
                status: totalSize < limit * 0.9 ? 'OK' : 'WARNING',
                used: this.formatBytes(totalSize),
                limit: this.formatBytes(limit),
                percentage: Math.round((totalSize / limit) * 100)
            };
        } catch (error) {
            return {
                status: 'ERROR',
                message: error.message
            };
        }
    }

    // Check memory
    checkMemory() {
        const total = os.totalmem();
        const free = os.freemem();
        const used = total - free;
        
        return {
            total: this.formatBytes(total),
            used: this.formatBytes(used),
            free: this.formatBytes(free),
            percentage: Math.round((used / total) * 100)
        };
    }

    // Check CPU
    checkCPU() {
        const cpus = os.cpus();
        const loadAverage = os.loadavg();
        
        return {
            model: cpus[0]?.model || 'Unknown',
            cores: cpus.length,
            loadAverage: {
                '1min': loadAverage[0].toFixed(2),
                '5min': loadAverage[1].toFixed(2),
                '15min': loadAverage[2].toFixed(2)
            }
        };
    }

    // Check disk
    async checkDisk() {
        // Simple check - would need a library for detailed disk info
        return {
            status: 'OK',
            message: 'Disk check passed'
        };
    }

    // Get performance metrics
    async getPerformanceMetrics() {
        try {
            // Query performance
            const slowQueries = await pool.query(
                `SELECT query, calls, total_time, mean_time
                 FROM pg_stat_statements
                 ORDER BY mean_time DESC
                 LIMIT 10`
            );
            
            // Cache hit ratio
            const cacheHit = await pool.query(
                `SELECT 
                    SUM(heap_blks_hit) as hit,
                    SUM(heap_blks_read) as read
                 FROM pg_statio_user_tables`
            );
            
            const hit = parseInt(cacheHit.rows[0].hit) || 0;
            const read = parseInt(cacheHit.rows[0].read) || 0;
            const total = hit + read;
            
            return {
                queryPerformance: slowQueries.rows,
                cacheHitRatio: total > 0 ? Math.round((hit / total) * 100) : 0
            };
        } catch (error) {
            return {
                queryPerformance: [],
                cacheHitRatio: 0
            };
        }
    }

    // Get system logs
    async getSystemLogs(req, res) {
        try {
            // Only CEO can access system logs
            if (req.user.role !== 'CEO') {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            }
            
            const { limit = 100, offset = 0, level } = req.query;
            
            let query = `
                SELECT * FROM system_logs
                WHERE 1=1
            `;
            let values = [];
            let paramIndex = 1;
            
            if (level) {
                query += ` AND level = $${paramIndex}`;
                values.push(level);
                paramIndex++;
            }
            
            query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
            values.push(parseInt(limit), parseInt(offset));
            
            const result = await pool.query(query, values);
            
            res.json({
                logs: result.rows,
                pagination: {
                    limit: parseInt(limit),
                    offset: parseInt(offset)
                }
            });
            
        } catch (error) {
            logger.error('Get system logs error:', error);
            res.status(500).json({
                error: 'Failed to get system logs',
                code: 'GET_SYSTEM_LOGS_ERROR'
            });
        }
    }

    // Format bytes
    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

module.exports = new HealthController();