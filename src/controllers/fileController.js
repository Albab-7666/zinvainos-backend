const { pool } = require('../config/database');
const { logger } = require('../utils/logger');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for file upload
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = process.env.UPLOAD_DIR || './uploads';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10485760 // 10MB default
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            'image/jpeg', 'image/png', 'image/gif', 'image/webp',
            'application/pdf', 'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/zip', 'application/x-zip-compressed',
            'text/plain', 'text/csv'
        ];
        
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('File type not allowed'), false);
        }
    }
}).single('file');

class FileController {
    // Upload file
    async uploadFile(req, res) {
        try {
            upload(req, res, async (err) => {
                if (err) {
                    return res.status(400).json({
                        error: err.message,
                        code: 'UPLOAD_ERROR'
                    });
                }
                
                if (!req.file) {
                    return res.status(400).json({
                        error: 'No file uploaded',
                        code: 'NO_FILE'
                    });
                }
                
                const { moduleType, moduleId } = req.body;
                
                const result = await pool.query(
                    `INSERT INTO files (
                        filename, file_path, file_size, mime_type,
                        module_type, module_id, uploaded_by
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                    RETURNING *`,
                    [req.file.originalname, req.file.path, req.file.size,
                     req.file.mimetype, moduleType, moduleId, req.user.id]
                );
                
                await pool.query(
                    `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                     VALUES ($1, $2, $3, $4, $5)`,
                    [req.user.id, 'UPLOAD_FILE', 'FILE_STORAGE', 
                     JSON.stringify({ fileId: result.rows[0].id, filename: req.file.originalname }), req.ip]
                );
                
                res.status(201).json({
                    message: 'File uploaded successfully',
                    file: result.rows[0]
                });
            });
            
        } catch (error) {
            logger.error('Upload file error:', error);
            res.status(500).json({
                error: 'Failed to upload file',
                code: 'UPLOAD_FILE_ERROR'
            });
        }
    }

    // Get files
    async getFiles(req, res) {
        try {
            const { moduleType, moduleId, limit = 100, offset = 0 } = req.query;
            
            let query = `
                SELECT f.*, 
                       u.full_name as uploaded_by_name
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
            
            // Role-based filtering
            if (req.user.role === 'EMPLOYEE') {
                query += ` AND (f.uploaded_by = $${paramIndex} OR f.module_id IN (
                    SELECT id FROM tasks WHERE assigned_to = $${paramIndex}
                ))`;
                values.push(req.user.id);
                paramIndex++;
            }
            
            query += ` ORDER BY f.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
            values.push(parseInt(limit), parseInt(offset));
            
            const result = await pool.query(query, values);
            
            // Get file URLs
            const files = result.rows.map(file => {
                return {
                    ...file,
                    url: `/api/files/download/${file.id}`,
                    thumbnail: file.mime_type.startsWith('image/') ? `/api/files/thumbnail/${file.id}` : null
                };
            });
            
            res.json({ files });
            
        } catch (error) {
            logger.error('Get files error:', error);
            res.status(500).json({
                error: 'Failed to get files',
                code: 'GET_FILES_ERROR'
            });
        }
    }

    // Download file
    async downloadFile(req, res) {
        try {
            const { id } = req.params;
            
            const result = await pool.query(
                'SELECT * FROM files WHERE id = $1',
                [id]
            );
            
            if (result.rows.length === 0) {
                return res.status(404).json({
                    error: 'File not found',
                    code: 'FILE_NOT_FOUND'
                });
            }
            
            const file = result.rows[0];
            
            // Check access
            if (req.user.role === 'EMPLOYEE') {
                const accessCheck = await pool.query(
                    `SELECT id FROM files 
                     WHERE id = $1 AND (uploaded_by = $2 OR module_id IN (
                         SELECT id FROM tasks WHERE assigned_to = $2
                     ))`,
                    [id, req.user.id]
                );
                
                if (accessCheck.rows.length === 0) {
                    return res.status(403).json({
                        error: 'Access denied',
                        code: 'ACCESS_DENIED'
                    });
                }
            }
            
            // Log download
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'DOWNLOAD_FILE', 'FILE_STORAGE', 
                 JSON.stringify({ fileId: id, filename: file.filename }), req.ip]
            );
            
            res.download(file.file_path, file.filename);
            
        } catch (error) {
            logger.error('Download file error:', error);
            res.status(500).json({
                error: 'Failed to download file',
                code: 'DOWNLOAD_FILE_ERROR'
            });
        }
    }

    // Delete file
    async deleteFile(req, res) {
        try {
            const { id } = req.params;
            
            const result = await pool.query(
                'SELECT * FROM files WHERE id = $1',
                [id]
            );
            
            if (result.rows.length === 0) {
                return res.status(404).json({
                    error: 'File not found',
                    code: 'FILE_NOT_FOUND'
                });
            }
            
            const file = result.rows[0];
            
            // Check permission
            if (file.uploaded_by !== req.user.id && req.user.role !== 'CEO') {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            }
            
            // Delete physical file
            if (fs.existsSync(file.file_path)) {
                fs.unlinkSync(file.file_path);
            }
            
            // Delete from database
            await pool.query('DELETE FROM files WHERE id = $1', [id]);
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'DELETE_FILE', 'FILE_STORAGE', 
                 JSON.stringify({ fileId: id, filename: file.filename }), req.ip]
            );
            
            res.json({
                message: 'File deleted successfully'
            });
            
        } catch (error) {
            logger.error('Delete file error:', error);
            res.status(500).json({
                error: 'Failed to delete file',
                code: 'DELETE_FILE_ERROR'
            });
        }
    }

    // Get file by module
    async getFilesByModule(req, res) {
        try {
            const { moduleType, moduleId } = req.params;
            
            const result = await pool.query(
                `SELECT f.*, u.full_name as uploaded_by_name
                 FROM files f
                 LEFT JOIN users u ON f.uploaded_by = u.id
                 WHERE f.module_type = $1 AND f.module_id = $2
                 ORDER BY f.created_at DESC`,
                [moduleType, moduleId]
            );
            
            res.json({ files: result.rows });
            
        } catch (error) {
            logger.error('Get files by module error:', error);
            res.status(500).json({
                error: 'Failed to get files',
                code: 'GET_FILES_BY_MODULE_ERROR'
            });
        }
    }

    // Get storage usage
    async getStorageUsage(req, res) {
        try {
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
            
            // Get total limit from settings
            const settingsResult = await pool.query(
                "SELECT setting_value FROM system_settings WHERE setting_key = 'storage_limit'"
            );
            
            const totalLimit = settingsResult.rows[0]?.setting_value || 10737418240; // 10GB default
            
            res.json({
                usage: result.rows,
                totalUsed: result.rows.reduce((sum, row) => sum + parseInt(row.total_used), 0),
                totalLimit: parseInt(totalLimit),
                usedPercentage: (result.rows.reduce((sum, row) => sum + parseInt(row.total_used), 0) / totalLimit) * 100
            });
            
        } catch (error) {
            logger.error('Get storage usage error:', error);
            res.status(500).json({
                error: 'Failed to get storage usage',
                code: 'STORAGE_USAGE_ERROR'
            });
        }
    }
}

module.exports = new FileController();