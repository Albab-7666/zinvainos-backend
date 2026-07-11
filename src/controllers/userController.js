const { pool } = require('../config/database');
const User = require('../models/User');
const { logger } = require('../utils/logger');
const { hashPassword } = require('../utils/bcrypt');

class UserController {
    // Get all users
    async getUsers(req, res) {
        try {
            const { limit = 100, offset = 0, role = null, status = null, search = null } = req.query;
            
            let query = `
                SELECT id, email, full_name, role, department, position, status, avatar_url, created_at
                FROM users
                WHERE 1=1
            `;
            let values = [];
            let paramIndex = 1;
            
            if (role) {
                query += ` AND role = $${paramIndex}`;
                values.push(role);
                paramIndex++;
            }
            
            if (status) {
                query += ` AND status = $${paramIndex}`;
                values.push(status);
                paramIndex++;
            }
            
            if (search) {
                query += ` AND (full_name ILIKE $${paramIndex} OR email ILIKE $${paramIndex})`;
                values.push(`%${search}%`);
                paramIndex++;
            }
            
            // Don't show CEO to non-CEO users or limit visibility
            if (req.user.role !== 'CEO') {
                query += ` AND role != 'CEO'`;
            }
            
            // Get total count
            const countQuery = query.replace(
                'SELECT id, email, full_name, role, department, position, status, avatar_url, created_at',
                'SELECT COUNT(*) as total'
            );
            const countResult = await pool.query(countQuery, values);
            const total = parseInt(countResult.rows[0].total);
            
            // Get paginated results
            query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
            values.push(parseInt(limit), parseInt(offset));
            
            const result = await pool.query(query, values);
            
            res.json({
                users: result.rows,
                pagination: {
                    total,
                    limit: parseInt(limit),
                    offset: parseInt(offset),
                    totalPages: Math.ceil(total / parseInt(limit))
                }
            });
            
        } catch (error) {
            logger.error('Get users error:', error);
            res.status(500).json({
                error: 'Failed to get users',
                code: 'GET_USERS_ERROR'
            });
        }
    }

    // Get user by ID
    async getUser(req, res) {
        try {
            const { id } = req.params;
            
            const user = await User.findById(id);
            if (!user) {
                return res.status(404).json({
                    error: 'User not found',
                    code: 'USER_NOT_FOUND'
                });
            }
            
            // Check permission
            if (req.user.role !== 'CEO' && req.user.id !== id) {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            }
            
            res.json({ user });
            
        } catch (error) {
            logger.error('Get user error:', error);
            res.status(500).json({
                error: 'Failed to get user',
                code: 'GET_USER_ERROR'
            });
        }
    }

    // Create user (admin)
    async createUser(req, res) {
        try {
            const { email, password, fullName, role, department, position } = req.body;
            
            // Check if user exists
            const existingUser = await User.findByEmail(email);
            if (existingUser) {
                return res.status(400).json({
                    error: 'User already exists',
                    code: 'USER_EXISTS'
                });
            }
            
            // Create user
            const user = await User.create({
                email,
                password,
                fullName,
                role: role || 'EMPLOYEE',
                department,
                position
            });
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'CREATE_USER', 'USER_MANAGEMENT', 
                 JSON.stringify({ userId: user.id, email }), req.ip]
            );
            
            res.status(201).json({
                message: 'User created successfully',
                user
            });
            
        } catch (error) {
            logger.error('Create user error:', error);
            res.status(500).json({
                error: 'Failed to create user',
                code: 'CREATE_USER_ERROR'
            });
        }
    }

    // Update user
    async updateUser(req, res) {
        try {
            const { id } = req.params;
            const updates = req.body;
            
            // Check permission
            if (req.user.role !== 'CEO' && req.user.id !== id) {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            }
            
            // Remove sensitive fields
            delete updates.password;
            delete updates.id;
            
            const user = await User.update(id, updates);
            if (!user) {
                return res.status(404).json({
                    error: 'User not found',
                    code: 'USER_NOT_FOUND'
                });
            }
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'UPDATE_USER', 'USER_MANAGEMENT', 
                 JSON.stringify({ userId: id, updates }), req.ip]
            );
            
            res.json({
                message: 'User updated successfully',
                user
            });
            
        } catch (error) {
            logger.error('Update user error:', error);
            res.status(500).json({
                error: 'Failed to update user',
                code: 'UPDATE_USER_ERROR'
            });
        }
    }

    // Delete user (soft delete)
    async deleteUser(req, res) {
        try {
            const { id } = req.params;
            
            // Only CEO can delete users
            if (req.user.role !== 'CEO') {
                return res.status(403).json({
                    error: 'Only CEO can delete users',
                    code: 'ACCESS_DENIED'
                });
            }
            
            // Don't allow deleting yourself
            if (req.user.id === id) {
                return res.status(400).json({
                    error: 'Cannot delete yourself',
                    code: 'CANNOT_DELETE_SELF'
                });
            }
            
            const user = await User.delete(id);
            if (!user) {
                return res.status(404).json({
                    error: 'User not found',
                    code: 'USER_NOT_FOUND'
                });
            }
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'DELETE_USER', 'USER_MANAGEMENT', 
                 JSON.stringify({ userId: id }), req.ip]
            );
            
            res.json({
                message: 'User deleted successfully'
            });
            
        } catch (error) {
            logger.error('Delete user error:', error);
            res.status(500).json({
                error: 'Failed to delete user',
                code: 'DELETE_USER_ERROR'
            });
        }
    }

    // Suspend user
    async suspendUser(req, res) {
        try {
            const { id } = req.params;
            
            // Only CEO can suspend users
            if (req.user.role !== 'CEO') {
                return res.status(403).json({
                    error: 'Only CEO can suspend users',
                    code: 'ACCESS_DENIED'
                });
            }
            
            // Don't allow suspending yourself
            if (req.user.id === id) {
                return res.status(400).json({
                    error: 'Cannot suspend yourself',
                    code: 'CANNOT_SUSPEND_SELF'
                });
            }
            
            const user = await User.suspendUser(id);
            if (!user) {
                return res.status(404).json({
                    error: 'User not found',
                    code: 'USER_NOT_FOUND'
                });
            }
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'SUSPEND_USER', 'USER_MANAGEMENT', 
                 JSON.stringify({ userId: id }), req.ip]
            );
            
            res.json({
                message: 'User suspended successfully',
                user
            });
            
        } catch (error) {
            logger.error('Suspend user error:', error);
            res.status(500).json({
                error: 'Failed to suspend user',
                code: 'SUSPEND_USER_ERROR'
            });
        }
    }

    // Restore user
    async restoreUser(req, res) {
        try {
            const { id } = req.params;
            
            // Only CEO can restore users
            if (req.user.role !== 'CEO') {
                return res.status(403).json({
                    error: 'Only CEO can restore users',
                    code: 'ACCESS_DENIED'
                });
            }
            
            const user = await User.restoreUser(id);
            if (!user) {
                return res.status(404).json({
                    error: 'User not found',
                    code: 'USER_NOT_FOUND'
                });
            }
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'RESTORE_USER', 'USER_MANAGEMENT', 
                 JSON.stringify({ userId: id }), req.ip]
            );
            
            res.json({
                message: 'User restored successfully',
                user
            });
            
        } catch (error) {
            logger.error('Restore user error:', error);
            res.status(500).json({
                error: 'Failed to restore user',
                code: 'RESTORE_USER_ERROR'
            });
        }
    }

    // Reset user password
    async resetPassword(req, res) {
        try {
            const { id } = req.params;
            const { newPassword } = req.body;
            
            // Only CEO can reset passwords
            if (req.user.role !== 'CEO') {
                return res.status(403).json({
                    error: 'Only CEO can reset passwords',
                    code: 'ACCESS_DENIED'
                });
            }
            
            const user = await User.changePassword(id, newPassword);
            if (!user) {
                return res.status(404).json({
                    error: 'User not found',
                    code: 'USER_NOT_FOUND'
                });
            }
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'RESET_PASSWORD', 'USER_MANAGEMENT', 
                 JSON.stringify({ userId: id }), req.ip]
            );
            
            res.json({
                message: 'Password reset successfully'
            });
            
        } catch (error) {
            logger.error('Reset password error:', error);
            res.status(500).json({
                error: 'Failed to reset password',
                code: 'RESET_PASSWORD_ERROR'
            });
        }
    }

    // Get pending users
    async getPendingUsers(req, res) {
        try {
            // Only CEO and Team Members can see pending users
            if (req.user.role === 'EMPLOYEE') {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            }
            
            const users = await User.getPendingUsers();
            res.json({ users });
            
        } catch (error) {
            logger.error('Get pending users error:', error);
            res.status(500).json({
                error: 'Failed to get pending users',
                code: 'PENDING_USERS_ERROR'
            });
        }
    }

    // Approve user registration
    async approveUser(req, res) {
        try {
            const { id } = req.params;
            
            // Only CEO can approve users
            if (req.user.role !== 'CEO') {
                return res.status(403).json({
                    error: 'Only CEO can approve users',
                    code: 'ACCESS_DENIED'
                });
            }
            
            const user = await User.approveUser(id, req.user.id);
            if (!user) {
                return res.status(404).json({
                    error: 'User not found',
                    code: 'USER_NOT_FOUND'
                });
            }
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'APPROVE_USER', 'USER_MANAGEMENT', 
                 JSON.stringify({ userId: id }), req.ip]
            );
            
            res.json({
                message: 'User approved successfully',
                user
            });
            
        } catch (error) {
            logger.error('Approve user error:', error);
            res.status(500).json({
                error: 'Failed to approve user',
                code: 'APPROVE_USER_ERROR'
            });
        }
    }

    // Get user departments
    async getDepartments(req, res) {
        try {
            const result = await pool.query(
                'SELECT DISTINCT department FROM users WHERE department IS NOT NULL ORDER BY department'
            );
            
            res.json({
                departments: result.rows.map(row => row.department)
            });
            
        } catch (error) {
            logger.error('Get departments error:', error);
            res.status(500).json({
                error: 'Failed to get departments',
                code: 'DEPARTMENTS_ERROR'
            });
        }
    }

    // Get user roles
    async getRoles(req, res) {
        try {
            const result = await pool.query(
                'SELECT DISTINCT role, COUNT(*) as count FROM users GROUP BY role'
            );
            
            const roles = result.rows.map(row => ({
                role: row.role,
                count: parseInt(row.count)
            }));
            
            res.json({ roles });
            
        } catch (error) {
            logger.error('Get roles error:', error);
            res.status(500).json({
                error: 'Failed to get roles',
                code: 'ROLES_ERROR'
            });
        }
    }
}

module.exports = new UserController();