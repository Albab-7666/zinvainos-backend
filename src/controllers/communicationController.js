const { pool } = require('../config/database');
const { logger } = require('../utils/logger');

class CommunicationController {
    // Create workspace
    async createWorkspace(req, res) {
        try {
            const { name, description, type = 'TEAM' } = req.body;
            
            const result = await pool.query(
                `INSERT INTO workspaces (name, description, type, created_by)
                 VALUES ($1, $2, $3, $4)
                 RETURNING *`,
                [name, description, type, req.user.id]
            );
            
            // Add creator as member
            await pool.query(
                `INSERT INTO workspace_members (workspace_id, user_id, role)
                 VALUES ($1, $2, 'ADMIN')`,
                [result.rows[0].id, req.user.id]
            );
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'CREATE_WORKSPACE', 'TEAM_COMMUNICATION', 
                 JSON.stringify({ workspaceId: result.rows[0].id, name }), req.ip]
            );
            
            res.status(201).json({
                message: 'Workspace created successfully',
                workspace: result.rows[0]
            });
            
        } catch (error) {
            logger.error('Create workspace error:', error);
            res.status(500).json({
                error: 'Failed to create workspace',
                code: 'CREATE_WORKSPACE_ERROR'
            });
        }
    }

    // Get workspaces
    async getWorkspaces(req, res) {
        try {
            const result = await pool.query(
                `SELECT w.*, 
                        COUNT(wm.id) as member_count,
                        u.full_name as created_by_name
                 FROM workspaces w
                 LEFT JOIN workspace_members wm ON w.id = wm.workspace_id
                 LEFT JOIN users u ON w.created_by = u.id
                 WHERE w.id IN (
                     SELECT workspace_id FROM workspace_members WHERE user_id = $1
                 )
                 GROUP BY w.id, u.full_name
                 ORDER BY w.created_at DESC`,
                [req.user.id]
            );
            
            res.json({ workspaces: result.rows });
            
        } catch (error) {
            logger.error('Get workspaces error:', error);
            res.status(500).json({
                error: 'Failed to get workspaces',
                code: 'GET_WORKSPACES_ERROR'
            });
        }
    }

    // Send message
    async sendMessage(req, res) {
        try {
            const { workspaceId, content, parentId = null } = req.body;
            
            // Check if user is member of workspace
            const memberCheck = await pool.query(
                'SELECT id FROM workspace_members WHERE workspace_id = $1 AND user_id = $2',
                [workspaceId, req.user.id]
            );
            
            if (memberCheck.rows.length === 0) {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            }
            
            const result = await pool.query(
                `INSERT INTO workspace_messages (workspace_id, user_id, content, parent_id)
                 VALUES ($1, $2, $3, $4)
                 RETURNING *`,
                [workspaceId, req.user.id, content, parentId]
            );
            
            // Get user info
            const userResult = await pool.query(
                'SELECT full_name, avatar_url FROM users WHERE id = $1',
                [req.user.id]
            );
            
            const message = {
                ...result.rows[0],
                user: userResult.rows[0]
            };
            
            // Notify other members
            const members = await pool.query(
                `SELECT user_id FROM workspace_members WHERE workspace_id = $1 AND user_id != $2`,
                [workspaceId, req.user.id]
            );
            
            for (const member of members.rows) {
                await pool.query(
                    `INSERT INTO notifications (user_id, title, message, type, link, created_at)
                     VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
                    [member.user_id, 'New Message', 
                     `${userResult.rows[0].full_name} sent a message in ${workspaceId}`,
                     'MESSAGE', `/workspace/${workspaceId}`]
                );
            }
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'SEND_MESSAGE', 'TEAM_COMMUNICATION', 
                 JSON.stringify({ workspaceId, messageId: result.rows[0].id }), req.ip]
            );
            
            res.status(201).json({
                message: 'Message sent successfully',
                data: message
            });
            
        } catch (error) {
            logger.error('Send message error:', error);
            res.status(500).json({
                error: 'Failed to send message',
                code: 'SEND_MESSAGE_ERROR'
            });
        }
    }

    // Get messages
    async getMessages(req, res) {
        try {
            const { workspaceId } = req.params;
            const { limit = 50, offset = 0 } = req.query;
            
            // Check if user is member
            const memberCheck = await pool.query(
                'SELECT id FROM workspace_members WHERE workspace_id = $1 AND user_id = $2',
                [workspaceId, req.user.id]
            );
            
            if (memberCheck.rows.length === 0) {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            }
            
            const result = await pool.query(
                `SELECT wm.*, 
                        u.full_name as user_name,
                        u.avatar_url as user_avatar
                 FROM workspace_messages wm
                 LEFT JOIN users u ON wm.user_id = u.id
                 WHERE wm.workspace_id = $1
                 ORDER BY wm.created_at DESC
                 LIMIT $2 OFFSET $3`,
                [workspaceId, parseInt(limit), parseInt(offset)]
            );
            
            // Get replies for each message
            const messages = await Promise.all(result.rows.map(async (message) => {
                const replies = await pool.query(
                    `SELECT wm.*, 
                            u.full_name as user_name,
                            u.avatar_url as user_avatar
                     FROM workspace_messages wm
                     LEFT JOIN users u ON wm.user_id = u.id
                     WHERE wm.parent_id = $1
                     ORDER BY wm.created_at ASC`,
                    [message.id]
                );
                message.replies = replies.rows;
                return message;
            }));
            
            res.json({ messages });
            
        } catch (error) {
            logger.error('Get messages error:', error);
            res.status(500).json({
                error: 'Failed to get messages',
                code: 'GET_MESSAGES_ERROR'
            });
        }
    }

    // Add member to workspace
    async addMember(req, res) {
        try {
            const { workspaceId } = req.params;
            const { userId, role = 'MEMBER' } = req.body;
            
            // Check if user is admin
            const adminCheck = await pool.query(
                'SELECT id FROM workspace_members WHERE workspace_id = $1 AND user_id = $2 AND role = $3',
                [workspaceId, req.user.id, 'ADMIN']
            );
            
            if (adminCheck.rows.length === 0 && req.user.role !== 'CEO') {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            }
            
            const result = await pool.query(
                `INSERT INTO workspace_members (workspace_id, user_id, role)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = $3
                 RETURNING *`,
                [workspaceId, userId, role]
            );
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'ADD_WORKSPACE_MEMBER', 'TEAM_COMMUNICATION', 
                 JSON.stringify({ workspaceId, userId, role }), req.ip]
            );
            
            res.json({
                message: 'Member added successfully',
                member: result.rows[0]
            });
            
        } catch (error) {
            logger.error('Add member error:', error);
            res.status(500).json({
                error: 'Failed to add member',
                code: 'ADD_MEMBER_ERROR'
            });
        }
    }

    // Remove member from workspace
    async removeMember(req, res) {
        try {
            const { workspaceId, userId } = req.params;
            
            // Check if user is admin
            const adminCheck = await pool.query(
                'SELECT id FROM workspace_members WHERE workspace_id = $1 AND user_id = $2 AND role = $3',
                [workspaceId, req.user.id, 'ADMIN']
            );
            
            if (adminCheck.rows.length === 0 && req.user.role !== 'CEO') {
                return res.status(403).json({
                    error: 'Access denied',
                    code: 'ACCESS_DENIED'
                });
            }
            
            const result = await pool.query(
                'DELETE FROM workspace_members WHERE workspace_id = $1 AND user_id = $2 RETURNING id',
                [workspaceId, userId]
            );
            
            if (result.rows.length === 0) {
                return res.status(404).json({
                    error: 'Member not found',
                    code: 'MEMBER_NOT_FOUND'
                });
            }
            
            await pool.query(
                `INSERT INTO activity_logs (user_id, action, module, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'REMOVE_WORKSPACE_MEMBER', 'TEAM_COMMUNICATION', 
                 JSON.stringify({ workspaceId, userId }), req.ip]
            );
            
            res.json({
                message: 'Member removed successfully'
            });
            
        } catch (error) {
            logger.error('Remove member error:', error);
            res.status(500).json({
                error: 'Failed to remove member',
                code: 'REMOVE_MEMBER_ERROR'
            });
        }
    }
}

module.exports = new CommunicationController();