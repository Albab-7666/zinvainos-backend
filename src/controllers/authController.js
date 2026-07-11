const User = require('../models/User');
const Session = require('../models/Session');
const { generateTokens } = require('../utils/jwt');
const { logger } = require('../utils/logger');
const { pool } = require('../config/database');

class AuthController {
    // Register new user
    async register(req, res) {
        try {
            const { email, password, fullName, role = 'EMPLOYEE', department, position } = req.body;

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
                role,
                department,
                position
            });

            // Log registration
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [user.id, 'REGISTER', 'AUTHENTICATION', 
                 JSON.stringify({ email, role }), req.ip]
            );

            res.status(201).json({
                message: 'Registration successful. Please wait for approval.',
                user: {
                    id: user.id,
                    email: user.email,
                    fullName: user.full_name,
                    role: user.role,
                    status: user.status
                }
            });
        } catch (error) {
            logger.error('Registration error:', error);
            res.status(500).json({
                error: 'Registration failed',
                code: 'REGISTRATION_ERROR'
            });
        }
    }

    // Login user
    async login(req, res) {
        try {
            const { email, password } = req.body;

            // Verify credentials
            const user = await User.verifyPassword(email, password);
            if (!user) {
                return res.status(401).json({
                    error: 'Invalid credentials',
                    code: 'INVALID_CREDENTIALS'
                });
            }

            // Check if user is approved
            if (user.status === 'PENDING') {
                return res.status(403).json({
                    error: 'Account pending approval',
                    code: 'PENDING_APPROVAL'
                });
            }

            if (user.status === 'SUSPENDED') {
                return res.status(403).json({
                    error: 'Account suspended',
                    code: 'ACCOUNT_SUSPENDED'
                });
            }

            // Generate tokens
            const { accessToken, refreshToken } = generateTokens(user.id, user.email, user.role);

            // Save session
            await Session.create({
                userId: user.id,
                token: accessToken,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            });

            // Log login
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [user.id, 'LOGIN', 'AUTHENTICATION', 
                 JSON.stringify({ email }), req.ip]
            );

            res.json({
                message: 'Login successful',
                accessToken,
                refreshToken,
                user: {
                    id: user.id,
                    email: user.email,
                    fullName: user.full_name,
                    role: user.role,
                    department: user.department,
                    position: user.position
                }
            });
        } catch (error) {
            logger.error('Login error:', error);
            res.status(500).json({
                error: 'Login failed',
                code: 'LOGIN_ERROR'
            });
        }
    }

    // Logout user
    async logout(req, res) {
        try {
            const token = req.token;
            
            // Delete session
            await Session.deleteByToken(token);
            
            // Log logout
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'LOGOUT', 'AUTHENTICATION', 
                 JSON.stringify({ email: req.user.email }), req.ip]
            );

            res.json({
                message: 'Logout successful'
            });
        } catch (error) {
            logger.error('Logout error:', error);
            res.status(500).json({
                error: 'Logout failed',
                code: 'LOGOUT_ERROR'
            });
        }
    }

    // Refresh token
    async refreshToken(req, res) {
        try {
            const { refreshToken } = req.body;
            
            if (!refreshToken) {
                return res.status(400).json({
                    error: 'Refresh token required',
                    code: 'MISSING_REFRESH_TOKEN'
                });
            }

            // Verify refresh token
            const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
            
            // Get user
            const user = await User.findById(decoded.userId);
            if (!user) {
                return res.status(401).json({
                    error: 'User not found',
                    code: 'USER_NOT_FOUND'
                });
            }

            // Generate new tokens
            const { accessToken, refreshToken: newRefreshToken } = generateTokens(
                user.id, 
                user.email, 
                user.role
            );

            // Save new session
            await Session.create({
                userId: user.id,
                token: accessToken,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            });

            res.json({
                accessToken,
                refreshToken: newRefreshToken
            });
        } catch (error) {
            logger.error('Refresh token error:', error);
            res.status(401).json({
                error: 'Invalid refresh token',
                code: 'INVALID_REFRESH_TOKEN'
            });
        }
    }

    // Get current user
    async getMe(req, res) {
        try {
            const user = await User.findById(req.user.id);
            
            if (!user) {
                return res.status(404).json({
                    error: 'User not found',
                    code: 'USER_NOT_FOUND'
                });
            }

            res.json({ user });
        } catch (error) {
            logger.error('Get me error:', error);
            res.status(500).json({
                error: 'Failed to get user',
                code: 'GET_USER_ERROR'
            });
        }
    }

    // Forgot password
    async forgotPassword(req, res) {
        try {
            const { email } = req.body;
            
            // Check if user exists
            const user = await User.findByEmail(email);
            if (!user) {
                return res.status(404).json({
                    error: 'User not found',
                    code: 'USER_NOT_FOUND'
                });
            }

            // Generate reset token
            const resetToken = crypto.randomBytes(32).toString('hex');
            
            // Save reset token to database (you'll need to add a reset_tokens table)
            // For now, we'll just return a success message
            
            // TODO: Send reset email
            // await sendResetEmail(email, resetToken);

            res.json({
                message: 'Password reset email sent'
            });
        } catch (error) {
            logger.error('Forgot password error:', error);
            res.status(500).json({
                error: 'Failed to process request',
                code: 'FORGOT_PASSWORD_ERROR'
            });
        }
    }

    // Reset password
    async resetPassword(req, res) {
        try {
            const { token, newPassword } = req.body;
            
            // Verify token and reset password
            // TODO: Implement token verification
            
            res.json({
                message: 'Password reset successful'
            });
        } catch (error) {
            logger.error('Reset password error:', error);
            res.status(500).json({
                error: 'Failed to reset password',
                code: 'RESET_PASSWORD_ERROR'
            });
        }
    }
}

module.exports = new AuthController();