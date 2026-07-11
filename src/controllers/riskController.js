const { pool } = require('../config/database');
const { logger } = require('../utils/logger');

class RiskController {
    // Get risk alerts
    async getRiskAlerts(req, res) {
        try {
            const alerts = [];
            
            // 1. Check overdue tasks
            const overdueTasks = await pool.query(
                `SELECT COUNT(*) as count FROM tasks 
                 WHERE due_date < CURRENT_DATE 
                 AND status != 'COMPLETED'
                 ${req.user.role === 'EMPLOYEE' ? `AND assigned_to = ${req.user.id}` : ''}`
            );
            
            if (parseInt(overdueTasks.rows[0].count) > 0) {
                alerts.push({
                    type: 'OVERDUE_TASKS',
                    severity: 'HIGH',
                    message: `${overdueTasks.rows[0].count} tasks are overdue`,
                    count: parseInt(overdueTasks.rows[0].count)
                });
            }
            
            // 2. Check project budget
            const budgetExceeded = await pool.query(
                `SELECT p.id, p.name, p.budget, 
                        COALESCE(SUM(t.actual_hours * 50), 0) as actual_cost
                 FROM projects p
                 LEFT JOIN tasks t ON t.project_id = p.id
                 WHERE p.budget IS NOT NULL
                 GROUP BY p.id, p.name, p.budget
                 HAVING COALESCE(SUM(t.actual_hours * 50), 0) > p.budget * 0.8`
            );
            
            for (const project of budgetExceeded.rows) {
                alerts.push({
                    type: 'BUDGET_WARNING',
                    severity: 'MEDIUM',
                    message: `Project "${project.name}" is at ${Math.round((project.actual_cost / project.budget) * 100)}% of budget`,
                    projectId: project.id,
                    budget: project.budget,
                    actualCost: project.actual_cost
                });
            }
            
            // 3. Check low attendance
            const lowAttendance = await pool.query(
                `SELECT u.id, u.full_name,
                        COUNT(CASE WHEN a.status = 'ABSENT' THEN 1 END) as absent_days
                 FROM users u
                 LEFT JOIN attendance a ON a.user_id = u.id
                 WHERE a.date >= DATE_TRUNC('month', CURRENT_DATE)
                 GROUP BY u.id, u.full_name
                 HAVING COUNT(CASE WHEN a.status = 'ABSENT' THEN 1 END) > 3`
            );
            
            for (const user of lowAttendance.rows) {
                alerts.push({
                    type: 'LOW_ATTENDANCE',
                    severity: 'MEDIUM',
                    message: `${user.full_name} has ${user.absent_days} absences this month`,
                    userId: user.id,
                    absentDays: user.absent_days
                });
            }
            
            // 4. Check pending approvals (CEO and Team Members only)
            if (req.user.role !== 'EMPLOYEE') {
                const pendingApprovals = await pool.query(
                    'SELECT COUNT(*) as count FROM approvals WHERE status = $1',
                    ['PENDING']
                );
                
                if (parseInt(pendingApprovals.rows[0].count) > 5) {
                    alerts.push({
                        type: 'PENDING_APPROVALS',
                        severity: 'LOW',
                        message: `${pendingApprovals.rows[0].count} approvals are pending`,
                        count: parseInt(pendingApprovals.rows[0].count)
                    });
                }
            }
            
            // 5. Check system health
            const systemHealth = await this.checkSystemHealth();
            if (systemHealth.hasIssues) {
                alerts.push({
                    type: 'SYSTEM_HEALTH',
                    severity: 'HIGH',
                    message: 'System health issues detected',
                    details: systemHealth.issues
                });
            }
            
            // Log risk check
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'CHECK_RISK_ALERTS', 'RISK_ALERT', 
                 JSON.stringify({ alertCount: alerts.length }), req.ip]
            );
            
            res.json({
                alerts,
                totalAlerts: alerts.length,
                highSeverity: alerts.filter(a => a.severity === 'HIGH').length,
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            logger.error('Get risk alerts error:', error);
            res.status(500).json({
                error: 'Failed to get risk alerts',
                code: 'RISK_ALERTS_ERROR'
            });
        }
    }

    // Check system health
    async checkSystemHealth() {
        const issues = [];
        
        try {
            // Check database connection
            await pool.query('SELECT 1');
        } catch (error) {
            issues.push('Database connection issues');
        }
        
        // Check storage usage
        const storageResult = await pool.query(
            'SELECT COALESCE(SUM(file_size), 0) as total FROM files'
        );
        const storageUsed = parseInt(storageResult.rows[0].total);
        
        if (storageUsed > 10000000000) { // 10GB
            issues.push('Storage usage is high');
        }
        
        // Check user activity
        const inactiveUsers = await pool.query(
            "SELECT COUNT(*) as count FROM users WHERE last_login < CURRENT_DATE - INTERVAL '30 days'"
        );
        
        if (parseInt(inactiveUsers.rows[0].count) > 10) {
            issues.push('Many users are inactive');
        }
        
        return {
            hasIssues: issues.length > 0,
            issues
        };
    }

    // Get risk metrics
    async getRiskMetrics(req, res) {
        try {
            const metrics = {
                taskRisks: {
                    overdue: 0,
                    blocked: 0,
                    highPriority: 0
                },
                projectRisks: {
                    delayed: 0,
                    overBudget: 0
                },
                resourceRisks: {
                    overloaded: 0,
                    underutilized: 0
                }
            };
            
            // Get overdue tasks
            const overdueResult = await pool.query(
                'SELECT COUNT(*) as count FROM tasks WHERE due_date < CURRENT_DATE AND status != $1',
                ['COMPLETED']
            );
            metrics.taskRisks.overdue = parseInt(overdueResult.rows[0].count);
            
            // Get blocked tasks
            const blockedResult = await pool.query(
                'SELECT COUNT(*) as count FROM tasks WHERE status = $1',
                ['BLOCKED']
            );
            metrics.taskRisks.blocked = parseInt(blockedResult.rows[0].count);
            
            // Get high priority tasks
            const highPriorityResult = await pool.query(
                'SELECT COUNT(*) as count FROM tasks WHERE priority IN ($1, $2)',
                ['HIGH', 'CRITICAL']
            );
            metrics.taskRisks.highPriority = parseInt(highPriorityResult.rows[0].count);
            
            // Get delayed projects
            const delayedResult = await pool.query(
                `SELECT COUNT(*) as count FROM projects 
                 WHERE end_date < CURRENT_DATE AND status != 'COMPLETED'`
            );
            metrics.projectRisks.delayed = parseInt(delayedResult.rows[0].count);
            
            // Get over budget projects
            const budgetResult = await pool.query(
                `SELECT COUNT(*) as count FROM projects 
                 WHERE budget < (SELECT COALESCE(SUM(actual_hours * 50), 0) FROM tasks WHERE project_id = projects.id)`
            );
            metrics.projectRisks.overBudget = parseInt(budgetResult.rows[0].count);
            
            // Get overloaded team members
            const overloadedResult = await pool.query(
                `SELECT assigned_to, COUNT(*) as task_count
                 FROM tasks 
                 WHERE status != 'COMPLETED'
                 GROUP BY assigned_to
                 HAVING COUNT(*) > 10`
            );
            metrics.resourceRisks.overloaded = overloadedResult.rows.length;
            
            res.json({
                metrics,
                riskScore: this.calculateRiskScore(metrics),
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            logger.error('Get risk metrics error:', error);
            res.status(500).json({
                error: 'Failed to get risk metrics',
                code: 'RISK_METRICS_ERROR'
            });
        }
    }

    // Calculate risk score
    calculateRiskScore(metrics) {
        let score = 0;
        
        // Task risks
        score += metrics.taskRisks.overdue * 5;
        score += metrics.taskRisks.blocked * 3;
        score += metrics.taskRisks.highPriority * 2;
        
        // Project risks
        score += metrics.projectRisks.delayed * 10;
        score += metrics.projectRisks.overBudget * 8;
        
        // Resource risks
        score += metrics.resourceRisks.overloaded * 4;
        
        // Cap at 100
        return Math.min(score, 100);
    }

    // Update alert settings
    async updateAlertSettings(req, res) {
        try {
            const { settings } = req.body;
            
            await pool.query(
                `INSERT INTO alert_settings (user_id, settings, updated_at)
                 VALUES ($1, $2, CURRENT_TIMESTAMP)
                 ON CONFLICT (user_id) DO UPDATE 
                 SET settings = $2, updated_at = CURRENT_TIMESTAMP`,
                [req.user.id, JSON.stringify(settings)]
            );
            
            res.json({
                message: 'Alert settings updated',
                settings
            });
            
        } catch (error) {
            logger.error('Update alert settings error:', error);
            res.status(500).json({
                error: 'Failed to update alert settings',
                code: 'UPDATE_ALERT_SETTINGS_ERROR'
            });
        }
    }

    // Get alert settings
    async getAlertSettings(req, res) {
        try {
            const result = await pool.query(
                'SELECT settings FROM alert_settings WHERE user_id = $1',
                [req.user.id]
            );
            
            if (result.rows.length === 0) {
                // Return default settings
                const defaultSettings = {
                    overdueTasks: true,
                    budgetWarnings: true,
                    lowAttendance: true,
                    pendingApprovals: true,
                    systemHealth: true,
                    emailAlerts: true,
                    pushAlerts: true
                };
                
                return res.json({ settings: defaultSettings });
            }
            
            res.json({ settings: result.rows[0].settings });
            
        } catch (error) {
            logger.error('Get alert settings error:', error);
            res.status(500).json({
                error: 'Failed to get alert settings',
                code: 'GET_ALERT_SETTINGS_ERROR'
            });
        }
    }
}

module.exports = new RiskController();