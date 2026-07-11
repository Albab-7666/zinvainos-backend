const { pool } = require('../config/database');
const { logger } = require('../utils/logger');

class RecycleController {
    // Get deleted items
    async getDeletedItems(req, res) {
        try {
            // Only CEO can access recycle bin
            if (req.user.role !== 'CEO') {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            }
            
            const { module, limit = 100, offset = 0 } = req.query;
            
            let query = `
                SELECT 
                    id, module_type, module_id, 
                    data, deleted_by, deleted_at,
                    (SELECT full_name FROM users WHERE id = deleted_by) as deleted_by_name
                FROM recycle_bin
                WHERE 1=1
            `;
            let values = [];
            let paramIndex = 1;
            
            if (module) {
                query += ` AND module_type = $${paramIndex}`;
                values.push(module);
                paramIndex++;
            }
            
            query += ` ORDER BY deleted_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
            values.push(parseInt(limit), parseInt(offset));
            
            const result = await pool.query(query, values);
            
            // Get count by module
            const counts = await pool.query(
                `SELECT module_type, COUNT(*) as count 
                 FROM recycle_bin 
                 GROUP BY module_type`
            );
            
            res.json({
                items: result.rows,
                counts: counts.rows,
                pagination: {
                    limit: parseInt(limit),
                    offset: parseInt(offset)
                }
            });
            
        } catch (error) {
            logger.error('Get deleted items error:', error);
            res.status(500).json({
                error: 'Failed to get deleted items',
                code: 'GET_DELETED_ITEMS_ERROR'
            });
        }
    }

    // Restore deleted item
    async restoreItem(req, res) {
        try {
            // Only CEO can restore items
            if (req.user.role !== 'CEO') {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            }
            
            const { id } = req.params;
            
            // Get deleted item
            const itemResult = await pool.query(
                'SELECT * FROM recycle_bin WHERE id = $1',
                [id]
            );
            
            if (itemResult.rows.length === 0) {
                return res.status(404).json({
                    error: 'Item not found in recycle bin',
                    code: 'ITEM_NOT_FOUND'
                });
            }
            
            const item = itemResult.rows[0];
            
            // Restore to original table
            const tableName = item.module_type.toLowerCase() + 's';
            const data = item.data;
            
            // Check if table exists
            const tableCheck = await pool.query(
                "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1)",
                [tableName]
            );
            
            if (!tableCheck.rows[0].exists) {
                return res.status(400).json({
                    error: 'Original table not found',
                    code: 'TABLE_NOT_FOUND'
                });
            }
            
            // Restore data
            const columns = Object.keys(data).join(', ');
            const values = Object.values(data);
            const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
            
            await pool.query(
                `INSERT INTO ${tableName} (${columns}) VALUES (${placeholders})
                 ON CONFLICT (id) DO UPDATE SET 
                 ${Object.keys(data).map(key => `${key} = EXCLUDED.${key}`).join(', ')}`,
                values
            );
            
            // Remove from recycle bin
            await pool.query('DELETE FROM recycle_bin WHERE id = $1', [id]);
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'RESTORE_ITEM', 'RECYCLE_BIN', 
                 JSON.stringify({ recycleId: id, moduleType: item.module_type }), req.ip]
            );
            
            res.json({
                message: 'Item restored successfully',
                item: {
                    moduleType: item.module_type,
                    data: item.data
                }
            });
            
        } catch (error) {
            logger.error('Restore item error:', error);
            res.status(500).json({
                error: 'Failed to restore item',
                code: 'RESTORE_ITEM_ERROR'
            });
        }
    }

    // Permanently delete item
    async deletePermanent(req, res) {
        try {
            // Only CEO can permanently delete
            if (req.user.role !== 'CEO') {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            }
            
            const { id } = req.params;
            
            const result = await pool.query(
                'DELETE FROM recycle_bin WHERE id = $1 RETURNING id',
                [id]
            );
            
            if (result.rows.length === 0) {
                return res.status(404).json({
                    error: 'Item not found in recycle bin',
                    code: 'ITEM_NOT_FOUND'
                });
            }
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'PERMANENT_DELETE', 'RECYCLE_BIN', 
                 JSON.stringify({ recycleId: id }), req.ip]
            );
            
            res.json({
                message: 'Item permanently deleted'
            });
            
        } catch (error) {
            logger.error('Permanent delete error:', error);
            res.status(500).json({
                error: 'Failed to permanently delete item',
                code: 'PERMANENT_DELETE_ERROR'
            });
        }
    }

    // Empty recycle bin
    async emptyRecycleBin(req, res) {
        try {
            // Only CEO can empty recycle bin
            if (req.user.role !== 'CEO') {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            }
            
            const { module } = req.query;
            
            let query = 'DELETE FROM recycle_bin';
            let values = [];
            
            if (module) {
                query += ' WHERE module_type = $1';
                values.push(module);
            }
            
            const result = await pool.query(query, values);
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'EMPTY_RECYCLE_BIN', 'RECYCLE_BIN', 
                 JSON.stringify({ module, count: result.rowCount }), req.ip]
            );
            
            res.json({
                message: 'Recycle bin emptied',
                deletedCount: result.rowCount
            });
            
        } catch (error) {
            logger.error('Empty recycle bin error:', error);
            res.status(500).json({
                error: 'Failed to empty recycle bin',
                code: 'EMPTY_RECYCLE_BIN_ERROR'
            });
        }
    }

    // Move to recycle bin (called when items are deleted)
    async moveToRecycleBin(moduleType, moduleId, data, userId) {
        try {
            await pool.query(
                `INSERT INTO recycle_bin (module_type, module_id, data, deleted_by, deleted_at)
                 VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
                [moduleType, moduleId, JSON.stringify(data), userId]
            );
        } catch (error) {
            logger.error('Move to recycle bin error:', error);
        }
    }
}

module.exports = new RecycleController();