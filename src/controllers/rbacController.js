const { pool } = require('../config/database');
const { ROLES, hasModuleAccess, hasPermission } = require('../config/roles');
const { logger } = require('../utils/logger');

class RBACController {
    // Get all roles
    async getRoles(req, res) {
        try {
            // Get role definitions
            const roles = Object.keys(ROLES).map(key => ({
                name: key,
                label: ROLES[key].name,
                level: ROLES[key].level,
                permissions: ROLES[key].permissions
            }));
            
            // Get role assignments count
            const result = await pool.query(
                'SELECT role, COUNT(*) as count FROM users GROUP BY role'
            );
            
            const roleCounts = {};
            result.rows.forEach(row => {
                roleCounts[row.role] = parseInt(row.count);
            });
            
            res.json({
                roles: roles.map(role => ({
                    ...role,
                    userCount: roleCounts[role.name] || 0
                }))
            });
        } catch (error) {
            logger.error('Get roles error:', error);
            res.status(500).json({
                error: 'Failed to get roles',
                code: 'ROLES_ERROR'
            });
        }
    }

    // Get role permissions
    async getRolePermissions(req, res) {
        try {
            const { role } = req.params;
            
            if (!ROLES[role]) {
                return res.status(404).json({
                    error: 'Role not found',
                    code: 'ROLE_NOT_FOUND'
                });
            }
            
            res.json({
                role,
                permissions: ROLES[role].permissions,
                moduleAccess: ROLES[role].permissions.modules || {}
            });
        } catch (error) {
            logger.error('Get role permissions error:', error);
            res.status(500).json({
                error: 'Failed to get role permissions',
                code: 'ROLE_PERMISSIONS_ERROR'
            });
        }
    }

    // Update role permissions (CEO only)
    async updateRolePermissions(req, res) {
        try {
            const { role } = req.params;
            const { permissions } = req.body;
            
            if (!ROLES[role]) {
                return res.status(404).json({
                    error: 'Role not found',
                    code: 'ROLE_NOT_FOUND'
                });
            }
            
            // Update role permissions in config
            // Note: In production, you'd store this in database
            ROLES[role].permissions.modules = permissions;
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'UPDATE_ROLE_PERMISSIONS', 'RBAC', 
                 JSON.stringify({ role, permissions }), req.ip]
            );
            
            res.json({
                message: 'Role permissions updated successfully',
                role,
                permissions
            });
        } catch (error) {
            logger.error('Update role permissions error:', error);
            res.status(500).json({
                error: 'Failed to update role permissions',
                code: 'UPDATE_PERMISSIONS_ERROR'
            });
        }
    }

    // Assign role to user
    async assignRole(req, res) {
        try {
            const { userId } = req.params;
            const { role } = req.body;
            
            if (!ROLES[role]) {
                return res.status(400).json({
                    error: 'Invalid role',
                    code: 'INVALID_ROLE'
                });
            }
            
            const result = await pool.query(
                'UPDATE users SET role = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, email, full_name, role',
                [role, userId]
            );
            
            if (result.rows.length === 0) {
                return res.status(404).json({
                    error: 'User not found',
                    code: 'USER_NOT_FOUND'
                });
            }
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'ASSIGN_ROLE', 'RBAC', 
                 JSON.stringify({ userId, role }), req.ip]
            );
            
            res.json({
                message: 'Role assigned successfully',
                user: result.rows[0]
            });
        } catch (error) {
            logger.error('Assign role error:', error);
            res.status(500).json({
                error: 'Failed to assign role',
                code: 'ASSIGN_ROLE_ERROR'
            });
        }
    }

    // Check user permissions
    async checkPermissions(req, res) {
        try {
            const { userId, module, action } = req.query;
            
            if (!userId || !module) {
                return res.status(400).json({
                    error: 'Missing required parameters',
                    code: 'MISSING_PARAMETERS'
                });
            }
            
            const userResult = await pool.query(
                'SELECT role FROM users WHERE id = $1',
                [userId]
            );
            
            if (userResult.rows.length === 0) {
                return res.status(404).json({
                    error: 'User not found',
                    code: 'USER_NOT_FOUND'
                });
            }
            
            const userRole = userResult.rows[0].role;
            const hasAccess = hasModuleAccess(userRole, module);
            const hasPerm = action ? hasPermission(userRole, module, action) : true;
            
            res.json({
                userId,
                role: userRole,
                module,
                action: action || 'read',
                hasAccess: hasAccess && hasPerm,
                permission: hasPerm ? 'ALLOWED' : 'DENIED'
            });
        } catch (error) {
            logger.error('Check permissions error:', error);
            res.status(500).json({
                error: 'Failed to check permissions',
                code: 'CHECK_PERMISSIONS_ERROR'
            });
        }
    }

    // Get role hierarchy
    async getRoleHierarchy(req, res) {
        try {
            const hierarchy = {
                CEO: {
                    level: 3,
                    label: 'CEO',
                    canManage: ['TEAM_MEMBER', 'EMPLOYEE'],
                    modules: 'ALL'
                },
                TEAM_MEMBER: {
                    level: 2,
                    label: 'Team Member / Manager',
                    canManage: ['EMPLOYEE'],
                    modules: 'SELECTED'
                },
                EMPLOYEE: {
                    level: 1,
                    label: 'Employee',
                    canManage: [],
                    modules: 'BASIC'
                }
            };
            
            res.json({ hierarchy });
        } catch (error) {
            logger.error('Get role hierarchy error:', error);
            res.status(500).json({
                error: 'Failed to get role hierarchy',
                code: 'HIERARCHY_ERROR'
            });
        }
    }

    // Get module access matrix
    async getModuleAccessMatrix(req, res) {
        try {
            const modules = [
                'Authentication & Login', 'Security System', 'Role Based Access Control',
                'Dashboard', 'User & Employee Management', 'Client CRM',
                'Project Management', 'Graphic Design Workspace', 'Software Development Workspace',
                'Sprint Management', 'Task Management', 'Recurring Tasks',
                'Time Tracking & Productivity', 'Team Workspace & Communication', 'Meeting Management',
                'File Storage & Digital Asset Manager', 'Approval Workflow', 'Proposal / Quotation Generator',
                'Contract Management', 'Finance & Accounting', 'Payment Tracking',
                'Invoice System', 'Payroll', 'Attendance Management',
                'Leave Management', 'Calendar System', 'Notification Center',
                'Global Search', 'Reports & Analytics', 'Risk Alert System',
                'Performance Evaluation', 'Announcement Board', 'Activity / Audit Logs',
                'Team Workload Dashboard', 'AI Business Assistant', 'Custom Fields',
                'Data Import / Export', 'Recycle Bin', 'System Health Monitoring',
                'Settings & Company Configuration', 'Premium UI / UX', 'Technical Architecture'
            ];
            
            const matrix = {
                CEO: {},
                TEAM_MEMBER: {},
                EMPLOYEE: {}
            };
            
            // Populate matrix from ROLES config
            Object.keys(ROLES).forEach(role => {
                const roleConfig = ROLES[role];
                modules.forEach(module => {
                    const moduleKey = module.toLowerCase().replace(/ & /g, '_').replace(/ /g, '_');
                    matrix[role][module] = role === 'CEO' ? 'FULL' : 
                        (roleConfig.permissions.modules[moduleKey] || 'NONE');
                });
            });
            
            res.json({ matrix });
        } catch (error) {
            logger.error('Get module access matrix error:', error);
            res.status(500).json({
                error: 'Failed to get access matrix',
                code: 'MATRIX_ERROR'
            });
        }
    }
}

module.exports = new RBACController();