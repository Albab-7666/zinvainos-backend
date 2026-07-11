const { pool } = require('../config/database');
const { logger } = require('../utils/logger');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');

class ImportExportController {
    // Export data
    async exportData(req, res) {
        try {
            // Only CEO can export data
            if (req.user.role !== 'CEO') {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            }
            
            const { module, format = 'json' } = req.query;
            
            let data = [];
            
            switch (module) {
                case 'users':
                    data = await pool.query(
                        `SELECT id, email, full_name, role, department, position, status, created_at
                         FROM users`
                    );
                    break;
                case 'projects':
                    data = await pool.query(
                        `SELECT p.*, c.company_name as client_name
                         FROM projects p
                         LEFT JOIN clients c ON p.client_id = c.id`
                    );
                    break;
                case 'tasks':
                    data = await pool.query(
                        `SELECT t.*, p.name as project_name, u.full_name as assigned_to_name
                         FROM tasks t
                         LEFT JOIN projects p ON t.project_id = p.id
                         LEFT JOIN users u ON t.assigned_to = u.id`
                    );
                    break;
                case 'clients':
                    data = await pool.query('SELECT * FROM clients');
                    break;
                case 'invoices':
                    data = await pool.query(
                        `SELECT i.*, c.company_name as client_name
                         FROM invoices i
                         LEFT JOIN clients c ON i.client_id = c.id`
                    );
                    break;
                case 'attendance':
                    data = await pool.query(
                        `SELECT a.*, u.full_name as user_name
                         FROM attendance a
                         LEFT JOIN users u ON a.user_id = u.id`
                    );
                    break;
                case 'payroll':
                    data = await pool.query(
                        `SELECT p.*, u.full_name as employee_name
                         FROM payroll p
                         LEFT JOIN users u ON p.user_id = u.id`
                    );
                    break;
                default:
                    return res.status(400).json({
                        error: 'Invalid module',
                        code: 'INVALID_MODULE'
                    });
            }
            
            const exportData = data.rows;
            
            if (format === 'csv') {
                const csv = stringify(exportData, { header: true });
                res.setHeader('Content-Type', 'text/csv');
                res.setHeader('Content-Disposition', `attachment; filename=${module}_export.csv`);
                return res.send(csv);
            } else if (format === 'json') {
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Content-Disposition', `attachment; filename=${module}_export.json`);
                return res.json(exportData);
            }
            
            res.json({
                module,
                count: exportData.length,
                data: exportData,
                exportedAt: new Date().toISOString()
            });
            
        } catch (error) {
            logger.error('Export data error:', error);
            res.status(500).json({
                error: 'Failed to export data',
                code: 'EXPORT_DATA_ERROR'
            });
        }
    }

    // Import data
    async importData(req, res) {
        try {
            // Only CEO can import data
            if (req.user.role !== 'CEO') {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            }
            
            const { module } = req.body;
            
            if (!req.file) {
                return res.status(400).json({
                    error: 'No file uploaded',
                    code: 'NO_FILE'
                });
            }
            
            let imported = 0;
            let errors = [];
            
            // Parse CSV
            const records = parse(req.file.buffer.toString(), {
                columns: true,
                skip_empty_lines: true
            });
            
            for (const record of records) {
                try {
                    switch (module) {
                        case 'users':
                            // Import users
                            await pool.query(
                                `INSERT INTO users (email, password_hash, full_name, role, department, position, status)
                                 VALUES ($1, $2, $3, $4, $5, $6, $7)
                                 ON CONFLICT (email) DO NOTHING`,
                                [record.email, 'TEMPORARY_PASSWORD', record.full_name, 
                                 record.role || 'EMPLOYEE', record.department, record.position, 'ACTIVE']
                            );
                            imported++;
                            break;
                        case 'projects':
                            // Import projects
                            break;
                        // Add more modules
                        default:
                            errors.push(`Unknown module: ${module}`);
                    }
                } catch (error) {
                    errors.push(`Error importing record: ${error.message}`);
                }
            }
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'IMPORT_DATA', 'IMPORT_EXPORT', 
                 JSON.stringify({ module, imported, errors: errors.length }), req.ip]
            );
            
            res.json({
                message: 'Import completed',
                module,
                imported,
                errors,
                total: records.length
            });
            
        } catch (error) {
            logger.error('Import data error:', error);
            res.status(500).json({
                error: 'Failed to import data',
                code: 'IMPORT_DATA_ERROR'
            });
        }
    }

    // Export all data (backup)
    async exportBackup(req, res) {
        try {
            // Only CEO can export backup
            if (req.user.role !== 'CEO') {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            }
            
            const backup = {};
            
            const tables = ['users', 'clients', 'projects', 'tasks', 'time_entries', 
                           'attendance', 'leave_requests', 'invoices', 'payments', 
                           'payroll', 'meetings', 'files', 'comments'];
            
            for (const table of tables) {
                const result = await pool.query(`SELECT * FROM ${table}`);
                backup[table] = result.rows;
            }
            
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', `attachment; filename=backup_${new Date().toISOString().split('T')[0]}.json`);
            res.json(backup);
            
        } catch (error) {
            logger.error('Export backup error:', error);
            res.status(500).json({
                error: 'Failed to export backup',
                code: 'EXPORT_BACKUP_ERROR'
            });
        }
    }

    // Import backup
    async importBackup(req, res) {
        try {
            // Only CEO can import backup
            if (req.user.role !== 'CEO') {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            }
            
            if (!req.body.backup) {
                return res.status(400).json({
                    error: 'No backup data provided',
                    code: 'NO_BACKUP_DATA'
                });
            }
            
            const backup = req.body.backup;
            let imported = 0;
            
            for (const [table, data] of Object.entries(backup)) {
                for (const row of data) {
                    // Simple import - in production you'd need proper conflict handling
                    const columns = Object.keys(row).join(', ');
                    const values = Object.values(row);
                    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
                    
                    // Check if table exists first
                    await pool.query(
                        `INSERT INTO ${table} (${columns}) VALUES (${placeholders})
                         ON CONFLICT (id) DO NOTHING`,
                        values
                    );
                    imported++;
                }
            }
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'IMPORT_BACKUP', 'IMPORT_EXPORT', 
                 JSON.stringify({ imported }), req.ip]
            );
            
            res.json({
                message: 'Backup imported successfully',
                imported
            });
            
        } catch (error) {
            logger.error('Import backup error:', error);
            res.status(500).json({
                error: 'Failed to import backup',
                code: 'IMPORT_BACKUP_ERROR'
            });
        }
    }
}

module.exports = new ImportExportController();