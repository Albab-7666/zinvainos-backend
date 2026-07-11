const { pool } = require('../config/database');
const { logger } = require('../utils/logger');

class AIController {
    // Get AI insights
    async getInsights(req, res) {
        try {
            const insights = [];
            
            // 1. Project completion prediction
            const projects = await pool.query(
                `SELECT p.id, p.name, p.start_date, p.end_date,
                        COUNT(t.id) as total_tasks,
                        COUNT(CASE WHEN t.status = 'COMPLETED' THEN 1 END) as completed_tasks
                 FROM projects p
                 LEFT JOIN tasks t ON t.project_id = p.id
                 WHERE p.status != 'COMPLETED'
                 GROUP BY p.id, p.name, p.start_date, p.end_date`
            );
            
            for (const project of projects.rows) {
                const total = parseInt(project.total_tasks);
                const completed = parseInt(project.completed_tasks);
                const progress = total > 0 ? (completed / total) * 100 : 0;
                
                if (progress > 0 && progress < 100) {
                    const daysSinceStart = Math.floor((new Date() - new Date(project.start_date)) / (1000 * 60 * 60 * 24));
                    const totalDays = Math.floor((new Date(project.end_date) - new Date(project.start_date)) / (1000 * 60 * 60 * 24));
                    const progressRate = daysSinceStart > 0 ? progress / daysSinceStart : 0;
                    const estimatedCompletion = totalDays > 0 ? 
                        Math.round((100 - progress) / (progressRate || 1)) : 
                        'Unknown';
                    
                    insights.push({
                        type: 'PROJECT_FORECAST',
                        severity: progress < 50 && daysSinceStart > totalDays * 0.5 ? 'HIGH' : 'MEDIUM',
                        projectId: project.id,
                        projectName: project.name,
                        progress: Math.round(progress),
                        estimatedCompletionDays: estimatedCompletion,
                        message: `Project "${project.name}" is ${Math.round(progress)}% complete`
                    });
                }
            }
            
            // 2. Productivity trends
            const productivity = await pool.query(
                `SELECT 
                    DATE_TRUNC('week', created_at) as week,
                    COALESCE(SUM(duration_minutes), 0) / 60.0 as total_hours
                 FROM time_entries
                 WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE)
                 GROUP BY DATE_TRUNC('week', created_at)
                 ORDER BY week DESC`
            );
            
            if (productivity.rows.length > 1) {
                const recent = parseFloat(productivity.rows[0].total_hours);
                const previous = parseFloat(productivity.rows[1].total_hours);
                const change = previous > 0 ? ((recent - previous) / previous) * 100 : 0;
                
                insights.push({
                    type: 'PRODUCTIVITY_TREND',
                    severity: change < -20 ? 'HIGH' : change < -10 ? 'MEDIUM' : 'LOW',
                    change: Math.round(change),
                    message: `Productivity ${change > 0 ? 'increased' : 'decreased'} by ${Math.abs(Math.round(change))}%`
                });
            }
            
            // 3. Team morale indicators (based on attendance and leave patterns)
            const morale = await pool.query(
                `SELECT 
                    COUNT(CASE WHEN status = 'ABSENT' THEN 1 END) as absent,
                    COUNT(CASE WHEN status = 'PRESENT' THEN 1 END) as present,
                    COUNT(CASE WHEN status = 'LATE' THEN 1 END) as late
                 FROM attendance
                 WHERE date >= DATE_TRUNC('week', CURRENT_DATE)`
            );
            
            const totalAttendance = parseInt(morale.rows[0].absent) + 
                                  parseInt(morale.rows[0].present) + 
                                  parseInt(morale.rows[0].late);
            
            if (totalAttendance > 0) {
                const absenteeism = (parseInt(morale.rows[0].absent) / totalAttendance) * 100;
                const lateness = (parseInt(morale.rows[0].late) / totalAttendance) * 100;
                
                if (absenteeism > 10) {
                    insights.push({
                        type: 'ATTENDANCE_ALERT',
                        severity: 'HIGH',
                        absenteeism: Math.round(absenteeism),
                        message: `High absenteeism rate of ${Math.round(absenteeism)}% this week`
                    });
                }
                
                if (lateness > 15) {
                    insights.push({
                        type: 'PUNCTUALITY_ALERT',
                        severity: 'MEDIUM',
                        lateness: Math.round(lateness),
                        message: `High lateness rate of ${Math.round(lateness)}% this week`
                    });
                }
            }
            
            // 4. Budget alerts
            const budgetAlerts = await pool.query(
                `SELECT p.id, p.name, p.budget,
                        COALESCE(SUM(t.actual_hours * 50), 0) as actual_cost
                 FROM projects p
                 LEFT JOIN tasks t ON t.project_id = p.id
                 WHERE p.budget IS NOT NULL
                 GROUP BY p.id, p.name, p.budget
                 HAVING COALESCE(SUM(t.actual_hours * 50), 0) > p.budget * 0.7`
            );
            
            for (const alert of budgetAlerts.rows) {
                const utilization = (alert.actual_cost / alert.budget) * 100;
                insights.push({
                    type: 'BUDGET_ALERT',
                    severity: utilization > 85 ? 'HIGH' : 'MEDIUM',
                    projectId: alert.id,
                    projectName: alert.name,
                    utilization: Math.round(utilization),
                    message: `Project "${alert.name}" at ${Math.round(utilization)}% budget utilization`
                });
            }
            
            // Log AI interaction
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'AI_INSIGHTS', 'AI_ASSISTANT', 
                 JSON.stringify({ insightCount: insights.length }), req.ip]
            );
            
            res.json({
                insights,
                count: insights.length,
                highSeverity: insights.filter(i => i.severity === 'HIGH').length,
                generatedAt: new Date().toISOString()
            });
            
        } catch (error) {
            logger.error('Get AI insights error:', error);
            res.status(500).json({
                error: 'Failed to get AI insights',
                code: 'AI_INSIGHTS_ERROR'
            });
        }
    }

    // Get AI recommendations
    async getRecommendations(req, res) {
        try {
            const recommendations = [];
            
            // Task assignment optimization
            const taskAssignment = await pool.query(
                `SELECT u.id, u.full_name, COUNT(t.id) as task_count
                 FROM users u
                 LEFT JOIN tasks t ON t.assigned_to = u.id AND t.status != 'COMPLETED'
                 WHERE u.role != 'CEO' AND u.status = 'ACTIVE'
                 GROUP BY u.id, u.full_name
                 ORDER BY task_count ASC`
            );
            
            if (taskAssignment.rows.length > 1) {
                const minTasks = parseInt(taskAssignment.rows[0].task_count);
                const maxTasks = parseInt(taskAssignment.rows[taskAssignment.rows.length - 1].task_count);
                
                if (maxTasks - minTasks > 5) {
                    recommendations.push({
                        type: 'TASK_REDISTRIBUTION',
                        priority: 'HIGH',
                        suggestion: 'Consider redistributing tasks to balance workload',
                        details: `${taskAssignment.rows[0].full_name} has ${minTasks} tasks, ${taskAssignment.rows[taskAssignment.rows.length - 1].full_name} has ${maxTasks} tasks`
                    });
                }
            }
            
            // Skills optimization (based on task types completed)
            const skills = await pool.query(
                `SELECT assigned_to, task_type, COUNT(*) as count
                 FROM tasks
                 WHERE status = 'COMPLETED'
                 GROUP BY assigned_to, task_type
                 ORDER BY count DESC
                 LIMIT 10`
            );
            
            // Project timeline optimization
            const projectTimeline = await pool.query(
                `SELECT p.id, p.name, 
                        AVG(EXTRACT(EPOCH FROM (t.updated_at - t.created_at))) / 3600 as avg_completion_hours
                 FROM projects p
                 JOIN tasks t ON t.project_id = p.id
                 WHERE t.status = 'COMPLETED'
                 GROUP BY p.id, p.name
                 HAVING AVG(EXTRACT(EPOCH FROM (t.updated_at - t.created_at))) > 24
                 ORDER BY avg_completion_hours DESC
                 LIMIT 5`
            );
            
            for (const project of projectTimeline.rows) {
                recommendations.push({
                    type: 'TIMELINE_OPTIMIZATION',
                    priority: 'MEDIUM',
                    suggestion: `Project "${project.name}" tasks take ${Math.round(project.avg_completion_hours)} hours on average`,
                    details: 'Consider breaking down large tasks or adding more resources'
                });
            }
            
            res.json({
                recommendations,
                count: recommendations.length,
                generatedAt: new Date().toISOString()
            });
            
        } catch (error) {
            logger.error('Get AI recommendations error:', error);
            res.status(500).json({
                error: 'Failed to get AI recommendations',
                code: 'AI_RECOMMENDATIONS_ERROR'
            });
        }
    }

    // Get AI chat response
    async chat(req, res) {
        try {
            const { message } = req.body;
            
            // Simple rule-based responses
            let response = '';
            const lowerMessage = message.toLowerCase();
            
            if (lowerMessage.includes('project') && (lowerMessage.includes('status') || lowerMessage.includes('progress'))) {
                const projects = await pool.query(
                    `SELECT name, status, 
                            (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND status = 'COMPLETED') as completed,
                            (SELECT COUNT(*) FROM tasks WHERE project_id = p.id) as total
                     FROM projects p
                     LIMIT 5`
                );
                
                response = 'Here are the current project statuses:\n';
                for (const project of projects.rows) {
                    const progress = project.total > 0 ? Math.round((project.completed / project.total) * 100) : 0;
                    response += `- ${project.name}: ${project.status} (${progress}% complete)\n`;
                }
            } else if (lowerMessage.includes('overdue') || lowerMessage.includes('delayed')) {
                const overdue = await pool.query(
                    'SELECT COUNT(*) as count FROM tasks WHERE due_date < CURRENT_DATE AND status != $1',
                    ['COMPLETED']
                );
                response = `You have ${overdue.rows[0].count} overdue tasks. Would you like to see them?`;
            } else if (lowerMessage.includes('team') || lowerMessage.includes('members')) {
                const members = await pool.query(
                    'SELECT COUNT(*) as count FROM users WHERE role != $1 AND status = $2',
                    ['CEO', 'ACTIVE']
                );
                response = `You have ${members.rows[0].count} active team members.`;
            } else if (lowerMessage.includes('revenue') || lowerMessage.includes('income')) {
                const revenue = await pool.query(
                    'SELECT COALESCE(SUM(total), 0) as total FROM invoices WHERE status = $1',
                    ['PAID']
                );
                response = `Total revenue from paid invoices: $${parseFloat(revenue.rows[0].total).toFixed(2)}`;
            } else {
                response = "I can help you with project status, team overview, financial summary, and task management. What would you like to know?";
            }
            
            // Log chat interaction
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'AI_CHAT', 'AI_ASSISTANT', 
                 JSON.stringify({ message, response: response.substring(0, 100) }), req.ip]
            );
            
            res.json({
                response,
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            logger.error('AI chat error:', error);
            res.status(500).json({
                error: 'Failed to process chat request',
                code: 'AI_CHAT_ERROR'
            });
        }
    }

    // Get AI analytics
    async getAnalytics(req, res) {
        try {
            const analytics = {
                productivity: {},
                efficiency: {},
                predictions: {}
            };
            
            // Productivity score
            const productivityScore = await pool.query(
                `SELECT 
                    COALESCE(SUM(duration_minutes), 0) / 60.0 as total_hours,
                    COUNT(DISTINCT user_id) as active_users
                 FROM time_entries
                 WHERE created_at >= DATE_TRUNC('week', CURRENT_DATE)`
            );
            
            analytics.productivity = {
                totalHours: Math.round(parseFloat(productivityScore.rows[0].total_hours) * 10) / 10,
                activeUsers: parseInt(productivityScore.rows[0].active_users),
                avgHoursPerUser: productivityScore.rows[0].active_users > 0 ? 
                    Math.round((parseFloat(productivityScore.rows[0].total_hours) / parseInt(productivityScore.rows[0].active_users)) * 10) / 10 : 0
            };
            
            // Efficiency score
            const efficiencyScore = await pool.query(
                `SELECT 
                    (SELECT COUNT(*) FROM tasks WHERE status = 'COMPLETED' AND created_at >= DATE_TRUNC('week', CURRENT_DATE)) as completed_tasks,
                    (SELECT COUNT(*) FROM tasks WHERE created_at >= DATE_TRUNC('week', CURRENT_DATE)) as created_tasks`
            );
            
            const completed = parseInt(efficiencyScore.rows[0].completed_tasks);
            const created = parseInt(efficiencyScore.rows[0].created_tasks);
            analytics.efficiency = {
                completedTasks: completed,
                createdTasks: created,
                completionRate: created > 0 ? Math.round((completed / created) * 100) : 0
            };
            
            // Predictions
            const predictionData = await pool.query(
                `SELECT 
                    DATE_TRUNC('week', created_at) as week,
                    COUNT(*) as tasks
                 FROM tasks
                 WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE)
                 GROUP BY DATE_TRUNC('week', created_at)
                 ORDER BY week DESC
                 LIMIT 4`
            );
            
            if (predictionData.rows.length >= 3) {
                const avgTasks = predictionData.rows.reduce((sum, row) => sum + parseInt(row.tasks), 0) / predictionData.rows.length;
                analytics.predictions = {
                    estimatedTasksNextWeek: Math.round(avgTasks),
                    trend: predictionData.rows[0].tasks > predictionData.rows[1].tasks ? 'INCREASING' : 
                           predictionData.rows[0].tasks < predictionData.rows[1].tasks ? 'DECREASING' : 'STABLE'
                };
            } else {
                analytics.predictions = {
                    estimatedTasksNextWeek: 0,
                    trend: 'INSUFFICIENT_DATA'
                };
            }
            
            res.json({
                analytics,
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            logger.error('Get AI analytics error:', error);
            res.status(500).json({
                error: 'Failed to get AI analytics',
                code: 'AI_ANALYTICS_ERROR'
            });
        }
    }
}

module.exports = new AIController();