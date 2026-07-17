require('dotenv').config();

module.exports = {
    jwtSecret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this',
    jwtExpire: process.env.JWT_EXPIRE || '7d',
    jwtRefreshExpire: process.env.JWT_REFRESH_EXPIRE || '30d',
    saltRounds: 12,
    bcryptSaltRounds: 12
};