const { pool } = require('../config/database');
const { logger } = require('../utils/logger');

class CustomFieldController {
    // Create custom field
    async createCustomField(req, res) {
        try {
            // Only CEO can create custom fields
            if (req.user.role !== 'CEO') {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            }
            
            const { 
                moduleType, fieldName, fieldType, 
                required = false, options = [], defaultValue = null
            } = req.body;
            
            const result = await pool.query(
                `INSERT INTO custom_fields (
                    module_type, field_name, field_type, 
                    required, options, default_value, created_by
                ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING *`,
                [moduleType, fieldName, fieldType, required, 
                 JSON.stringify(options), defaultValue, req.user.id]
            );
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'CREATE_CUSTOM_FIELD', 'CUSTOM_FIELDS', 
                 JSON.stringify({ fieldId: result.rows[0].id, fieldName }), req.ip]
            );
            
            res.status(201).json({
                message: 'Custom field created',
                field: result.rows[0]
            });
            
        } catch (error) {
            logger.error('Create custom field error:', error);
            res.status(500).json({
                error: 'Failed to create custom field',
                code: 'CREATE_CUSTOM_FIELD_ERROR'
            });
        }
    }

    // Get custom fields
    async getCustomFields(req, res) {
        try {
            // Only CEO can access custom fields
            if (req.user.role !== 'CEO') {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            }
            
            const { moduleType } = req.query;
            
            let query = `
                SELECT cf.*, u.full_name as created_by_name
                FROM custom_fields cf
                LEFT JOIN users u ON cf.created_by = u.id
                WHERE 1=1
            `;
            let values = [];
            let paramIndex = 1;
            
            if (moduleType) {
                query += ` AND cf.module_type = $${paramIndex}`;
                values.push(moduleType);
                paramIndex++;
            }
            
            query += ` ORDER BY cf.created_at DESC`;
            
            const result = await pool.query(query, values);
            res.json({ fields: result.rows });
            
        } catch (error) {
            logger.error('Get custom fields error:', error);
            res.status(500).json({
                error: 'Failed to get custom fields',
                code: 'GET_CUSTOM_FIELDS_ERROR'
            });
        }
    }

    // Update custom field
    async updateCustomField(req, res) {
        try {
            // Only CEO can update custom fields
            if (req.user.role !== 'CEO') {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            }
            
            const { id } = req.params;
            const updates = req.body;
            
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
            
            if (fields.length === 0) {
                return res.status(400).json({
                    error: 'No fields to update',
                    code: 'NO_UPDATES'
                });
            }
            
            values.push(id);
            const query = `
                UPDATE custom_fields 
                SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
                WHERE id = $${paramIndex}
                RETURNING *
            `;
            
            const result = await pool.query(query, values);
            
            if (result.rows.length === 0) {
                return res.status(404).json({
                    error: 'Custom field not found',
                    code: 'CUSTOM_FIELD_NOT_FOUND'
                });
            }
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'UPDATE_CUSTOM_FIELD', 'CUSTOM_FIELDS', 
                 JSON.stringify({ fieldId: id, updates }), req.ip]
            );
            
            res.json({
                message: 'Custom field updated',
                field: result.rows[0]
            });
            
        } catch (error) {
            logger.error('Update custom field error:', error);
            res.status(500).json({
                error: 'Failed to update custom field',
                code: 'UPDATE_CUSTOM_FIELD_ERROR'
            });
        }
    }

    // Delete custom field
    async deleteCustomField(req, res) {
        try {
            // Only CEO can delete custom fields
            if (req.user.role !== 'CEO') {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            }
            
            const { id } = req.params;
            
            const result = await pool.query(
                'DELETE FROM custom_fields WHERE id = $1 RETURNING id',
                [id]
            );
            
            if (result.rows.length === 0) {
                return res.status(404).json({
                    error: 'Custom field not found',
                    code: 'CUSTOM_FIELD_NOT_FOUND'
                });
            }
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'DELETE_CUSTOM_FIELD', 'CUSTOM_FIELDS', 
                 JSON.stringify({ fieldId: id }), req.ip]
            );
            
            res.json({
                message: 'Custom field deleted'
            });
            
        } catch (error) {
            logger.error('Delete custom field error:', error);
            res.status(500).json({
                error: 'Failed to delete custom field',
                code: 'DELETE_CUSTOM_FIELD_ERROR'
            });
        }
    }

    // Get custom field values for module
    async getCustomFieldValues(req, res) {
        try {
            const { moduleType, moduleId } = req.params;
            
            const result = await pool.query(
                `SELECT cfv.*, cf.field_name, cf.field_type, cf.options
                 FROM custom_field_values cfv
                 JOIN custom_fields cf ON cfv.custom_field_id = cf.id
                 WHERE cfv.module_type = $1 AND cfv.module_id = $2`,
                [moduleType, moduleId]
            );
            
            res.json({ values: result.rows });
            
        } catch (error) {
            logger.error('Get custom field values error:', error);
            res.status(500).json({
                error: 'Failed to get custom field values',
                code: 'GET_CUSTOM_FIELD_VALUES_ERROR'
            });
        }
    }

    // Set custom field value
    async setCustomFieldValue(req, res) {
        try {
            const { moduleType, moduleId } = req.params;
            const { customFieldId, value } = req.body;
            
            const result = await pool.query(
                `INSERT INTO custom_field_values (
                    custom_field_id, module_type, module_id, value
                ) VALUES ($1, $2, $3, $4)
                ON CONFLICT (custom_field_id, module_type, module_id) 
                DO UPDATE SET value = $4, updated_at = CURRENT_TIMESTAMP
                RETURNING *`,
                [customFieldId, moduleType, moduleId, value]
            );
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'SET_CUSTOM_FIELD_VALUE', 'CUSTOM_FIELDS', 
                 JSON.stringify({ customFieldId, moduleType, moduleId }), req.ip]
            );
            
            res.json({
                message: 'Custom field value set',
                value: result.rows[0]
            });
            
        } catch (error) {
            logger.error('Set custom field value error:', error);
            res.status(500).json({
                error: 'Failed to set custom field value',
                code: 'SET_CUSTOM_FIELD_VALUE_ERROR'
            });
        }
    }
}

module.exports = new CustomFieldController();