const Notification = require('../models/Notification');
const EmailService = require('./emailService');

class NotificationService {
    async notify(userId, title, message, type, link = null) {
        // Create in-app notification
        return await Notification.create({ userId, title, message, type, link });
    }

    async notifyMultiple(userIds, title, message, type, link = null) {
        const notifications = [];
        for (const userId of userIds) {
            const notification = await this.notify(userId, title, message, type, link);
            notifications.push(notification);
        }
        return notifications;
    }

    async notifyTeam(teamIds, title, message, type, link = null) {
        return this.notifyMultiple(teamIds, title, message, type, link);
    }

    async sendEmailNotification(email, subject, html) {
        return await EmailService.sendEmail({
            to: email,
            subject,
            html
        });
    }

    async notifyTaskAssigned(taskId, title, assignedTo, createdBy) {
        const message = `You have been assigned to task: ${title}`;
        return this.notify(assignedTo, 'New Task Assigned', message, 'TASK', `/tasks/${taskId}`);
    }

    async notifyTaskCompleted(taskId, title, assignedTo, completedBy) {
        const message = `Task "${title}" has been completed`;
        return this.notify(assignedTo, 'Task Completed', message, 'TASK', `/tasks/${taskId}`);
    }

    async notifyLeaveRequest(leaveId, userId, status) {
        const message = `Your leave request has been ${status}`;
        return this.notify(userId, 'Leave Request Updated', message, 'LEAVE', `/leave/${leaveId}`);
    }

    async notifyApprovalRequest(approvalId, requestedBy, moduleType) {
        const message = `${requestedBy} submitted a ${moduleType} request for approval`;
        return this.notify(requestedBy, 'Approval Request', message, 'APPROVAL', `/approvals/${approvalId}`);
    }

    async notifyProjectUpdate(projectId, name, updateType) {
        // Get project members
        // Notify all members
        return this.notifyMultiple([], `Project ${updateType}`, `Project "${name}" has been updated`, 'PROJECT', `/projects/${projectId}`);
    }
}

module.exports = new NotificationService();