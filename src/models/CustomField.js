const { pool } = require('../config/database');

class CustomField {
    static async create({ moduleType, fieldName, fieldType, required, options, defaultValue, createdBy }) {
        const result = await pool.query(
            `INSERT INTO custom_fields (module_type, field_name, field_type, required, options, default_value, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [moduleType, fieldName, fieldType, required, JSON.stringify(options), defaultValue, createdBy]
        );
        return result.rows[0];
    }

    static async findByModule(moduleType) {
        const result = await pool.query(
            'SELECT * FROM custom_fields WHERE module_type = $1 ORDER BY created_at ASC',
            [moduleType]
        );
        return result.rows;
    }

    static async findById(id) {
        const result = await pool.query('SELECT * FROM custom_fields WHERE id = $1', [id]);
        return result.rows[0];
    }

    static async update(id, updates) {
        const fields = [];
        const values = [];
        let paramIndex = 1;

        for (const [key, value] of Object.entries(updates)) {
            if (value !== undefined && value !== null) {
                fields.push(`${key} = $${paramIndex}`);
                values.push(key === 'options' ? JSON.stringify(value) : value);
                paramIndex++;
            }
        }

        if (fields.length === 0) return null;

        values.push(id);
        const query = `
            UPDATE custom_fields 
            SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
            WHERE id = $${paramIndex}
            RETURNING *
        `;
        const result = await pool.query(query, values);
        return result.rows[0];
    }

    static async delete(id) {
        const result = await pool.query('DELETE FROM custom_fields WHERE id = $1 RETURNING id', [id]);
        return result.rows[0];
    }

    static async setValue({ customFieldId, moduleType, moduleId, value }) {
        const result = await pool.query(
            `INSERT INTO custom_field_values (custom_field_id, module_type, module_id, value)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (custom_field_id, module_type, module_id) 
             DO UPDATE SET value = $4, updated_at = CURRENT_TIMESTAMP
             RETURNING *`,
            [customFieldId, moduleType, moduleId, value]
        );
        return result.rows[0];
    }

    static async getValues(moduleType, moduleId) {
        const result = await pool.query(
            `SELECT cfv.*, cf.field_name, cf.field_type, cf.options
             FROM custom_field_values cfv
             JOIN custom_fields cf ON cfv.custom_field_id = cf.id
             WHERE cfv.module_type = $1 AND cfv.module_id = $2`,
            [moduleType, moduleId]
        );
        return result.rows;
    }
}

module.exports = CustomField;