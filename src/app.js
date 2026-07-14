require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(helmet());
app.use(compression());
app.use(cors({ 
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['http://localhost:3000', 'http://localhost:5173'], 
    credentials: true 
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ============================================
// HEALTH CHECK - THIS WORKS
// ============================================
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(), 
        message: 'ZinvainOS API is running' 
    });
});

// ============================================
// AUTH ROUTES - DUMMY VERSION FOR TESTING
// ============================================
app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    
    // Simple test login
    if (email === 'ceo@zinvain.com' && password === 'Admin@2024') {
        return res.json({
            accessToken: 'fake-jwt-token-for-testing',
            refreshToken: 'fake-refresh-token',
            user: {
                id: '1',
                email: 'ceo@zinvain.com',
                fullName: 'CEO User',
                role: 'CEO'
            }
        });
    }
    
    res.status(401).json({ error: 'Invalid credentials' });
});

app.post('/api/auth/register', (req, res) => {
    res.json({ 
        message: 'Registration successful. Please wait for approval.',
        user: { id: '2', email: req.body.email, status: 'PENDING' }
    });
});

// ============================================
// NOTIFICATIONS - DUMMY VERSION
// ============================================
app.get('/api/notifications', (req, res) => {
    res.json({ notifications: [], unreadCount: 0 });
});

app.get('/api/notifications/unread', (req, res) => {
    res.json({ unreadCount: 0 });
});

// ============================================
// ROOT
// ============================================
app.get('/', (req, res) => {
    res.json({ message: 'ZinvainOS API', version: '1.0.0', status: 'running' });
});

app.listen(PORT, () => {
    console.log(`🚀 ZinvainOS Backend running on port ${PORT}`);
    console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;