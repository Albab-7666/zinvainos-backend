const { body, param } = require('express-validator');
const { ROLES, USER_STATUS } = require('../utils/constants');

const createUserValidator = [
    body('email').isEmail().withMessage('Invalid email format'),
    body('password')
        .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
        .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter')
        .matches(/[a-z]/).withMessage('Password must contain at least one lowercase letter')
        .matches(/[0-9]/).withMessage('Password must contain at least one number'),
    body('fullName').notEmpty().withMessage('Full name is required'),
    body('role')
        .optional()
        .isIn(Object.values(ROLES))
        .withMessage(`Role must be one of: ${Object.values(ROLES).join(', ')}`),
    body('department').optional().isString(),
    body('position').optional().isString()
];

const updateUserValidator = [
    param('id').isUUID().withMessage('Invalid ID format'),
    body('fullName').optional().notEmpty().withMessage('Full name cannot be empty'),
    body('email').optional().isEmail().withMessage('Invalid email format'),
    body('role')
        .optional()
        .isIn(Object.values(ROLES))
        .withMessage(`Role must be one of: ${Object.values(ROLES).join(', ')}`),
    body('department').optional().isString(),
    body('position').optional().isString(),
    body('status')
        .optional()
        .isIn(Object.values(USER_STATUS))
        .withMessage(`Status must be one of: ${Object.values(USER_STATUS).join(', ')}`)
];

const userIdValidator = [
    param('id').isUUID().withMessage('Invalid user ID format')
];

const resetPasswordValidator = [
    param('id').isUUID().withMessage('Invalid user ID format'),
    body('newPassword')
        .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
        .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter')
        .matches(/[a-z]/).withMessage('Password must contain at least one lowercase letter')
        .matches(/[0-9]/).withMessage('Password must contain at least one number')
];

const roleAssignmentValidator = [
    param('userId').isUUID().withMessage('Invalid user ID format'),
    body('role')
        .isIn(Object.values(ROLES))
        .withMessage(`Role must be one of: ${Object.values(ROLES).join(', ')}`)
];

module.exports = {
    createUserValidator,
    updateUserValidator,
    userIdValidator,
    resetPasswordValidator,
    roleAssignmentValidator
};