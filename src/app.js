require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const bcrypt = require('bcryptjs');
const { pool } = require('./config/database');
const { authenticate } = require('./middleware/auth');
const { ceoOnly } = require('./middleware/rbac');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(helmet());
app.use(compression());
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));

// ===================== HEALTH =====================
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// ===================== AUTH =====================
app.post('/api/auth/register', async (req, res) => {
    const { email, password, fullName, role } = req.body;
    try {
        const existing = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (existing.rows.length > 0) {
            return res.status(400).json({ error: 'User already exists' });
        }
        const passwordHash = await bcrypt.hash(password, 12);
        const status = role === 'CEO' ? 'ACTIVE' : 'PENDING';
        const result = await pool.query(
            `INSERT INTO users (email, password_hash, full_name, role, status)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, email, full_name, role, status`,
            [email, passwordHash, fullName, role || 'EMPLOYEE', status]
        );
        res.status(201).json({ message: status === 'ACTIVE' ? 'Registration successful' : 'Pending approval', user: result.rows[0] });
    } catch (error) {
        res.status(500).json({ error: 'Registration failed' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
        const user = result.rows[0];
        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
        if (user.status === 'PENDING') return res.status(403).json({ error: 'Account pending approval' });
        if (user.status === 'SUSPENDED') return res.status(403).json({ error: 'Account suspended' });
        res.json({
            accessToken: `token-${user.id}`,
            user: { id: user.id, email: user.email, fullName: user.full_name, role: user.role, status: user.status }
        });
    } catch (error) {
        res.status(500).json({ error: 'Login failed' });
    }
});

app.get('/api/auth/me', authenticate, (req, res) => {
    res.json({ user: req.user });
});

app.post('/api/auth/logout', (req, res) => {
    res.json({ message: 'Logged out' });
});

// ===================== USERS =====================
app.get('/api/users', authenticate, ceoOnly, async (req, res) => {
    const result = await pool.query('SELECT id, email, full_name, role, status FROM users');
    res.json({ users: result.rows });
});

app.get('/api/users/pending', authenticate, ceoOnly, async (req, res) => {
    const result = await pool.query('SELECT id, email, full_name, role FROM users WHERE status = $1', ['PENDING']);
    res.json({ users: result.rows });
});

app.post('/api/users/:id/approve', authenticate, ceoOnly, async (req, res) => {
    await pool.query('UPDATE users SET status = $1 WHERE id = $2', ['ACTIVE', req.params.id]);
    res.json({ message: 'User approved' });
});

app.post('/api/users/:id/suspend', authenticate, ceoOnly, async (req, res) => {
    await pool.query('UPDATE users SET status = $1 WHERE id = $2', ['SUSPENDED', req.params.id]);
    res.json({ message: 'User suspended' });
});

app.post('/api/users/:id/restore', authenticate, ceoOnly, async (req, res) => {
    await pool.query('UPDATE users SET status = $1 WHERE id = $2', ['ACTIVE', req.params.id]);
    res.json({ message: 'User restored' });
});

app.delete('/api/users/:id', authenticate, ceoOnly, async (req, res) => {
    await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    res.json({ message: 'User deleted' });
});

// ===================== NOTIFICATIONS =====================
app.get('/api/notifications', authenticate, async (req, res) => {
    const result = await pool.query('SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id]);
    res.json({ notifications: result.rows });
});

app.put('/api/notifications/:id/read', authenticate, async (req, res) => {
    await pool.query('UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    res.json({ message: 'Marked as read' });
});

// ===================== PROJECTS =====================
app.get('/api/projects', authenticate, async (req, res) => {
    const result = await pool.query('SELECT * FROM projects ORDER BY created_at DESC');
    res.json({ projects: result.rows });
});

app.post('/api/projects', authenticate, async (req, res) => {
    const { name, description, status, priority } = req.body;
    const result = await pool.query(
        `INSERT INTO projects (name, description, status, priority, created_by)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [name, description, status || 'PLANNING', priority || 'MEDIUM', req.user.id]
    );
    res.status(201).json({ project: result.rows[0] });
});

app.put('/api/projects/:id', authenticate, async (req, res) => {
    const { name, description, status, priority } = req.body;
    await pool.query(
        `UPDATE projects SET name = $1, description = $2, status = $3, priority = $4 WHERE id = $5`,
        [name, description, status, priority, req.params.id]
    );
    res.json({ message: 'Project updated' });
});

app.delete('/api/projects/:id', authenticate, async (req, res) => {
    await pool.query('DELETE FROM projects WHERE id = $1', [req.params.id]);
    res.json({ message: 'Project deleted' });
});

// ===================== TASKS =====================
app.get('/api/tasks', authenticate, async (req, res) => {
    const result = await pool.query('SELECT * FROM tasks ORDER BY created_at DESC');
    res.json({ tasks: result.rows });
});

app.post('/api/tasks', authenticate, async (req, res) => {
    const { title, description, projectId, assignedTo, dueDate, priority, status } = req.body;
    const result = await pool.query(
        `INSERT INTO tasks (title, description, project_id, assigned_to, due_date, priority, status, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [title, description, projectId, assignedTo, dueDate, priority || 'MEDIUM', status || 'TODO', req.user.id]
    );
    res.status(201).json({ task: result.rows[0] });
});

app.put('/api/tasks/:id', authenticate, async (req, res) => {
    const { title, description, status, priority } = req.body;
    await pool.query(
        `UPDATE tasks SET title = $1, description = $2, status = $3, priority = $4 WHERE id = $5`,
        [title, description, status, priority, req.params.id]
    );
    res.json({ message: 'Task updated' });
});

app.put('/api/tasks/:id/status', authenticate, async (req, res) => {
    await pool.query('UPDATE tasks SET status = $1 WHERE id = $2', [req.body.status, req.params.id]);
    res.json({ message: 'Status updated' });
});

app.delete('/api/tasks/:id', authenticate, async (req, res) => {
    await pool.query('DELETE FROM tasks WHERE id = $1', [req.params.id]);
    res.json({ message: 'Task deleted' });
});

// ===================== CLIENTS =====================
app.get('/api/clients', authenticate, async (req, res) => {
    const result = await pool.query('SELECT * FROM clients ORDER BY created_at DESC');
    res.json({ clients: result.rows });
});

app.post('/api/clients', authenticate, async (req, res) => {
    const { companyName, contactName, email, phone, address, industry } = req.body;
    const result = await pool.query(
        `INSERT INTO clients (company_name, contact_name, email, phone, address, industry, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [companyName, contactName, email, phone, address, industry, req.user.id]
    );
    res.status(201).json({ client: result.rows[0] });
});

app.delete('/api/clients/:id', authenticate, async (req, res) => {
    await pool.query('DELETE FROM clients WHERE id = $1', [req.params.id]);
    res.json({ message: 'Client deleted' });
});

// ===================== DASHBOARD =====================
app.get('/api/dashboard/overview', authenticate, async (req, res) => {
    const users = await pool.query('SELECT COUNT(*) FROM users');
    const tasks = await pool.query('SELECT COUNT(*) FROM tasks');
    const projects = await pool.query('SELECT COUNT(*) FROM projects');
    res.json({
        stats: {
            totalUsers: parseInt(users.rows[0].count),
            totalTasks: parseInt(tasks.rows[0].count),
            totalProjects: parseInt(projects.rows[0].count)
        }
    });
});

// ===================== ROOT =====================
app.get('/', (req, res) => {
    res.json({ message: 'ZinvainOS API', version: '1.0.0', status: 'running' });
});

// ===================== 404 =====================
app.use('*', (req, res) => {
    res.status(404).json({ error: 'Route not found', path: req.originalUrl });
});

app.listen(PORT, () => {
    console.log(`🚀 ZinvainOS Backend running on port ${PORT}`);
});