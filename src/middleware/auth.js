const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');
const { logger } = require('../utils/logger');

// Authentication middleware
async function authenticate(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ 
                error: 'Authentication required',
                code: 'MISSING_TOKEN'
            });
        }

        const token = authHeader.split(' ')[1];
        
        // Verify JWT
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Check if session exists and is valid
        const sessionResult = await pool.query(
            'SELECT * FROM sessions WHERE user_id = $1 AND token = $2 AND expires_at > NOW()',
            [decoded.userId, token]
        );
        
        if (sessionResult.rows.length === 0) {
            return res.status(401).json({ 
                error: 'Invalid or expired session',
                code: 'INVALID_SESSION'
            });
        }

        // Get user details
        const userResult = await pool.query(
            'SELECT id, email, full_name, role, status, department FROM users WHERE id = $1',
            [decoded.userId]
        );
        
        if (userResult.rows.length === 0) {
            return res.status(401).json({
                error: 'User not found',
                code: 'USER_NOT_FOUND'
            });
        }

        const user = userResult.rows[0];
        
        // Check if user is active
        if (user.status !== 'ACTIVE') {
            return res.status(403).json({
                error: 'Account is not active',
                code: 'ACCOUNT_INACTIVE'
            });
        }

        // Attach user to request
        req.user = user;
        req.token = token;
        
        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                error: 'Invalid token',
                code: 'INVALID_TOKEN'
            });
        }
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                error: 'Token expired',
                code: 'TOKEN_EXPIRED'
            });
        }
        
        logger.error('Auth middleware error:', error);
        return res.status(500).json({
            error: 'Authentication error',
            code: 'AUTH_ERROR'
        });
    }
}

module.exports = { authenticate };