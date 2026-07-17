const { pool } = require('../config/database');

class Invoice {
    static async create({ invoiceNumber, clientId, projectId, issueDate, dueDate, subtotal, tax, total, items, notes, createdBy }) {
        const result = await pool.query(
            `INSERT INTO invoices (invoice_number, client_id, project_id, issue_date, due_date, subtotal, tax, total, items, notes, status, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'DRAFT', $11)
             RETURNING *`,
            [invoiceNumber, clientId, projectId, issueDate, dueDate, subtotal, tax, total, JSON.stringify(items), notes, createdBy]
        );
        return result.rows[0];
    }

    static async findAll({ clientId, projectId, status, startDate, endDate, limit = 100, offset = 0, userId = null, role = null }) {
        let query = `
            SELECT i.*, c.company_name as client_name
            FROM invoices i
            LEFT JOIN clients c ON i.client_id = c.id
            WHERE 1=1
        `;
        let values = [];
        let paramIndex = 1;

        if (clientId) {
            query += ` AND i.client_id = $${paramIndex}`;
            values.push(clientId);
            paramIndex++;
        }
        if (projectId) {
            query += ` AND i.project_id = $${paramIndex}`;
            values.push(projectId);
            paramIndex++;
        }
        if (status) {
            query += ` AND i.status = $${paramIndex}`;
            values.push(status);
            paramIndex++;
        }
        if (startDate) {
            query += ` AND i.issue_date >= $${paramIndex}`;
            values.push(startDate);
            paramIndex++;
        }
        if (endDate) {
            query += ` AND i.issue_date <= $${paramIndex}`;
            values.push(endDate);
            paramIndex++;
        }
        if (role === 'EMPLOYEE') {
            query += ` AND i.created_by = $${paramIndex}`;
            values.push(userId);
            paramIndex++;
        } else if (role === 'TEAM_MEMBER' && userId) {
            query += ` AND i.created_by = $${paramIndex}`;
            values.push(userId);
            paramIndex++;
        }

        query += ` ORDER BY i.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        values.push(limit, offset);

        const result = await pool.query(query, values);
        return result.rows;
    }

    static async findById(id) {
        const result = await pool.query(
            `SELECT i.*, c.company_name as client_name
             FROM invoices i
             LEFT JOIN clients c ON i.client_id = c.id
             WHERE i.id = $1`,
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
            UPDATE invoices 
            SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
            WHERE id = $${paramIndex}
            RETURNING *
        `;
        const result = await pool.query(query, values);
        return result.rows[0];
    }

    static async send(id) {
        const result = await pool.query(
            `UPDATE invoices 
             SET status = 'SENT', sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
             WHERE id = $1
             RETURNING *`,
            [id]
        );
        return result.rows[0];
    }

    static async markAsPaid(id) {
        const result = await pool.query(
            `UPDATE invoices 
             SET status = 'PAID', updated_at = CURRENT_TIMESTAMP
             WHERE id = $1
             RETURNING *`,
            [id]
        );
        return result.rows[0];
    }

    static async delete(id) {
        const result = await pool.query('DELETE FROM invoices WHERE id = $1 RETURNING id', [id]);
        return result.rows[0];
    }

    static async getStats() {
        const result = await pool.query(
            `SELECT 
                COUNT(*) as total_invoices,
                COALESCE(SUM(total), 0) as total_amount,
                COALESCE(SUM(CASE WHEN status = 'PAID' THEN total ELSE 0 END), 0) as paid_amount,
                COUNT(CASE WHEN status = 'PAID' THEN 1 END) as paid_count,
                COUNT(CASE WHEN status = 'OVERDUE' THEN 1 END) as overdue_count
             FROM invoices`
        );
        return result.rows[0];
    }
}

module.exports = Invoice;