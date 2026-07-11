require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 5000;

// ========== MIDDLEWARE ==========
app.use(helmet());
app.use(compression());

app.use(cors({
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['http://localhost:5173', 'http://localhost:3000'],
    credentials: true
}));

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100
});
app.use('/api', limiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ========== HEALTH CHECK ==========
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

app.get('/', (req, res) => {
    res.json({
        message: 'ZinvainOS API is running',
        version: '1.0.0',
        status: 'active'
    });
});

// ========== ROUTES ==========
// Auth Routes
try {
    const authRoutes = require('./routes/authRoutes');
    if (authRoutes && typeof authRoutes === 'function') {
        app.use('/api/auth', authRoutes);
    } else {
        app.use('/api/auth', authRoutes);
    }
} catch (err) {
    console.log('⚠️ Auth routes not loaded:', err.message);
}

// User Routes
try {
    const userRoutes = require('./routes/userRoutes');
    app.use('/api/users', userRoutes);
} catch (err) {
    console.log('⚠️ User routes not loaded:', err.message);
}

// Client Routes
try {
    const clientRoutes = require('./routes/clientRoutes');
    app.use('/api/clients', clientRoutes);
} catch (err) {
    console.log('⚠️ Client routes not loaded:', err.message);
}

// Project Routes
try {
    const projectRoutes = require('./routes/projectRoutes');
    app.use('/api/projects', projectRoutes);
} catch (err) {
    console.log('⚠️ Project routes not loaded:', err.message);
}

// Task Routes
try {
    const taskRoutes = require('./routes/taskRoutes');
    app.use('/api/tasks', taskRoutes);
} catch (err) {
    console.log('⚠️ Task routes not loaded:', err.message);
}

// ========== 404 HANDLER ==========
app.use((req, res) => {
    res.status(404).json({
        error: 'Route not found',
        path: req.originalUrl
    });
});

// ========== ERROR HANDLER ==========
app.use((err, req, res, next) => {
    console.error('❌ Error:', err.message);
    console.error(err.stack);
    res.status(500).json({
        error: 'Internal server error',
        message: err.message
    });
});

// ========== START SERVER ==========
app.listen(PORT, () => {
    console.log(`🚀 ZinvainOS Backend running on port ${PORT}`);
    console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
});

module.exports = app;