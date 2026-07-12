require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 5000;

// ============================================
// MIDDLEWARE
// ============================================
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

// ============================================
// HEALTH CHECK (ALWAYS WORKS)
// ============================================
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        message: 'ZinvainOS API is running'
    });
});

app.get('/', (req, res) => {
    res.json({
        message: 'ZinvainOS API',
        version: '1.0.0',
        status: 'active',
        endpoints: {
            health: '/api/health',
            auth: '/api/auth',
            users: '/api/users',
            projects: '/api/projects',
            tasks: '/api/tasks'
        }
    });
});

// ============================================
// SAFE ROUTE LOADING (skips missing files)
// ============================================
const routeFiles = [
    { path: '/api/auth', file: './routes/authRoutes' },
    { path: '/api/users', file: './routes/userRoutes' },
    { path: '/api/clients', file: './routes/clientRoutes' },
    { path: '/api/projects', file: './routes/projectRoutes' },
    { path: '/api/tasks', file: './routes/taskRoutes' },
    { path: '/api/time', file: './routes/timeRoutes' },
    { path: '/api/attendance', file: './routes/attendanceRoutes' },
    { path: '/api/leave', file: './routes/leaveRoutes' },
    { path: '/api/payroll', file: './routes/payrollRoutes' },
    { path: '/api/invoices', file: './routes/invoiceRoutes' },
    { path: '/api/meetings', file: './routes/meetingRoutes' },
    { path: '/api/files', file: './routes/fileRoutes' },
    { path: '/api/notifications', file: './routes/notificationRoutes' },
    { path: '/api/approvals', file: './routes/approvalRoutes' },
    { path: '/api/comments', file: './routes/commentRoutes' },
    { path: '/api/sprints', file: './routes/sprintRoutes' },
    { path: '/api/announcements', file: './routes/announcementRoutes' },
    { path: '/api/reports', file: './routes/reportRoutes' },
    { path: '/api/dashboard', file: './routes/dashboardRoutes' },
    { path: '/api/security', file: './routes/securityRoutes' },
    { path: '/api/rbac', file: './routes/rbacRoutes' },
    { path: '/api/search', file: './routes/searchRoutes' },
    { path: '/api/risk', file: './routes/riskRoutes' },
    { path: '/api/performance', file: './routes/performanceRoutes' },
    { path: '/api/audit', file: './routes/auditRoutes' },
    { path: '/api/workload', file: './routes/workloadRoutes' },
    { path: '/api/ai', file: './routes/aiRoutes' },
    { path: '/api/settings', file: './routes/settingsRoutes' },
    { path: '/api/recycle', file: './routes/recycleRoutes' },
    { path: '/api/health', file: './routes/healthRoutes' },
    { path: '/api/design', file: './routes/designRoutes' },
    { path: '/api/development', file: './routes/developmentRoutes' },
    { path: '/api/proposals', file: './routes/proposalRoutes' },
    { path: '/api/contracts', file: './routes/contractRoutes' },
    { path: '/api/finance', file: './routes/financeRoutes' },
    { path: '/api/payments', file: './routes/paymentRoutes' },
    { path: '/api/calendar', file: './routes/calendarRoutes' },
    { path: '/api/custom-fields', file: './routes/customFieldRoutes' },
    { path: '/api/import-export', file: './routes/importExportRoutes' }
];

routeFiles.forEach(({ path, file }) => {
    try {
        const route = require(file);
        if (route && typeof route === 'function') {
            app.use(path, route);
            console.log(`✅ Loaded route: ${path}`);
        } else if (route && typeof route === 'object') {
            app.use(path, route);
            console.log(`✅ Loaded route: ${path}`);
        } else {
            console.log(`⚠️ Route ${path} is not a valid middleware`);
        }
    } catch (err) {
        console.log(`⚠️ Route ${path} not loaded: ${err.message}`);
    }
});

// ============================================
// 404 HANDLER
// ============================================
app.use((req, res) => {
    res.status(404).json({
        error: 'Route not found',
        path: req.originalUrl,
        method: req.method
    });
});

// ============================================
// ERROR HANDLER
// ============================================
app.use((err, req, res, next) => {
    console.error('❌ Error:', err.message);
    console.error(err.stack);
    res.status(500).json({
        error: 'Internal server error',
        message: err.message,
        path: req.originalUrl
    });
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
    console.log(`🚀 ZinvainOS Backend running on port ${PORT}`);
    console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
});

module.exports = app;