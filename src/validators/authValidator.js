const { body, validationResult } = require('express-validator');

const validateRegister = [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }),
    body('fullName').notEmpty().trim(),
    body('role').optional().isIn(['CEO', 'TEAM_MEMBER', 'EMPLOYEE']),
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                errors: errors.array().map(e => ({
                    field: e.path,
                    message: e.msg
                }))
            });
        }
        next();
    }
];

const validateLogin = [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                errors: errors.array().map(e => ({
                    field: e.path,
                    message: e.msg
                }))
            });
        }
        next();
    }
];

module.exports = { validateRegister, validateLogin };