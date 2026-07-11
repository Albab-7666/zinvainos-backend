const { pool } = require('../config/database');
const { logger } = require('../utils/logger');

class DashboardController {
    // Get dashboard overview
    async getOverview(req, res) {
        try {
            const userId = req.user.id;
            const userRole = req.user.role;
            
            let stats = {};
            
            // Role-based dashboard stats
            if (userRole === 'CEO') {
                // CEO - full overview
                const results = await Promise.all([
                    pool.query('SELECT COUNT(*) as total FROM users'),
                    pool.query('SELECT COUNT(*) as total FROM users WHERE status = $1', ['PENDING']),
                    pool.query('SELECT COUNT(*) as total FROM projects WHERE status = $1', ['ACTIVE']),
                    pool.query('SELECT COUNT(*) as total FROM tasks WHERE status = $1', ['IN_PROGRESS']),
                    pool.query('SELECT COUNT(*) as total FROM clients'),
                    pool.query('SELECT COUNT(*) as total FROM tasks WHERE status = $1', ['COMPLETED']),
                    pool.query('SELECT COALESCE(SUM(total), 0) as total FROM invoices WHERE status = $1', ['PAID']),
                    pool.query('SELECT COALESCE(SUM(total), 0) as total FROM invoices WHERE status = $1', ['OVERDUE'])
                ]);
                
                stats = {
                    totalUsers: parseInt(results[0].rows[0].total),
                    pendingApprovals: parseInt(results[1].rows[0].total),
                    activeProjects: parseInt(results[2].rows[0].total),
                    tasksInProgress: parseInt(results[3].rows[0].total),
                    totalClients: parseInt(results[4].rows[0].total),
                    completedTasks: parseInt(results[5].rows[0].total),
                    totalRevenue: parseFloat(results[6].rows[0].total),
                    overdueInvoices: parseFloat(results[7].rows[0].total)
                };
                
            } else if (userRole === 'TEAM_MEMBER') {
                // Team Member - team overview
                const results = await Promise.all([
                    pool.query('SELECT COUNT(*) as total FROM tasks WHERE assigned_to = $1 AND status != $2', [userId, 'COMPLETED']),
                    pool.query('SELECT COUNT(*) as total FROM tasks WHERE assigned_to = $1 AND status = $2', [userId, 'COMPLETED']),
                    pool.query('SELECT COUNT(*) as total FROM projects WHERE created_by = $1 AND status = $2', [userId, 'ACTIVE']),
                    pool.query('SELECT COUNT(*) as total FROM users WHERE role = $1', ['EMPLOYEE'])
                ]);
                
                stats = {
                    assignedTasks: parseInt(results[0].rows[0].total),
                    completedTasks: parseInt(results[1].rows[0].total),
                    activeProjects: parseInt(results[2].rows[0].total),
                    teamMembers: parseInt(results[3].rows[0].total)
                };
                
            } else {
                // Employee - personal overview
                const results = await Promise.all([
                    pool.query('SELECT COUNT(*) as total FROM tasks WHERE assigned_to = $1 AND status != $2', [userId, 'COMPLETED']),
                    pool.query('SELECT COUNT(*) as total FROM tasks WHERE assigned_to = $1 AND status = $2', [userId, 'COMPLETED']),
                    pool.query('SELECT COUNT(*) as total FROM tasks WHERE assigned_to = $1 AND due_date < CURRENT_DATE AND status != $2', [userId, 'COMPLETED']),
                    pool.query('SELECT COALESCE(SUM(duration_minutes), 0) as total FROM time_entries WHERE user_id = $1 AND date(created_at) = CURRENT_DATE', [userId])
                ]);
                
                stats = {
                    pendingTasks: parseInt(results[0].rows[0].total),
                    completedTasks: parseInt(results[1].rows[0].total),
                    overdueTasks: parseInt(results[2].rows[0].total),
                    todayHours: Math.round(parseFloat(results[3].rows[0].total) / 60 * 10) / 10
                };
            }
            
            res.json({
                stats,
                role: userRole,
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            logger.error('Get dashboard overview error:', error);
            res.status(500).json({
                error: 'Failed to get dashboard overview',
                code: 'DASHBOARD_ERROR'
            });
        }
    }

    // Get recent activities
    async getRecentActivities(req, res) {
        try {
            const { limit = 10 } = req.query;
            const userId = req.user.id;
            
            let query = `
                SELECT id, user_id, action, module, details, ip_address, created_at
                FROM activity_logs
                ORDER BY created_at DESC
                LIMIT $1
            `;
            
            let values = [parseInt(limit)];
            
            // If not CEO, only show own activities or team activities
            if (req.user.role !== 'CEO') {
                query = `
                    SELECT id, user_id, action, module, details, ip_address, created_at
                    FROM activity_logs
                    WHERE user_id = $1
                    ORDER BY created_at DESC
                    LIMIT $2
                `;
                values = [userId, parseInt(limit)];
            }
            
            const result = await pool.query(query, values);
            
            // Get user names for activities
            const activities = await Promise.all(result.rows.map(async (activity) => {
                if (activity.user_id) {
                    const userResult = await pool.query(
                        'SELECT full_name FROM users WHERE id = $1',
                        [activity.user_id]
                    );
                    activity.userName = userResult.rows[0]?.full_name || 'Unknown';
                }
                return activity;
            }));
            
            res.json({ activities });
            
        } catch (error) {
            logger.error('Get recent activities error:', error);
            res.status(500).json({
                error: 'Failed to get recent activities',
                code: 'ACTIVITIES_ERROR'
            });
        }
    }

    // Get task statistics
    async getTaskStats(req, res) {
        try {
            const userId = req.user.id;
            const userRole = req.user.role;
            
            let query = `
                SELECT 
                    COUNT(*) as total,
                    COUNT(CASE WHEN status = 'TODO' THEN 1 END) as todo,
                    COUNT(CASE WHEN status = 'IN_PROGRESS' THEN 1 END) as in_progress,
                    COUNT(CASE WHEN status = 'REVIEW' THEN 1 END) as review,
                    COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) as completed,
                    COUNT(CASE WHEN status = 'BLOCKED' THEN 1 END) as blocked
                FROM tasks
                WHERE 1=1
            `;
            
            let values = [];
            let paramIndex = 1;
            
            if (userRole === 'EMPLOYEE') {
                query += ` AND assigned_to = $${paramIndex}`;
                values.push(userId);
                paramIndex++;
            } else if (userRole === 'TEAM_MEMBER') {
                query += ` AND (assigned_to = $${paramIndex} OR created_by = $${paramIndex})`;
                values.push(userId);
                paramIndex++;
            }
            // CEO sees all tasks
            
            const result = await pool.query(query, values);
            
            res.json({
                stats: result.rows[0],
                role: userRole
            });
            
        } catch (error) {
            logger.error('Get task stats error:', error);
            res.status(500).json({
                error: 'Failed to get task statistics',
                code: 'TASK_STATS_ERROR'
            });
        }
    }

    // Get project statistics
    async getProjectStats(req, res) {
        try {
            const userId = req.user.id;
            const userRole = req.user.role;
            
            let query = `
                SELECT 
                    COUNT(*) as total,
                    COUNT(CASE WHEN status = 'PLANNING' THEN 1 END) as planning,
                    COUNT(CASE WHEN status = 'ACTIVE' THEN 1 END) as active,
                    COUNT(CASE WHEN status = 'ON_HOLD' THEN 1 END) as on_hold,
                    COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) as completed,
                    COUNT(CASE WHEN status = 'ARCHIVED' THEN 1 END) as archived
                FROM projects
                WHERE 1=1
            `;
            
            let values = [];
            
            if (userRole === 'EMPLOYEE') {
                // Employee sees projects they're assigned to
                query += ` AND id IN (
                    SELECT DISTINCT project_id FROM tasks WHERE assigned_to = $1
                )`;
                values.push(userId);
            } else if (userRole === 'TEAM_MEMBER') {
                query += ` AND (created_by = $1 OR assigned_to = $1)`;
                values.push(userId);
            }
            // CEO sees all
            
            const result = await pool.query(query, values);
            
            res.json({
                stats: result.rows[0],
                role: userRole
            });
            
        } catch (error) {
            logger.error('Get project stats error:', error);
            res.status(500).json({
                error: 'Failed to get project statistics',
                code: 'PROJECT_STATS_ERROR'
            });
        }
    }

    // Get upcoming deadlines
    async getUpcomingDeadlines(req, res) {
        try {
            const userId = req.user.id;
            const userRole = req.user.role;
            const limit = parseInt(req.query.limit) || 5;
            
            let query = `
                SELECT id, title, due_date, priority, status, assigned_to, project_id
                FROM tasks
                WHERE due_date >= CURRENT_DATE
                AND due_date <= CURRENT_DATE + INTERVAL '7 days'
                AND status != 'COMPLETED'
            `;
            
            let values = [];
            let paramIndex = 1;
            
            if (userRole === 'EMPLOYEE') {
                query += ` AND assigned_to = $${paramIndex}`;
                values.push(userId);
                paramIndex++;
            } else if (userRole === 'TEAM_MEMBER') {
                query += ` AND (assigned_to = $${paramIndex} OR created_by = $${paramIndex})`;
                values.push(userId);
                paramIndex++;
            }
            
            query += ` ORDER BY due_date ASC LIMIT $${paramIndex}`;
            values.push(limit);
            
            const result = await pool.query(query, values);
            
            // Get additional info
            const deadlines = await Promise.all(result.rows.map(async (task) => {
                // Get assignee name
                if (task.assigned_to) {
                    const userResult = await pool.query(
                        'SELECT full_name FROM users WHERE id = $1',
                        [task.assigned_to]
                    );
                    task.assignedToName = userResult.rows[0]?.full_name || 'Unassigned';
                }
                
                // Get project name
                if (task.project_id) {
                    const projectResult = await pool.query(
                        'SELECT name FROM projects WHERE id = $1',
                        [task.project_id]
                    );
                    task.projectName = projectResult.rows[0]?.name || 'No Project';
                }
                
                return task;
            }));
            
            res.json({ deadlines });
            
        } catch (error) {
            logger.error('Get upcoming deadlines error:', error);
            res.status(500).json({
                error: 'Failed to get upcoming deadlines',
                code: 'DEADLINES_ERROR'
            });
        }
    }

    // Get team workload
    async getTeamWorkload(req, res) {
        try {
            // Only accessible to CEO and Team Members
            if (req.user.role === 'EMPLOYEE') {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            }
            
            const teamMembers = await pool.query(
                `SELECT id, full_name, role, department 
                 FROM users 
                 WHERE role != 'CEO' AND status = 'ACTIVE'`
            );
            
            const workload = await Promise.all(teamMembers.rows.map(async (member) => {
                const taskCount = await pool.query(
                    `SELECT 
                        COUNT(*) as total,
                        COUNT(CASE WHEN status = 'IN_PROGRESS' THEN 1 END) as in_progress,
                        COUNT(CASE WHEN status = 'TODO' THEN 1 END) as pending,
                        COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) as completed
                     FROM tasks 
                     WHERE assigned_to = $1 AND due_date >= CURRENT_DATE`,
                    [member.id]
                );
                
                const hours = await pool.query(
                    `SELECT COALESCE(SUM(duration_minutes), 0) as total_hours
                     FROM time_entries 
                     WHERE user_id = $1 AND date(created_at) >= date_trunc('week', CURRENT_DATE)`,
                    [member.id]
                );
                
                return {
                    ...member,
                    tasks: taskCount.rows[0],
                    hoursThisWeek: Math.round(parseFloat(hours.rows[0].total_hours) / 60 * 10) / 10
                };
            }));
            
            // Calculate overall team metrics
            const totalTasks = workload.reduce((sum, m) => sum + parseInt(m.tasks.total), 0);
            const totalInProgress = workload.reduce((sum, m) => sum + parseInt(m.tasks.in_progress), 0);
            const totalHours = workload.reduce((sum, m) => sum + parseFloat(m.hoursThisWeek), 0);
            
            res.json({
                team: workload,
                summary: {
                    totalMembers: workload.length,
                    totalTasks,
                    totalInProgress,
                    totalHoursThisWeek: Math.round(totalHours * 10) / 10,
                    averageTasksPerMember: Math.round(totalTasks / workload.length * 10) / 10
                }
            });
            
        } catch (error) {
            logger.error('Get team workload error:', error);
            res.status(500).json({
                error: 'Failed to get team workload',
                code: 'WORKLOAD_ERROR'
            });
        }
    }

    // Get notification summary
    async getNotificationSummary(req, res) {
        try {
            const userId = req.user.id;
            
            const result = await pool.query(
                `SELECT 
                    COUNT(*) as total,
                    COUNT(CASE WHEN is_read = false THEN 1 END) as unread,
                    COUNT(CASE WHEN type = 'TASK' AND is_read = false THEN 1 END) as task_notifications,
                    COUNT(CASE WHEN type = 'PROJECT' AND is_read = false THEN 1 END) as project_notifications,
                    COUNT(CASE WHEN type = 'APPROVAL' AND is_read = false THEN 1 END) as approval_notifications,
                    COUNT(CASE WHEN type = 'MENTION' AND is_read = false THEN 1 END) as mention_notifications
                 FROM notifications 
                 WHERE user_id = $1`,
                [userId]
            );
            
            res.json({
                notifications: result.rows[0],
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            logger.error('Get notification summary error:', error);
            res.status(500).json({
                error: 'Failed to get notification summary',
                code: 'NOTIFICATION_SUMMARY_ERROR'
            });
        }
    }
}

module.exports = new DashboardController();