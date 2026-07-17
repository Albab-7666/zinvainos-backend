module.exports = {
    // User Roles
    ROLES: {
        CEO: 'CEO',
        TEAM_MEMBER: 'TEAM_MEMBER',
        EMPLOYEE: 'EMPLOYEE'
    },

    // User Status
    USER_STATUS: {
        PENDING: 'PENDING',
        ACTIVE: 'ACTIVE',
        SUSPENDED: 'SUSPENDED'
    },

    // Task Status
    TASK_STATUS: {
        TODO: 'TODO',
        IN_PROGRESS: 'IN_PROGRESS',
        REVIEW: 'REVIEW',
        COMPLETED: 'COMPLETED',
        BLOCKED: 'BLOCKED'
    },

    // Task Priority
    TASK_PRIORITY: {
        LOW: 'LOW',
        MEDIUM: 'MEDIUM',
        HIGH: 'HIGH',
        CRITICAL: 'CRITICAL'
    },

    // Project Status
    PROJECT_STATUS: {
        PLANNING: 'PLANNING',
        ACTIVE: 'ACTIVE',
        ON_HOLD: 'ON_HOLD',
        COMPLETED: 'COMPLETED',
        ARCHIVED: 'ARCHIVED'
    },

    // Leave Types
    LEAVE_TYPES: {
        ANNUAL: 'ANNUAL',
        SICK: 'SICK',
        PERSONAL: 'PERSONAL',
        MATERNITY: 'MATERNITY',
        OTHER: 'OTHER'
    },

    // Leave Status
    LEAVE_STATUS: {
        PENDING: 'PENDING',
        APPROVED: 'APPROVED',
        REJECTED: 'REJECTED',
        CANCELLED: 'CANCELLED'
    },

    // Approval Status
    APPROVAL_STATUS: {
        PENDING: 'PENDING',
        APPROVED: 'APPROVED',
        REJECTED: 'REJECTED',
        CANCELLED: 'CANCELLED'
    },

    // Invoice Status
    INVOICE_STATUS: {
        DRAFT: 'DRAFT',
        SENT: 'SENT',
        PAID: 'PAID',
        OVERDUE: 'OVERDUE',
        CANCELLED: 'CANCELLED'
    },

    // Payroll Status
    PAYROLL_STATUS: {
        PENDING: 'PENDING',
        PROCESSED: 'PROCESSED',
        PAID: 'PAID'
    },

    // Notification Types
    NOTIFICATION_TYPES: {
        TASK: 'TASK',
        PROJECT: 'PROJECT',
        LEAVE: 'LEAVE',
        APPROVAL: 'APPROVAL',
        MESSAGE: 'MESSAGE',
        ANNOUNCEMENT: 'ANNOUNCEMENT',
        PERFORMANCE: 'PERFORMANCE',
        SYSTEM: 'SYSTEM'
    },

    // Module Names
    MODULES: {
        AUTH: 'AUTHENTICATION',
        SECURITY: 'SECURITY',
        RBAC: 'RBAC',
        DASHBOARD: 'DASHBOARD',
        USERS: 'USER_MANAGEMENT',
        CLIENTS: 'CLIENT_CRM',
        PROJECTS: 'PROJECT_MANAGEMENT',
        TASKS: 'TASK_MANAGEMENT',
        TIME: 'TIME_TRACKING',
        ATTENDANCE: 'ATTENDANCE',
        LEAVE: 'LEAVE_MANAGEMENT',
        PAYROLL: 'PAYROLL',
        INVOICES: 'INVOICE_SYSTEM',
        MEETINGS: 'MEETING_MANAGEMENT',
        FILES: 'FILE_STORAGE',
        NOTIFICATIONS: 'NOTIFICATION_CENTER',
        REPORTS: 'REPORTS_ANALYTICS',
        SETTINGS: 'SETTINGS'
    }
};