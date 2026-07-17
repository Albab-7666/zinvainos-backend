const { logger } = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
    logger.error('Error:', err);
    
    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal Server Error';
    const code = err.code || 'INTERNAL_ERROR';
    
    res.status(statusCode).json({
        error: message,
        code: code,
        timestamp: new Date().toISOString(),
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
};

class AppError extends Error {
    constructor(message, statusCode, code) {
        super(message);
        this.statusCode = statusCode || 400;
        this.code = code || 'ERROR';
        Error.captureStackTrace(this, this.constructor);
    }
}

module.exports = { errorHandler, AppError };