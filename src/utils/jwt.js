const jwt = require('jsonwebtoken');

function generateTokens(userId, email, role) {
    const accessToken = jwt.sign(
        { userId, email, role },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRE || '7d' }
    );
    
    const refreshToken = jwt.sign(
        { userId, email, role },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_REFRESH_EXPIRE || '30d' }
    );
    
    return { accessToken, refreshToken };
}

function verifyToken(token) {
    try {
        return jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
        throw error;
    }
}

function decodeToken(token) {
    return jwt.decode(token);
}

module.exports = {
    generateTokens,
    verifyToken,
    decodeToken
};