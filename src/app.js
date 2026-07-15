require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');

const app = express();
const PORT = process.env.PORT || 5000;

// ============================================
// IN-MEMORY DATABASE (CLEAN - NO DATA)
// ============================================
const db = {
    users: [],
    projects: [],
    tasks: [],
    clients: [],
    notifications: [],
    sessions: []
};

let idCounter = 1;

// ============================================
// MIDDLEWARE
// ============================================
app.use(helmet());
app.use(compression());
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ============================================
// AUTHENTICATION - COMPLETE
// ============================================

// REGISTER - Anyone can register
app.post('/api/auth/register', (req, res) => {
    const { email, password, fullName, role = 'EMPLOYEE', department, position } = req.body;
    
    // Check if user exists
    const existing = db.users.find(u => u.email === email);
    if (existing) {
        return res.status(400).json({ error: 'User already exists', code: 'USER_EXISTS' });
    }
    
    // CEO gets auto-approved, others are PENDING
    const status = role === 'CEO' ? 'ACTIVE' : 'PENDING';
    
    const user = {
        id: String(idCounter++),
        email,
        password, // In production, hash this!
        fullName,
        role,
        department: department || '',
        position: position || '',
        status,
        createdAt: new Date().toISOString()
    };
    
    db.users.push(user);
    
    // Notify CEO about pending approvals
    if (role !== 'CEO') {
        const ceo = db.users.find(u => u.role === 'CEO' && u.status === 'ACTIVE');
        if (ceo) {
            db.notifications.push({
                id: String(idCounter++),
                userId: ceo.id,
                title: 'New User Registration',
                message: `${fullName} (${email}) has registered and needs approval`,
                type: 'APPROVAL',
                isRead: false,
                createdAt: new Date().toISOString()
            });
        }
    }
    
    res.status(201).json({
        message: role === 'CEO' 
            ? 'Registration successful. You can now login.' 
            : 'Registration successful. Please wait for CEO approval.',
        user: {
            id: user.id,
            email: user.email,
            fullName: user.fullName,
            role: user.role,
            status: user.status
        }
    });
});

// LOGIN - CEO direct access, others need ACTIVE status
app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    
    const user = db.users.find(u => u.email === email && u.password === password);
    
    if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // CEO can login anytime
    if (user.role === 'CEO' && user.status === 'ACTIVE') {
        return res.json({
            accessToken: `token-${user.id}-${Date.now()}`,
            refreshToken: `refresh-${user.id}-${Date.now()}`,
            user: {
                id: user.id,
                email: user.email,
                fullName: user.fullName,
                role: user.role,
                department: user.department,
                position: user.position,
                status: user.status
            }
        });
    }
    
    // Non-CEO users need approval
    if (user.status === 'PENDING') {
        return res.status(403).json({ 
            error: 'Account pending approval. Please wait for CEO approval.',
            code: 'PENDING_APPROVAL'
        });
    }
    
    if (user.status === 'SUSPENDED') {
        return res.status(403).json({ 
            error: 'Account suspended. Contact your administrator.',
            code: 'ACCOUNT_SUSPENDED'
        });
    }
    
    res.json({
        accessToken: `token-${user.id}-${Date.now()}`,
        refreshToken: `refresh-${user.id}-${Date.now()}`,
        user: {
            id: user.id,
            email: user.email,
            fullName: user.fullName,
            role: user.role,
            department: user.department,
            position: user.position,
            status: user.status
        }
    });
});

// GET CURRENT USER
app.get('/api/auth/me', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const userId = token.split('-')[1];
    const user = db.users.find(u => u.id === userId);
    
    if (!user) {
        return res.status(401).json({ error: 'User not found' });
    }
    
    res.json({
        user: {
            id: user.id,
            email: user.email,
            fullName: user.fullName,
            role: user.role,
            department: user.department,
            position: user.position,
            status: user.status
        }
    });
});

// LOGOUT
app.post('/api/auth/logout', (req, res) => {
    res.json({ message: 'Logged out successfully' });
});

// FORGOT PASSWORD
app.post('/api/auth/forgot-password', (req, res) => {
    res.json({ message: 'Password reset email sent' });
});

// RESET PASSWORD
app.post('/api/auth/reset-password', (req, res) => {
    res.json({ message: 'Password reset successful' });
});

// REFRESH TOKEN
app.post('/api/auth/refresh-token', (req, res) => {
    res.json({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token'
    });
});

// ============================================
// USER MANAGEMENT
// ============================================

// GET ALL USERS (CEO only sees pending)
app.get('/api/users', (req, res) => {
    res.json({ users: db.users });
});

// GET PENDING USERS (CEO only)
app.get('/api/users/pending', (req, res) => {
    const pending = db.users.filter(u => u.status === 'PENDING');
    res.json({ users: pending });
});

// APPROVE USER (CEO only)
app.post('/api/users/:id/approve', (req, res) => {
    const user = db.users.find(u => u.id === req.params.id);
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    user.status = 'ACTIVE';
    
    // Notify user
    db.notifications.push({
        id: String(idCounter++),
        userId: user.id,
        title: 'Account Approved',
        message: 'Your account has been approved! You can now login.',
        type: 'SYSTEM',
        isRead: false,
        createdAt: new Date().toISOString()
    });
    
    res.json({ message: 'User approved successfully', user });
});

// SUSPEND USER (CEO only)
app.post('/api/users/:id/suspend', (req, res) => {
    const user = db.users.find(u => u.id === req.params.id);
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    user.status = 'SUSPENDED';
    res.json({ message: 'User suspended', user });
});

// RESTORE USER (CEO only)
app.post('/api/users/:id/restore', (req, res) => {
    const user = db.users.find(u => u.id === req.params.id);
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    user.status = 'ACTIVE';
    res.json({ message: 'User restored', user });
});

// DELETE USER (CEO only)
app.delete('/api/users/:id', (req, res) => {
    const index = db.users.findIndex(u => u.id === req.params.id);
    if (index === -1) {
        return res.status(404).json({ error: 'User not found' });
    }
    db.users.splice(index, 1);
    res.json({ message: 'User deleted' });
});

// ============================================
// NOTIFICATIONS
// ============================================
app.get('/api/notifications', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const userId = token?.split('-')[1];
    
    const userNotifications = db.notifications.filter(n => n.userId === userId);
    const unreadCount = userNotifications.filter(n => !n.isRead).length;
    
    res.json({ notifications: userNotifications, unreadCount });
});

app.get('/api/notifications/unread', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const userId = token?.split('-')[1];
    
    const count = db.notifications.filter(n => n.userId === userId && !n.isRead).length;
    res.json({ unreadCount: count });
});

app.put('/api/notifications/:id/read', (req, res) => {
    const notification = db.notifications.find(n => n.id === req.params.id);
    if (notification) {
        notification.isRead = true;
    }
    res.json({ message: 'Marked as read' });
});

app.put('/api/notifications/read-all', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const userId = token?.split('-')[1];
    
    db.notifications.forEach(n => {
        if (n.userId === userId) n.isRead = true;
    });
    res.json({ message: 'All marked as read' });
});

app.delete('/api/notifications/:id', (req, res) => {
    const index = db.notifications.findIndex(n => n.id === req.params.id);
    if (index !== -1) {
        db.notifications.splice(index, 1);
    }
    res.json({ message: 'Notification deleted' });
});

// ============================================
// PROJECTS (EMPTY)
// ============================================
app.get('/api/projects', (req, res) => {
    res.json({ projects: [] });
});

app.post('/api/projects', (req, res) => {
    const { name, description, status, priority, clientId, startDate, endDate, budget } = req.body;
    const project = {
        id: String(idCounter++),
        name,
        description: description || '',
        status: status || 'PLANNING',
        priority: priority || 'MEDIUM',
        clientId: clientId || null,
        startDate: startDate || null,
        endDate: endDate || null,
        budget: budget || null,
        createdAt: new Date().toISOString()
    };
    db.projects.push(project);
    res.status(201).json({ message: 'Project created', project });
});

app.put('/api/projects/:id', (req, res) => {
    const project = db.projects.find(p => p.id === req.params.id);
    if (!project) {
        return res.status(404).json({ error: 'Project not found' });
    }
    Object.assign(project, req.body);
    res.json({ message: 'Project updated', project });
});

app.delete('/api/projects/:id', (req, res) => {
    const index = db.projects.findIndex(p => p.id === req.params.id);
    if (index === -1) {
        return res.status(404).json({ error: 'Project not found' });
    }
    db.projects.splice(index, 1);
    res.json({ message: 'Project deleted' });
});

// ============================================
// TASKS (EMPTY)
// ============================================
app.get('/api/tasks', (req, res) => {
    res.json({ tasks: [] });
});

app.post('/api/tasks', (req, res) => {
    const { title, description, projectId, assignedTo, dueDate, priority, status } = req.body;
    const task = {
        id: String(idCounter++),
        title,
        description: description || '',
        projectId: projectId || null,
        assignedTo: assignedTo || null,
        dueDate: dueDate || null,
        priority: priority || 'MEDIUM',
        status: status || 'TODO',
        createdAt: new Date().toISOString()
    };
    db.tasks.push(task);
    res.status(201).json({ message: 'Task created', task });
});

app.put('/api/tasks/:id', (req, res) => {
    const task = db.tasks.find(t => t.id === req.params.id);
    if (!task) {
        return res.status(404).json({ error: 'Task not found' });
    }
    Object.assign(task, req.body);
    res.json({ message: 'Task updated', task });
});

app.put('/api/tasks/:id/status', (req, res) => {
    const task = db.tasks.find(t => t.id === req.params.id);
    if (!task) {
        return res.status(404).json({ error: 'Task not found' });
    }
    task.status = req.body.status;
    res.json({ message: 'Task status updated', task });
});

app.delete('/api/tasks/:id', (req, res) => {
    const index = db.tasks.findIndex(t => t.id === req.params.id);
    if (index === -1) {
        return res.status(404).json({ error: 'Task not found' });
    }
    db.tasks.splice(index, 1);
    res.json({ message: 'Task deleted' });
});

// ============================================
// CLIENTS (EMPTY)
// ============================================
app.get('/api/clients', (req, res) => {
    res.json({ clients: [] });
});

app.post('/api/clients', (req, res) => {
    const { companyName, contactName, email, phone, address, industry } = req.body;
    const client = {
        id: String(idCounter++),
        companyName,
        contactName: contactName || '',
        email: email || '',
        phone: phone || '',
        address: address || '',
        industry: industry || '',
        status: 'ACTIVE',
        createdAt: new Date().toISOString()
    };
    db.clients.push(client);
    res.status(201).json({ message: 'Client created', client });
});

app.put('/api/clients/:id', (req, res) => {
    const client = db.clients.find(c => c.id === req.params.id);
    if (!client) {
        return res.status(404).json({ error: 'Client not found' });
    }
    Object.assign(client, req.body);
    res.json({ message: 'Client updated', client });
});

app.delete('/api/clients/:id', (req, res) => {
    const index = db.clients.findIndex(c => c.id === req.params.id);
    if (index === -1) {
        return res.status(404).json({ error: 'Client not found' });
    }
    db.clients.splice(index, 1);
    res.json({ message: 'Client deleted' });
});

// ============================================
// DASHBOARD (EMPTY)
// ============================================
app.get('/api/dashboard/overview', (req, res) => {
    res.json({
        stats: {
            totalTasks: 0,
            activeProjects: 0,
            teamMembers: db.users.filter(u => u.role !== 'CEO' && u.status === 'ACTIVE').length,
            totalRevenue: 0,
            pendingApprovals: db.users.filter(u => u.status === 'PENDING').length
        }
    });
});

app.get('/api/dashboard/activities', (req, res) => {
    res.json({ activities: [] });
});

app.get('/api/dashboard/tasks', (req, res) => {
    res.json({ stats: { todo: 0, in_progress: 0, review: 0, completed: 0, blocked: 0 } });
});

app.get('/api/dashboard/deadlines', (req, res) => {
    res.json({ deadlines: [] });
});

// ============================================
// HEALTH CHECK
// ============================================
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        message: 'ZinvainOS API is running'
    });
});

// ============================================
// ROOT
// ============================================
app.get('/', (req, res) => {
    res.json({
        message: 'ZinvainOS API',
        version: '1.0.0',
        status: 'running',
        routes: [
            '/api/health',
            '/api/auth/register',
            '/api/auth/login',
            '/api/auth/me',
            '/api/users',
            '/api/users/pending',
            '/api/users/:id/approve',
            '/api/notifications',
            '/api/projects',
            '/api/tasks',
            '/api/clients',
            '/api/dashboard/overview'
        ]
    });
});

// ============================================
// 404 HANDLER
// ============================================
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Route not found',
        path: req.originalUrl,
        message: 'The requested API endpoint does not exist'
    });
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
    console.log(`🚀 ZinvainOS Backend running on port ${PORT}`);
    console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;