const { body, param, query, validationResult } = require('express-validator');

const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            error: 'Validation failed',
            code: 'VALIDATION_ERROR',
            details: errors.array().map(e => ({
                field: e.path,
                message: e.msg
            }))
        });
    }
    next();
};

// Common validation rules
const idParam = param('id').isUUID().withMessage('Invalid ID format');
const email = body('email').isEmail().withMessage('Invalid email format');
const password = body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters');
const name = body('name').notEmpty().withMessage('Name is required');

module.exports = {
    validate,
    idParam,
    email,
    password,
    name
};