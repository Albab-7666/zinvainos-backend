const { pool } = require('../config/database');

class Payroll {
    static async create({ userId, periodStart, periodEnd, baseSalary, allowances, deductions, bonus, netPay, notes, createdBy }) {
        const result = await pool.query(
            `INSERT INTO payroll (user_id, period_start, period_end, base_salary, allowances, deductions, bonus, net_pay, notes, created_by, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'PENDING')
             RETURNING *`,
            [userId, periodStart, periodEnd, baseSalary, allowances, deductions, bonus, netPay, notes, createdBy]
        );
        return result.rows[0];
    }

    static async findAll({ userId, periodStart, periodEnd, status, limit = 100, offset = 0 }) {
        let query = 'SELECT * FROM payroll WHERE 1=1';
        let values = [];
        let paramIndex = 1;

        if (userId) {
            query += ` AND user_id = $${paramIndex}`;
            values.push(userId);
            paramIndex++;
        }
        if (periodStart) {
            query += ` AND period_start >= $${paramIndex}`;
            values.push(periodStart);
            paramIndex++;
        }
        if (periodEnd) {
            query += ` AND period_end <= $${paramIndex}`;
            values.push(periodEnd);
            paramIndex++;
        }
        if (status) {
            query += ` AND status = $${paramIndex}`;
            values.push(status);
            paramIndex++;
        }

        query += ` ORDER BY period_end DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        values.push(limit, offset);

        const result = await pool.query(query, values);
        return result.rows;
    }

    static async findById(id) {
        const result = await pool.query(
            `SELECT p.*, u.full_name as employee_name, creator.full_name as created_by_name
             FROM payroll p
             LEFT JOIN users u ON p.user_id = u.id
             LEFT JOIN users creator ON p.created_by = creator.id
             WHERE p.id = $1`,
            [id]
        );
        return result.rows[0];
    }

    static async update(id, updates) {
        const fields = [];
        const values = [];
        let paramIndex = 1;

        for (const [key, value] of Object.entries(updates)) {
            if (value !== undefined && value !== null) {
                fields.push(`${key} = $${paramIndex}`);
                values.push(value);
                paramIndex++;
            }
        }

        if (fields.length === 0) return null;

        values.push(id);
        const query = `
            UPDATE payroll 
            SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
            WHERE id = $${paramIndex}
            RETURNING *
        `;
        const result = await pool.query(query, values);
        return result.rows[0];
    }

    static async process(id, processedBy) {
        const result = await pool.query(
            `UPDATE payroll 
             SET status = 'PROCESSED', processed_by = $1, processed_at = CURRENT_TIMESTAMP
             WHERE id = $2
             RETURNING *`,
            [processedBy, id]
        );
        return result.rows[0];
    }

    static async markAsPaid(id) {
        const result = await pool.query(
            `UPDATE payroll SET status = 'PAID', updated_at = CURRENT_TIMESTAMP
             WHERE id = $1
             RETURNING *`,
            [id]
        );
        return result.rows[0];
    }

    static async getSummary() {
        const result = await pool.query(
            `SELECT 
                COUNT(*) as total_payrolls,
                COALESCE(SUM(net_pay), 0) as total_amount,
                DATE_TRUNC('month', period_end) as month
             FROM payroll
             GROUP BY DATE_TRUNC('month', period_end)
             ORDER BY month DESC
             LIMIT 12`
        );
        return result.rows;
    }
}

module.exports = Payroll;