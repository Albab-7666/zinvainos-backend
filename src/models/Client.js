const { pool } = require('../config/database');

class Client {
    static async create({ companyName, contactName, email, phone, address, industry, notes, createdBy }) {
        const result = await pool.query(
            `INSERT INTO clients (company_name, contact_name, email, phone, address, industry, notes, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING *`,
            [companyName, contactName, email, phone, address, industry, notes, createdBy]
        );
        return result.rows[0];
    }

    static async findAll({ limit = 100, offset = 0, search = null, userId = null, role = null }) {
        let query = `
            SELECT c.*, 
                   (SELECT COUNT(*) FROM projects WHERE client_id = c.id) as project_count
            FROM clients c
            WHERE 1=1
        `;
        let values = [];
        let paramIndex = 1;

        if (search) {
            query += ` AND (c.company_name ILIKE $${paramIndex} OR c.contact_name ILIKE $${paramIndex} OR c.email ILIKE $${paramIndex})`;
            values.push(`%${search}%`);
            paramIndex++;
        }

        if (role !== 'CEO' && userId) {
            query += ` AND (c.created_by = $${paramIndex} OR c.assigned_to = $${paramIndex})`;
            values.push(userId);
            paramIndex++;
        }

        query += ` ORDER BY c.company_name ASC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        values.push(limit, offset);

        const result = await pool.query(query, values);
        return result.rows;
    }

    static async findById(id) {
        const result = await pool.query(
            `SELECT c.*, 
                    u.full_name as assigned_to_name,
                    creator.full_name as created_by_name
             FROM clients c
             LEFT JOIN users u ON c.assigned_to = u.id
             LEFT JOIN users creator ON c.created_by = creator.id
             WHERE c.id = $1`,
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
            UPDATE clients 
            SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
            WHERE id = $${paramIndex}
            RETURNING *
        `;
        const result = await pool.query(query, values);
        return result.rows[0];
    }

    static async delete(id) {
        const result = await pool.query('DELETE FROM clients WHERE id = $1 RETURNING id', [id]);
        return result.rows[0];
    }

    static async assign(id, assignedTo) {
        const result = await pool.query(
            `UPDATE clients 
             SET assigned_to = $1, updated_at = CURRENT_TIMESTAMP
             WHERE id = $2
             RETURNING *`,
            [assignedTo, id]
        );
        return result.rows[0];
    }
}

module.exports = Client;