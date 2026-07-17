const User = require('../models/User');
const Session = require('../models/Session');
const { generateTokens } = require('../utils/jwt');
const { comparePassword } = require('../utils/bcrypt');

class AuthService {
    async register(userData) {
        return await User.create(userData);
    }

    async login(email, password, ipAddress, userAgent) {
        const user = await User.verifyPassword(email, password);
        if (!user) {
            throw new Error('Invalid credentials');
        }

        if (user.status === 'PENDING') {
            throw new Error('Account pending approval');
        }
        if (user.status === 'SUSPENDED') {
            throw new Error('Account suspended');
        }

        const { accessToken, refreshToken } = generateTokens(user.id, user.email, user.role);
        
        await Session.create({
            userId: user.id,
            token: accessToken,
            ipAddress,
            userAgent
        });

        return {
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
        };
    }

    async logout(token) {
        return await Session.deleteByToken(token);
    }

    async refreshToken(refreshToken, ipAddress, userAgent) {
        const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId);
        
        if (!user) {
            throw new Error('User not found');
        }

        const { accessToken, refreshToken: newRefreshToken } = generateTokens(
            user.id, user.email, user.role
        );

        await Session.create({
            userId: user.id,
            token: accessToken,
            ipAddress,
            userAgent
        });

        return { accessToken, refreshToken: newRefreshToken };
    }

    async getCurrentUser(userId) {
        return await User.findById(userId);
    }
}

module.exports = new AuthService();