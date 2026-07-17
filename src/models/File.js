const { pool } = require('../config/database');

class File {
    static async create({ filename, filePath, fileSize, mimeType, moduleType, moduleId, uploadedBy }) {
        const result = await pool.query(
            `INSERT INTO files (filename, file_path, file_size, mime_type, module_type, module_id, uploaded_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [filename, filePath, fileSize, mimeType, moduleType, moduleId, uploadedBy]
        );
        return result.rows[0];
    }

    static async findById(id) {
        const result = await pool.query('SELECT * FROM files WHERE id = $1', [id]);
        return result.rows[0];
    }

    static async findByModule(moduleType, moduleId) {
        const result = await pool.query(
            `SELECT f.*, u.full_name as uploaded_by_name
             FROM files f
             LEFT JOIN users u ON f.uploaded_by = u.id
             WHERE f.module_type = $1 AND f.module_id = $2
             ORDER BY f.created_at DESC`,
            [moduleType, moduleId]
        );
        return result.rows;
    }

    static async findAll({ moduleType, moduleId, limit = 100, offset = 0, userId = null, role = null }) {
        let query = `
            SELECT f.*, u.full_name as uploaded_by_name
            FROM files f
            LEFT JOIN users u ON f.uploaded_by = u.id
            WHERE 1=1
        `;
        let values = [];
        let paramIndex = 1;

        if (moduleType) {
            query += ` AND f.module_type = $${paramIndex}`;
            values.push(moduleType);
            paramIndex++;
        }
        if (moduleId) {
            query += ` AND f.module_id = $${paramIndex}`;
            values.push(moduleId);
            paramIndex++;
        }
        if (role === 'EMPLOYEE' && userId) {
            query += ` AND (f.uploaded_by = $${paramIndex} OR f.module_id IN (
                SELECT id FROM tasks WHERE assigned_to = $${paramIndex}
            ))`;
            values.push(userId);
            paramIndex++;
        }

        query += ` ORDER BY f.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        values.push(limit, offset);

        const result = await pool.query(query, values);
        return result.rows;
    }

    static async delete(id) {
        const result = await pool.query('DELETE FROM files WHERE id = $1 RETURNING id', [id]);
        return result.rows[0];
    }

    static async getStorageUsage() {
        const result = await pool.query(
            `SELECT 
                COALESCE(SUM(file_size), 0) as total_used,
                COUNT(*) as total_files,
                module_type,
                COUNT(*) as file_count,
                COALESCE(SUM(file_size), 0) as module_size
             FROM files
             GROUP BY module_type`
        );
        return result.rows;
    }
}

module.exports = File;