const { body, param, query } = require('express-validator');

// Common validators
const idValidator = param('id').isUUID().withMessage('Invalid ID format');
const emailValidator = body('email').isEmail().withMessage('Invalid email format');
const passwordValidator = body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter')
    .matches(/[a-z]/).withMessage('Password must contain at least one lowercase letter')
    .matches(/[0-9]/).withMessage('Password must contain at least one number');
const nameValidator = body('name')
    .notEmpty().withMessage('Name is required')
    .isLength({ max: 255 }).withMessage('Name too long');
const descriptionValidator = body('description')
    .isLength({ max: 1000 }).withMessage('Description too long');

// Date validators
const dateValidator = (field) => 
    body(field).isISO8601().withMessage('Invalid date format');

const optionalDateValidator = (field) => 
    body(field).optional().isISO8601().withMessage('Invalid date format');

// Numeric validators
const numberValidator = (field) => 
    body(field).isNumeric().withMessage('Invalid number format');

const optionalNumberValidator = (field) => 
    body(field).optional().isNumeric().withMessage('Invalid number format');

// String validators
const stringValidator = (field) => 
    body(field).isString().withMessage('Invalid string format');

const optionalStringValidator = (field) => 
    body(field).optional().isString().withMessage('Invalid string format');

// Enum validators
const enumValidator = (field, enumValues) => 
    body(field).isIn(enumValues).withMessage(`Must be one of: ${enumValues.join(', ')}`);

const optionalEnumValidator = (field, enumValues) => 
    body(field).optional().isIn(enumValues).withMessage(`Must be one of: ${enumValues.join(', ')}`);

// Export all validators
module.exports = {
    idValidator,
    emailValidator,
    passwordValidator,
    nameValidator,
    descriptionValidator,
    dateValidator,
    optionalDateValidator,
    numberValidator,
    optionalNumberValidator,
    stringValidator,
    optionalStringValidator,
    enumValidator,
    optionalEnumValidator
};