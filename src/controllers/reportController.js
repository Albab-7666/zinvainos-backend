const { pool } = require('../config/database');
const { logger } = require('../utils/logger');

class ReportController {
    // Generate project report
    async getProjectReport(req, res) {
        try {
            const { projectId } = req.params;
            
            const projectResult = await pool.query(
                `SELECT p.*, 
                        c.company_name as client_name,
                        u.full_name as assigned_to_name
                 FROM projects p
                 LEFT JOIN clients c ON p.client_id = c.id
                 LEFT JOIN users u ON p.assigned_to = u.id
                 WHERE p.id = $1`,
                [projectId]
            );
            
            if (projectResult.rows.length === 0) {
                return res.status(404).json({
                    error: 'Project not found',
                    code: 'PROJECT_NOT_FOUND'
                });
            }
            
            const project = projectResult.rows[0];
            
            // Get task statistics
            const taskStats = await pool.query(
                `SELECT 
                    COUNT(*) as total_tasks,
                    COUNT(CASE WHEN status = 'TODO' THEN 1 END) as todo,
                    COUNT(CASE WHEN status = 'IN_PROGRESS' THEN 1 END) as in_progress,
                    COUNT(CASE WHEN status = 'REVIEW' THEN 1 END) as review,
                    COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) as completed,
                    COUNT(CASE WHEN status = 'BLOCKED' THEN 1 END) as blocked,
                    COALESCE(SUM(estimated_hours), 0) as total_estimated_hours,
                    COALESCE(SUM(actual_hours), 0) as total_actual_hours
                 FROM tasks
                 WHERE project_id = $1`,
                [projectId]
            );
            
            // Get team members
            const teamMembers = await pool.query(
                `SELECT DISTINCT u.id, u.full_name, u.email, u.role
                 FROM users u
                 JOIN tasks t ON t.assigned_to = u.id
                 WHERE t.project_id = $1`,
                [projectId]
            );
            
            // Get timeline data
            const timeline = await pool.query(
                `SELECT 
                    DATE_TRUNC('day', created_at) as date,
                    COUNT(*) as tasks_created,
                    COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) as tasks_completed
                 FROM tasks
                 WHERE project_id = $1
                 GROUP BY DATE_TRUNC('day', created_at)
                 ORDER BY date DESC
                 LIMIT 30`,
                [projectId]
            );
            
            // Calculate progress
            const total = parseInt(taskStats.rows[0].total_tasks);
            const completed = parseInt(taskStats.rows[0].completed);
            const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
            
            res.json({
                project,
                summary: {
                    ...taskStats.rows[0],
                    progress,
                    teamSize: teamMembers.rows.length
                },
                teamMembers: teamMembers.rows,
                timeline: timeline.rows
            });
            
        } catch (error) {
            logger.error('Get project report error:', error);
            res.status(500).json({
                error: 'Failed to generate project report',
                code: 'PROJECT_REPORT_ERROR'
            });
        }
    }

    // Generate finance report
    async getFinanceReport(req, res) {
        try {
            // Only CEO can access finance reports
            if (req.user.role !== 'CEO') {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            }
            
            const { period = 'month' } = req.query;
            
            let dateTrunc;
            if (period === 'quarter') {
                dateTrunc = "DATE_TRUNC('quarter', issue_date)";
            } else if (period === 'year') {
                dateTrunc = "DATE_TRUNC('year', issue_date)";
            } else {
                dateTrunc = "DATE_TRUNC('month', issue_date)";
            }
            
            // Revenue by period
            const revenue = await pool.query(
                `SELECT 
                    ${dateTrunc} as period,
                    COUNT(*) as invoice_count,
                    COALESCE(SUM(total), 0) as total_revenue,
                    COALESCE(SUM(CASE WHEN status = 'PAID' THEN total ELSE 0 END), 0) as collected_revenue
                 FROM invoices
                 GROUP BY period
                 ORDER BY period DESC
                 LIMIT 12`
            );
            
            // Revenue by client
            const byClient = await pool.query(
                `SELECT 
                    c.company_name,
                    COUNT(i.id) as invoice_count,
                    COALESCE(SUM(i.total), 0) as total_revenue
                 FROM invoices i
                 LEFT JOIN clients c ON i.client_id = c.id
                 WHERE i.status = 'PAID'
                 GROUP BY c.company_name
                 ORDER BY total_revenue DESC
                 LIMIT 10`
            );
            
            // Revenue by project
            const byProject = await pool.query(
                `SELECT 
                    p.name as project_name,
                    COUNT(i.id) as invoice_count,
                    COALESCE(SUM(i.total), 0) as total_revenue
                 FROM invoices i
                 LEFT JOIN projects p ON i.project_id = p.id
                 WHERE i.status = 'PAID' AND i.project_id IS NOT NULL
                 GROUP BY p.name
                 ORDER BY total_revenue DESC
                 LIMIT 10`
            );
            
            // Monthly trend
            const trend = await pool.query(
                `SELECT 
                    DATE_TRUNC('month', issue_date) as month,
                    COALESCE(SUM(total), 0) as revenue,
                    COUNT(*) as invoices
                 FROM invoices
                 WHERE issue_date >= DATE_TRUNC('year', CURRENT_DATE - INTERVAL '1 year')
                 GROUP BY DATE_TRUNC('month', issue_date)
                 ORDER BY month ASC`
            );
            
            res.json({
                period,
                summary: {
                    totalRevenue: revenue.rows.reduce((sum, r) => sum + parseFloat(r.total_revenue), 0),
                    collectedRevenue: revenue.rows.reduce((sum, r) => sum + parseFloat(r.collected_revenue), 0),
                    totalInvoices: revenue.rows.reduce((sum, r) => sum + parseInt(r.invoice_count), 0)
                },
                revenueByPeriod: revenue.rows,
                revenueByClient: byClient.rows,
                revenueByProject: byProject.rows,
                monthlyTrend: trend.rows
            });
            
        } catch (error) {
            logger.error('Get finance report error:', error);
            res.status(500).json({
                error: 'Failed to generate finance report',
                code: 'FINANCE_REPORT_ERROR'
            });
        }
    }

    // Generate productivity report
    async getProductivityReport(req, res) {
        try {
            const { period = 'month', userId } = req.query;
            
            let userFilter = '';
            let values = [];
            let paramIndex = 1;
            
            if (userId) {
                userFilter = `AND te.user_id = $${paramIndex}`;
                values.push(userId);
                paramIndex++;
            } else if (req.user.role === 'EMPLOYEE') {
                userFilter = `AND te.user_id = $${paramIndex}`;
                values.push(req.user.id);
                paramIndex++;
            }
            
            // Time tracking summary
            const timeSummary = await pool.query(
                `SELECT 
                    u.id as user_id,
                    u.full_name as user_name,
                    COUNT(DISTINCT te.task_id) as tasks_worked_on,
                    COALESCE(SUM(te.duration_minutes), 0) as total_minutes,
                    COALESCE(AVG(te.duration_minutes), 0) as avg_task_time
                 FROM time_entries te
                 LEFT JOIN users u ON te.user_id = u.id
                 WHERE te.end_time IS NOT NULL
                 ${userFilter}
                 GROUP BY u.id, u.full_name
                 ORDER BY total_minutes DESC`,
                values
            );
            
            // Task completion rate
            const taskCompletion = await pool.query(
                `SELECT 
                    COUNT(*) as total_tasks,
                    COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) as completed_tasks,
                    COUNT(CASE WHEN status = 'IN_PROGRESS' THEN 1 END) as in_progress_tasks,
                    COUNT(CASE WHEN status = 'BLOCKED' THEN 1 END) as blocked_tasks
                 FROM tasks
                 WHERE 1=1 ${userId ? `AND assigned_to = $${paramIndex}` : ''}`,
                userId ? [userId] : []
            );
            
            // Efficiency score (tasks completed vs time spent)
            const efficiency = await pool.query(
                `SELECT 
                    u.id as user_id,
                    u.full_name as user_name,
                    COUNT(DISTINCT t.id) as completed_tasks,
                    COALESCE(SUM(te.duration_minutes), 0) as total_time_minutes,
                    CASE 
                        WHEN COALESCE(SUM(te.duration_minutes), 0) > 0 
                        THEN COUNT(DISTINCT t.id) / (SUM(te.duration_minutes) / 60.0)
                        ELSE 0
                    END as tasks_per_hour
                 FROM users u
                 LEFT JOIN tasks t ON t.assigned_to = u.id AND t.status = 'COMPLETED'
                 LEFT JOIN time_entries te ON te.task_id = t.id
                 WHERE u.role != 'CEO'
                 ${userId ? `AND u.id = $${paramIndex}` : ''}
                 GROUP BY u.id, u.full_name
                 HAVING COUNT(DISTINCT t.id) > 0
                 ORDER BY tasks_per_hour DESC`,
                userId ? [userId] : []
            );
            
            res.json({
                period,
                timeSummary: timeSummary.rows,
                taskCompletion: taskCompletion.rows[0],
                efficiency: efficiency.rows,
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            logger.error('Get productivity report error:', error);
            res.status(500).json({
                error: 'Failed to generate productivity report',
                code: 'PRODUCTIVITY_REPORT_ERROR'
            });
        }
    }

    // Generate attendance report
    async getAttendanceReport(req, res) {
        try {
            const { period = 'month', userId } = req.query;
            
            let userFilter = '';
            let values = [];
            let paramIndex = 1;
            
            if (userId) {
                userFilter = `AND a.user_id = $${paramIndex}`;
                values.push(userId);
                paramIndex++;
            } else if (req.user.role === 'EMPLOYEE') {
                userFilter = `AND a.user_id = $${paramIndex}`;
                values.push(req.user.id);
                paramIndex++;
            }
            
            const result = await pool.query(
                `SELECT 
                    u.id as user_id,
                    u.full_name as user_name,
                    COUNT(*) as total_days,
                    COUNT(CASE WHEN a.status = 'PRESENT' THEN 1 END) as present_days,
                    COUNT(CASE WHEN a.status = 'ABSENT' THEN 1 END) as absent_days,
                    COUNT(CASE WHEN a.status = 'LATE' THEN 1 END) as late_days,
                    COALESCE(SUM(a.overtime_minutes), 0) as total_overtime_minutes,
                    CASE 
                        WHEN COUNT(*) > 0 
                        THEN (COUNT(CASE WHEN a.status = 'PRESENT' THEN 1 END) * 100.0 / COUNT(*))
                        ELSE 0 
                    END as attendance_rate
                 FROM attendance a
                 LEFT JOIN users u ON a.user_id = u.id
                 WHERE a.date >= DATE_TRUNC($1, CURRENT_DATE)
                 ${userFilter}
                 GROUP BY u.id, u.full_name
                 ORDER BY attendance_rate DESC`,
                [period, ...values]
            );
            
            res.json({
                period,
                report: result.rows,
                summary: {
                    totalEmployees: result.rows.length,
                    avgAttendanceRate: result.rows.reduce((sum, r) => sum + parseFloat(r.attendance_rate), 0) / (result.rows.length || 1),
                    totalOvertimeHours: result.rows.reduce((sum, r) => sum + parseFloat(r.total_overtime_minutes), 0) / 60
                },
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            logger.error('Get attendance report error:', error);
            res.status(500).json({
                error: 'Failed to generate attendance report',
                code: 'ATTENDANCE_REPORT_ERROR'
            });
        }
    }

    // Generate custom report
    async getCustomReport(req, res) {
        try {
            const { 
                modules, dateRange, groupBy, metrics 
            } = req.body;
            
            // Build custom report based on parameters
            const report = {};
            
            for (const module of modules) {
                switch (module) {
                    case 'tasks':
                        // Task report
                        break;
                    case 'projects':
                        // Project report
                        break;
                    case 'clients':
                        // Client report
                        break;
                    case 'finance':
                        // Finance report
                        break;
                    case 'attendance':
                        // Attendance report
                        break;
                    // Add more modules
                }
            }
            
            res.json({
                report,
                generatedAt: new Date().toISOString()
            });
            
        } catch (error) {
            logger.error('Get custom report error:', error);
            res.status(500).json({
                error: 'Failed to generate custom report',
                code: 'CUSTOM_REPORT_ERROR'
            });
        }
    }

    // Export report
    async exportReport(req, res) {
        try {
            const { reportType, format = 'json' } = req.params;
            
            // Generate report data based on type
            let data = {};
            
            switch (reportType) {
                case 'project':
                    data = await this.getProjectReportData(req);
                    break;
                case 'finance':
                    data = await this.getFinanceReportData(req);
                    break;
                case 'productivity':
                    data = await this.getProductivityReportData(req);
                    break;
                default:
                    return res.status(400).json({
                        error: 'Invalid report type',
                        code: 'INVALID_REPORT_TYPE'
                    });
            }
            
            // Format export
            if (format === 'csv') {
                // Convert to CSV
                const csv = this.convertToCSV(data);
                res.setHeader('Content-Type', 'text/csv');
                res.setHeader('Content-Disposition', `attachment; filename=${reportType}_report.csv`);
                return res.send(csv);
            } else if (format === 'pdf') {
                // PDF generation would require a library like pdfkit
                // For now, return JSON
                res.json(data);
            } else {
                res.json(data);
            }
            
        } catch (error) {
            logger.error('Export report error:', error);
            res.status(500).json({
                error: 'Failed to export report',
                code: 'EXPORT_REPORT_ERROR'
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
}

module.exports = new ReportController();