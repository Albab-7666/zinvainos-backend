const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { pool } = require('../config/database');
const { logger } = require('../utils/logger');

// Security headers middleware
const securityHeaders = helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "https://*.supabase.co"],
            fontSrc: ["'self'", "data:"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"]
        }
    },
    crossOriginEmbedderPolicy: true,
    crossOriginOpenerPolicy: true,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    dnsPrefetchControl: true,
    frameguard: { action: "deny" },
    hidePoweredBy: true,
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    ieNoOpen: true,
    noSniff: true,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    xssFilter: true
});

// Rate limiting by IP
const rateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    message: { error: 'Too many requests', code: 'RATE_LIMIT_EXCEEDED' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Login rate limiter (stricter)
const loginRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Too many login attempts', code: 'LOGIN_RATE_LIMIT' },
    skipSuccessfulRequests: true,
});

// Brute force protection
const bruteForceProtection = async (req, res, next) => {
    const ip = req.ip;
    const key = `bruteforce:${ip}`;
    
    try {
        // Check if IP is blocked
        const blockResult = await pool.query(
            'SELECT * FROM security_blocks WHERE ip_address = $1 AND expires_at > NOW()',
            [ip]
        );
        
        if (blockResult.rows.length > 0) {
            return res.status(429).json({
                error: 'IP temporarily blocked due to suspicious activity',
                code: 'IP_BLOCKED',
                expiresAt: blockResult.rows[0].expires_at
            });
        }
        
        next();
    } catch (error) {
        logger.error('Brute force protection error:', error);
        next();
    }
};

// SQL Injection detection
const sqlInjectionDetection = (req, res, next) => {
    const suspiciousPatterns = [
        /(\b(select|insert|update|delete|drop|alter|create|truncate|exec|union|declare)\b)/i,
        /(--)/,
        /(;)/,
        /('.*or.*'='.*')/,
        /('.*or.*1=1)/,
        /('.*or.*1=.*1)/,
        /('.*or.*true)/,
        /('.*and.*'='.*')/,
        /('.*and.*1=1)/,
        /('.*or.*admin)/,
        /(\b(load_file|into outfile|into dumpfile)\b)/i
    ];
    
    const checkValue = (value) => {
        if (typeof value === 'string') {
            return suspiciousPatterns.some(pattern => pattern.test(value));
        }
        return false;
    };
    
    const checkObject = (obj) => {
        for (let key in obj) {
            if (obj.hasOwnProperty(key)) {
                if (typeof obj[key] === 'object' && obj[key] !== null) {
                    if (checkObject(obj[key])) return true;
                } else if (checkValue(obj[key])) {
                    return true;
                }
            }
        }
        return false;
    };
    
    if (req.body && checkObject(req.body)) {
        logger.warn(`SQL Injection attempt from IP: ${req.ip}`, { body: req.body });
        return res.status(400).json({
            error: 'Invalid request parameters',
            code: 'INVALID_REQUEST'
        });
    }
    
    if (req.query && checkObject(req.query)) {
        logger.warn(`SQL Injection attempt in query from IP: ${req.ip}`, { query: req.query });
        return res.status(400).json({
            error: 'Invalid query parameters',
            code: 'INVALID_QUERY'
        });
    }
    
    next();
};

// XSS Protection
const xssProtection = (req, res, next) => {
    const xssPatterns = [
        /<script.*?>.*?<\/script>/i,
        /<.*?onerror=.*?>/i,
        /<.*?onload=.*?>/i,
        /<.*?onclick=.*?>/i,
        /<.*?onmouseover=.*?>/i,
        /javascript:/i,
        /data:text\/html/i,
        /<iframe.*?>.*?<\/iframe>/i,
        /<object.*?>.*?<\/object>/i,
        /<embed.*?>/i
    ];
    
    const checkValue = (value) => {
        if (typeof value === 'string') {
            return xssPatterns.some(pattern => pattern.test(value));
        }
        return false;
    };
    
    const checkObject = (obj) => {
        for (let key in obj) {
            if (obj.hasOwnProperty(key)) {
                if (typeof obj[key] === 'object' && obj[key] !== null) {
                    if (checkObject(obj[key])) return true;
                } else if (checkValue(obj[key])) {
                    return true;
                }
            }
        }
        return false;
    };
    
    if (req.body && checkObject(req.body)) {
        logger.warn(`XSS attempt from IP: ${req.ip}`, { body: req.body });
        return res.status(400).json({
            error: 'Invalid request parameters',
            code: 'INVALID_REQUEST'
        });
    }
    
    next();
};

// Session security
const sessionSecurity = (req, res, next) => {
    // Regenerate session ID periodically
    if (req.session && req.session.regenerate) {
        const lastRegeneration = req.session.lastRegeneration || 0;
        const now = Date.now();
        
        if (now - lastRegeneration > 3600000) { // 1 hour
            req.session.regenerate((err) => {
                if (err) {
                    logger.error('Session regeneration error:', err);
                }
                req.session.lastRegeneration = now;
                next();
            });
            return;
        }
    }
    next();
};

// Security logging
const securityLogging = async (req, res, next) => {
    const startTime = Date.now();
    
    res.on('finish', async () => {
        const duration = Date.now() - startTime;
        const logData = {
            ip: req.ip,
            method: req.method,
            url: req.url,
            status: res.statusCode,
            duration,
            userAgent: req.headers['user-agent'],
            userId: req.user?.id || null
        };
        
        // Log suspicious requests
        if (res.statusCode === 401 || res.statusCode === 403 || res.statusCode === 429) {
            await pool.query(
                `INSERT INTO security_logs (ip_address, user_id, action, details, created_at)
                 VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
                [req.ip, req.user?.id || null, 'SECURITY_EVENT', JSON.stringify(logData)]
            );
        }
    });
    
    next();
};

// CSRF Protection
const csrfProtection = (req, res, next) => {
    // Only check for state-changing methods
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
        const csrfToken = req.headers['x-csrf-token'] || req.body._csrf;
        const sessionToken = req.session?.csrfToken;
        
        if (!csrfToken || csrfToken !== sessionToken) {
            return res.status(403).json({
                error: 'Invalid CSRF token',
                code: 'CSRF_INVALID'
            });
        }
    }
    next();
};

// Generate CSRF token
const generateCsrfToken = (req, res, next) => {
    if (!req.session) {
        return next();
    }
    
    if (!req.session.csrfToken) {
        const crypto = require('crypto');
        req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    }
    
    res.locals.csrfToken = req.session.csrfToken;
    next();
};

module.exports = {
    securityHeaders,
    rateLimiter,
    loginRateLimiter,
    bruteForceProtection,
    sqlInjectionDetection,
    xssProtection,
    sessionSecurity,
    securityLogging,
    csrfProtection,
    generateCsrfToken
};