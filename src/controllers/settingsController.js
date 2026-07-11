const { pool } = require('../config/database');
const { logger } = require('../utils/logger');

class SettingsController {
    // Get company settings
    async getCompanySettings(req, res) {
        try {
            // Only CEO can access settings
            if (req.user.role !== 'CEO') {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            }
            
            const result = await pool.query(
                'SELECT * FROM company_settings LIMIT 1'
            );
            
            if (result.rows.length === 0) {
                // Return default settings
                return res.json({
                    settings: {
                        companyName: 'Zinvain Studios',
                        companyEmail: 'info@zinvain.com',
                        companyPhone: '',
                        companyAddress: '',
                        companyLogo: null,
                        timezone: 'UTC',
                        dateFormat: 'YYYY-MM-DD',
                        currency: 'USD',
                        fiscalYearStart: '2024-01-01',
                        leavePolicy: {
                            annualLeave: 20,
                            sickLeave: 10,
                            personalLeave: 5
                        },
                        workingHours: {
                            start: '09:00',
                            end: '18:00',
                            days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
                        },
                        notifications: {
                            emailNotifications: true,
                            pushNotifications: true
                        }
                    }
                });
            }
            
            res.json({ settings: result.rows[0] });
            
        } catch (error) {
            logger.error('Get company settings error:', error);
            res.status(500).json({
                error: 'Failed to get company settings',
                code: 'GET_SETTINGS_ERROR'
            });
        }
    }

    // Update company settings
    async updateCompanySettings(req, res) {
        try {
            // Only CEO can update settings
            if (req.user.role !== 'CEO') {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            }
            
            const settings = req.body;
            
            // Check if settings exist
            const checkResult = await pool.query(
                'SELECT id FROM company_settings LIMIT 1'
            );
            
            let result;
            if (checkResult.rows.length === 0) {
                result = await pool.query(
                    `INSERT INTO company_settings (settings, updated_by)
                     VALUES ($1, $2)
                     RETURNING *`,
                    [JSON.stringify(settings), req.user.id]
                );
            } else {
                result = await pool.query(
                    `UPDATE company_settings 
                     SET settings = $1, updated_by = $2, updated_at = CURRENT_TIMESTAMP
                     WHERE id = $3
                     RETURNING *`,
                    [JSON.stringify(settings), req.user.id, checkResult.rows[0].id]
                );
            }
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'UPDATE_COMPANY_SETTINGS', 'SETTINGS', 
                 JSON.stringify({ settings }), req.ip]
            );
            
            res.json({
                message: 'Settings updated successfully',
                settings: result.rows[0]
            });
            
        } catch (error) {
            logger.error('Update company settings error:', error);
            res.status(500).json({
                error: 'Failed to update company settings',
                code: 'UPDATE_SETTINGS_ERROR'
            });
        }
    }

    // Get user settings
    async getUserSettings(req, res) {
        try {
            const result = await pool.query(
                'SELECT * FROM user_settings WHERE user_id = $1',
                [req.user.id]
            );
            
            if (result.rows.length === 0) {
                // Return default settings
                return res.json({
                    settings: {
                        theme: 'dark',
                        language: 'en',
                        notifications: {
                            email: true,
                            push: true,
                            inApp: true
                        },
                        dashboard: {
                            layout: 'default',
                            widgets: ['tasks', 'projects', 'calendar']
                        }
                    }
                });
            }
            
            res.json({ settings: result.rows[0].settings });
            
        } catch (error) {
            logger.error('Get user settings error:', error);
            res.status(500).json({
                error: 'Failed to get user settings',
                code: 'GET_USER_SETTINGS_ERROR'
            });
        }
    }

    // Update user settings
    async updateUserSettings(req, res) {
        try {
            const settings = req.body;
            
            const result = await pool.query(
                `INSERT INTO user_settings (user_id, settings, updated_at)
                 VALUES ($1, $2, CURRENT_TIMESTAMP)
                 ON CONFLICT (user_id) DO UPDATE 
                 SET settings = $2, updated_at = CURRENT_TIMESTAMP
                 RETURNING *`,
                [req.user.id, JSON.stringify(settings)]
            );
            
            res.json({
                message: 'User settings updated',
                settings: result.rows[0].settings
            });
            
        } catch (error) {
            logger.error('Update user settings error:', error);
            res.status(500).json({
                error: 'Failed to update user settings',
                code: 'UPDATE_USER_SETTINGS_ERROR'
            });
        }
    }

    // Get departments
    async getDepartments(req, res) {
        try {
            const result = await pool.query(
                'SELECT DISTINCT department FROM users WHERE department IS NOT NULL ORDER BY department'
            );
            
            res.json({ departments: result.rows.map(r => r.department) });
            
        } catch (error) {
            logger.error('Get departments error:', error);
            res.status(500).json({
                error: 'Failed to get departments',
                code: 'GET_DEPARTMENTS_ERROR'
            });
        }
    }

    // Update departments
    async updateDepartments(req, res) {
        try {
            // Only CEO can update departments
            if (req.user.role !== 'CEO') {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            }
            
            const { departments } = req.body;
            
            // Validate departments
            if (!Array.isArray(departments)) {
                return res.status(400).json({
                    error: 'Departments must be an array',
                    code: 'INVALID_DEPARTMENTS'
                });
            }
            
            // Store departments in settings
            await pool.query(
                `INSERT INTO company_settings (settings)
                 VALUES ($1)
                 ON CONFLICT (id) DO UPDATE 
                 SET settings = company_settings.settings || $1`,
                [JSON.stringify({ departments })]
            );
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'UPDATE_DEPARTMENTS', 'SETTINGS', 
                 JSON.stringify({ departments }), req.ip]
            );
            
            res.json({
                message: 'Departments updated',
                departments
            });
            
        } catch (error) {
            logger.error('Update departments error:', error);
            res.status(500).json({
                error: 'Failed to update departments',
                code: 'UPDATE_DEPARTMENTS_ERROR'
            });
        }
    }

    // Get system preferences
    async getSystemPreferences(req, res) {
        try {
            // Only CEO can access system preferences
            if (req.user.role !== 'CEO') {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            }
            
            const result = await pool.query(
                'SELECT * FROM system_preferences LIMIT 1'
            );
            
            if (result.rows.length === 0) {
                return res.json({
                    preferences: {
                        maintenanceMode: false,
                        allowRegistration: true,
                        requireApproval: true,
                        sessionTimeout: 60,
                        maxLoginAttempts: 5,
                        passwordPolicy: {
                            minLength: 8,
                            requireUppercase: true,
                            requireLowercase: true,
                            requireNumbers: true,
                            requireSpecialChars: true
                        },
                        backupSettings: {
                            enabled: true,
                            frequency: 'daily',
                            time: '02:00',
                            retention: 30
                        }
                    }
                });
            }
            
            res.json({ preferences: result.rows[0] });
            
        } catch (error) {
            logger.error('Get system preferences error:', error);
            res.status(500).json({
                error: 'Failed to get system preferences',
                code: 'GET_SYSTEM_PREFERENCES_ERROR'
            });
        }
    }

    // Update system preferences
    async updateSystemPreferences(req, res) {
        try {
            // Only CEO can update system preferences
            if (req.user.role !== 'CEO') {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            }
            
            const preferences = req.body;
            
            const result = await pool.query(
                `INSERT INTO system_preferences (preferences, updated_by)
                 VALUES ($1, $2)
                 ON CONFLICT (id) DO UPDATE 
                 SET preferences = $1, updated_by = $2, updated_at = CURRENT_TIMESTAMP
                 RETURNING *`,
                [JSON.stringify(preferences), req.user.id]
            );
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'UPDATE_SYSTEM_PREFERENCES', 'SETTINGS', 
                 JSON.stringify({ preferences }), req.ip]
            );
            
            res.json({
                message: 'System preferences updated',
                preferences: result.rows[0]
            });
            
        } catch (error) {
            logger.error('Update system preferences error:', error);
            res.status(500).json({
                error: 'Failed to update system preferences',
                code: 'UPDATE_SYSTEM_PREFERENCES_ERROR'
            });
        }
    }
}

module.exports = new SettingsController();