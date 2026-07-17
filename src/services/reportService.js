const { pool } = require('../config/database');

class ReportService {
    async getProjectReport(projectId) {
        const project = await pool.query(
            `SELECT p.*, c.company_name as client_name
             FROM projects p
             LEFT JOIN clients c ON p.client_id = c.id
             WHERE p.id = $1`,
            [projectId]
        );

        if (project.rows.length === 0) {
            return null;
        }

        const tasks = await pool.query(
            `SELECT 
                COUNT(*) as total_tasks,
                COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) as completed_tasks,
                COUNT(CASE WHEN status = 'IN_PROGRESS' THEN 1 END) as in_progress_tasks,
                COALESCE(SUM(estimated_hours), 0) as total_estimated_hours,
                COALESCE(SUM(actual_hours), 0) as total_actual_hours
             FROM tasks
             WHERE project_id = $1`,
            [projectId]
        );

        const team = await pool.query(
            `SELECT DISTINCT u.id, u.full_name, u.role
             FROM users u
             JOIN tasks t ON t.assigned_to = u.id
             WHERE t.project_id = $1`,
            [projectId]
        );

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

        return {
            project: project.rows[0],
            summary: tasks.rows[0],
            team: team.rows,
            timeline: timeline.rows
        };
    }

    async getFinanceReport(period = 'month') {
        let dateTrunc;
        if (period === 'quarter') {
            dateTrunc = "DATE_TRUNC('quarter', issue_date)";
        } else if (period === 'year') {
            dateTrunc = "DATE_TRUNC('year', issue_date)";
        } else {
            dateTrunc = "DATE_TRUNC('month', issue_date)";
        }

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

        return {
            revenueByPeriod: revenue.rows,
            revenueByClient: byClient.rows
        };
    }

    async getProductivityReport(userId = null, period = 'month') {
        let userFilter = '';
        let values = [];
        let paramIndex = 1;

        if (userId) {
            userFilter = `AND te.user_id = $${paramIndex}`;
            values.push(userId);
            paramIndex++;
        }

        const timeSummary = await pool.query(
            `SELECT 
                u.id as user_id,
                u.full_name as user_name,
                COUNT(DISTINCT te.task_id) as tasks_worked_on,
                COALESCE(SUM(te.duration_minutes), 0) as total_minutes
             FROM time_entries te
             LEFT JOIN users u ON te.user_id = u.id
             WHERE te.end_time IS NOT NULL
             ${userFilter}
             GROUP BY u.id, u.full_name
             ORDER BY total_minutes DESC`,
            values
        );

        const taskCompletion = await pool.query(
            `SELECT 
                COUNT(*) as total_tasks,
                COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) as completed_tasks
             FROM tasks
             WHERE 1=1 ${userId ? `AND assigned_to = $${paramIndex-1}` : ''}`
        );

        return {
            timeSummary: timeSummary.rows,
            taskCompletion: taskCompletion.rows[0]
        };
    }

    async getAttendanceReport(userId = null, period = 'month') {
        let userFilter = '';
        let values = [];
        let paramIndex = 1;

        if (userId) {
            userFilter = `AND a.user_id = $${paramIndex}`;
            values.push(userId);
            paramIndex++;
        }

        const result = await pool.query(
            `SELECT 
                u.id as user_id,
                u.full_name as user_name,
                COUNT(*) as total_days,
                COUNT(CASE WHEN a.status = 'PRESENT' THEN 1 END) as present_days,
                COUNT(CASE WHEN a.status = 'ABSENT' THEN 1 END) as absent_days,
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

        return result.rows;
    }

    async exportReport(reportType, format = 'json') {
        let data;
        switch (reportType) {
            case 'project':
                data = await this.getProjectReport();
                break;
            case 'finance':
                data = await this.getFinanceReport();
                break;
            case 'productivity':
                data = await this.getProductivityReport();
                break;
            case 'attendance':
                data = await this.getAttendanceReport();
                break;
            default:
                throw new Error('Invalid report type');
        }

        if (format === 'csv') {
            return this.convertToCSV(data);
        }

        return data;
    }

    convertToCSV(data) {
        if (!data || !data.length) return '';
        const headers = Object.keys(data[0]);
        const rows = data.map(item => 
            headers.map(header => JSON.stringify(item[header] || '')).join(',')
        );
        return [headers.join(','), ...rows].join('\n');
    }
}

module.exports = new ReportService();