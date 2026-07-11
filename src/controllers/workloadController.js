const { pool } = require('../config/database');
const { logger } = require('../utils/logger');

class WorkloadController {
    // Get team workload overview
    async getTeamWorkload(req, res) {
        try {
            // Only CEO and Team Members can access
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
            
            const workloadData = await Promise.all(teamMembers.rows.map(async (member) => {
                // Get active tasks
                const tasks = await pool.query(
                    `SELECT 
                        COUNT(*) as total,
                        COUNT(CASE WHEN status = 'IN_PROGRESS' THEN 1 END) as in_progress,
                        COUNT(CASE WHEN status = 'TODO' THEN 1 END) as todo,
                        COUNT(CASE WHEN status = 'REVIEW' THEN 1 END) as review,
                        COUNT(CASE WHEN priority = 'HIGH' THEN 1 END) as high_priority,
                        COUNT(CASE WHEN priority = 'CRITICAL' THEN 1 END) as critical,
                        COUNT(CASE WHEN due_date < CURRENT_DATE AND status != 'COMPLETED' THEN 1 END) as overdue
                     FROM tasks 
                     WHERE assigned_to = $1 
                     AND status != 'COMPLETED'
                     AND due_date >= CURRENT_DATE`,
                    [member.id]
                );
                
                // Get completed tasks this week
                const completed = await pool.query(
                    `SELECT COUNT(*) as count
                     FROM tasks 
                     WHERE assigned_to = $1 
                     AND status = 'COMPLETED'
                     AND updated_at >= DATE_TRUNC('week', CURRENT_DATE)`,
                    [member.id]
                );
                
                // Get hours tracked this week
                const hours = await pool.query(
                    `SELECT COALESCE(SUM(duration_minutes), 0) as minutes
                     FROM time_entries 
                     WHERE user_id = $1 
                     AND created_at >= DATE_TRUNC('week', CURRENT_DATE)`,
                    [member.id]
                );
                
                // Calculate capacity (assuming 40 hours/week)
                const capacityMinutes = 40 * 60;
                const trackedMinutes = parseFloat(hours.rows[0].minutes);
                
                return {
                    ...member,
                    tasks: {
                        total: parseInt(tasks.rows[0].total),
                        inProgress: parseInt(tasks.rows[0].in_progress),
                        todo: parseInt(tasks.rows[0].todo),
                        review: parseInt(tasks.rows[0].review),
                        highPriority: parseInt(tasks.rows[0].high_priority),
                        critical: parseInt(tasks.rows[0].critical),
                        overdue: parseInt(tasks.rows[0].overdue)
                    },
                    completed: parseInt(completed.rows[0].count),
                    hoursTracked: Math.round(trackedMinutes / 60 * 10) / 10,
                    capacityUsed: Math.round((trackedMinutes / capacityMinutes) * 100),
                    utilization: Math.min(Math.round((trackedMinutes / capacityMinutes) * 100), 100)
                };
            }));
            
            // Calculate team metrics
            const teamMetrics = {
                totalMembers: workloadData.length,
                totalTasks: workloadData.reduce((sum, m) => sum + m.tasks.total, 0),
                totalInProgress: workloadData.reduce((sum, m) => sum + m.tasks.inProgress, 0),
                totalCompleted: workloadData.reduce((sum, m) => sum + m.completed, 0),
                totalHours: workloadData.reduce((sum, m) => sum + m.hoursTracked, 0),
                avgUtilization: Math.round(workloadData.reduce((sum, m) => sum + m.utilization, 0) / (workloadData.length || 1)),
                overloaded: workloadData.filter(m => m.utilization > 100).length,
                underutilized: workloadData.filter(m => m.utilization < 50).length
            };
            
            res.json({
                team: workloadData,
                metrics: teamMetrics,
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            logger.error('Get team workload error:', error);
            res.status(500).json({
                error: 'Failed to get team workload',
                code: 'TEAM_WORKLOAD_ERROR'
            });
        }
    }

    // Get workload by department
    async getWorkloadByDepartment(req, res) {
        try {
            // Only CEO and Team Members can access
            if (req.user.role === 'EMPLOYEE') {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            }
            
            const departments = await pool.query(
                'SELECT DISTINCT department FROM users WHERE department IS NOT NULL'
            );
            
            const workloadData = await Promise.all(departments.rows.map(async (dept) => {
                const members = await pool.query(
                    `SELECT id FROM users WHERE department = $1 AND status = 'ACTIVE'`,
                    [dept.department]
                );
                
                const memberIds = members.rows.map(m => m.id);
                
                if (memberIds.length === 0) {
                    return {
                        department: dept.department,
                        memberCount: 0,
                        tasks: { total: 0, inProgress: 0 },
                        hoursTracked: 0,
                        utilization: 0
                    };
                }
                
                const tasks = await pool.query(
                    `SELECT 
                        COUNT(*) as total,
                        COUNT(CASE WHEN status = 'IN_PROGRESS' THEN 1 END) as in_progress
                     FROM tasks 
                     WHERE assigned_to = ANY($1)
                     AND status != 'COMPLETED'`,
                    [memberIds]
                );
                
                const hours = await pool.query(
                    `SELECT COALESCE(SUM(duration_minutes), 0) as minutes
                     FROM time_entries 
                     WHERE user_id = ANY($1)
                     AND created_at >= DATE_TRUNC('week', CURRENT_DATE)`,
                    [memberIds]
                );
                
                const totalMinutes = parseFloat(hours.rows[0].minutes);
                const capacityMinutes = memberIds.length * 40 * 60;
                
                return {
                    department: dept.department,
                    memberCount: memberIds.length,
                    tasks: {
                        total: parseInt(tasks.rows[0].total),
                        inProgress: parseInt(tasks.rows[0].in_progress)
                    },
                    hoursTracked: Math.round(totalMinutes / 60 * 10) / 10,
                    utilization: Math.min(Math.round((totalMinutes / capacityMinutes) * 100), 100)
                };
            }));
            
            res.json({
                departments: workloadData,
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            logger.error('Get workload by department error:', error);
            res.status(500).json({
                error: 'Failed to get workload by department',
                code: 'DEPARTMENT_WORKLOAD_ERROR'
            });
        }
    }

    // Get workload history
    async getWorkloadHistory(req, res) {
        try {
            // Only CEO and Team Members can access
            if (req.user.role === 'EMPLOYEE') {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            }
            
            const { weeks = 8 } = req.query;
            
            const result = await pool.query(
                `SELECT 
                    DATE_TRUNC('week', created_at) as week,
                    user_id,
                    u.full_name,
                    COUNT(*) as task_count,
                    COALESCE(SUM(duration_minutes), 0) as total_minutes
                 FROM time_entries te
                 LEFT JOIN users u ON te.user_id = u.id
                 WHERE te.created_at >= CURRENT_DATE - INTERVAL '1 week' * $1
                 AND u.role != 'CEO'
                 GROUP BY DATE_TRUNC('week', created_at), user_id, u.full_name
                 ORDER BY week DESC, total_minutes DESC`,
                [parseInt(weeks)]
            );
            
            res.json({
                history: result.rows,
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            logger.error('Get workload history error:', error);
            res.status(500).json({
                error: 'Failed to get workload history',
                code: 'WORKLOAD_HISTORY_ERROR'
            });
        }
    }

    // Get workload recommendations
    async getWorkloadRecommendations(req, res) {
        try {
            // Only CEO and Team Members can access
            if (req.user.role === 'EMPLOYEE') {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            }
            
            const recommendations = [];
            
            // Get overloaded team members
            const overloaded = await pool.query(
                `SELECT u.id, u.full_name, COUNT(t.id) as task_count
                 FROM users u
                 LEFT JOIN tasks t ON t.assigned_to = u.id AND t.status != 'COMPLETED'
                 WHERE u.role != 'CEO' AND u.status = 'ACTIVE'
                 GROUP BY u.id, u.full_name
                 HAVING COUNT(t.id) > 10`
            );
            
            for (const member of overloaded.rows) {
                recommendations.push({
                    type: 'REASSIGN_TASKS',
                    severity: 'HIGH',
                    message: `${member.full_name} has ${member.task_count} active tasks, consider redistributing workload`,
                    userId: member.id,
                    taskCount: member.task_count
                });
            }
            
            // Get low availability
            const lowAvailability = await pool.query(
                `SELECT u.id, u.full_name, 
                        COALESCE(SUM(te.duration_minutes), 0) / 60.0 as hours_tracked
                 FROM users u
                 LEFT JOIN time_entries te ON te.user_id = u.id 
                    AND te.created_at >= DATE_TRUNC('week', CURRENT_DATE)
                 WHERE u.role != 'CEO' AND u.status = 'ACTIVE'
                 GROUP BY u.id, u.full_name
                 HAVING COALESCE(SUM(te.duration_minutes), 0) / 60.0 < 20`
            );
            
            for (const member of lowAvailability.rows) {
                recommendations.push({
                    type: 'LOW_AVAILABILITY',
                    severity: 'MEDIUM',
                    message: `${member.full_name} has only ${member.hours_tracked.toFixed(1)} hours tracked this week`,
                    userId: member.id,
                    hours: member.hours_tracked
                });
            }
            
            res.json({
                recommendations,
                count: recommendations.length,
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            logger.error('Get workload recommendations error:', error);
            res.status(500).json({
                error: 'Failed to get workload recommendations',
                code: 'WORKLOAD_RECOMMENDATIONS_ERROR'
            });
        }
    }
}

module.exports = new WorkloadController();