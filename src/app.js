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

// === HEALTH CHECK ===
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(), 
        message: 'ZinvainOS API is running' 
    });
});

// === AUTH ROUTES ===
const authRoutes = require('./routes/authRoutes');
app.use('/api/auth', authRoutes);

// === USER ROUTES ===
const userRoutes = require('./routes/userRoutes');
app.use('/api/users', userRoutes);

// === CLIENT ROUTES ===
const clientRoutes = require('./routes/clientRoutes');
app.use('/api/clients', clientRoutes);

// === PROJECT ROUTES ===
const projectRoutes = require('./routes/projectRoutes');
app.use('/api/projects', projectRoutes);

// === TASK ROUTES ===
const taskRoutes = require('./routes/taskRoutes');
app.use('/api/tasks', taskRoutes);

// === TIME ROUTES ===
const timeRoutes = require('./routes/timeRoutes');
app.use('/api/time', timeRoutes);

// === ATTENDANCE ROUTES ===
const attendanceRoutes = require('./routes/attendanceRoutes');
app.use('/api/attendance', attendanceRoutes);

// === LEAVE ROUTES ===
const leaveRoutes = require('./routes/leaveRoutes');
app.use('/api/leave', leaveRoutes);

// === NOTIFICATION ROUTES ===
const notificationRoutes = require('./routes/notificationRoutes');
app.use('/api/notifications', notificationRoutes);

// === DASHBOARD ROUTES ===
const dashboardRoutes = require('./routes/dashboardRoutes');
app.use('/api/dashboard', dashboardRoutes);

// Root
app.get('/', (req, res) => {
    res.json({ message: 'ZinvainOS API', version: '1.0.0', status: 'running' });
});

app.listen(PORT, () => {
    console.log(`🚀 ZinvainOS Backend running on port ${PORT}`);
    console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;