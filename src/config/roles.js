// Role definitions with permissions
const ROLES = {
    CEO: {
        name: 'CEO',
        level: 3,
        permissions: {
            all: true, // Super admin access
            modules: [
                'authentication', 'security', 'rbac', 'dashboard', 'user_management',
                'client_crm', 'project_management', 'graphic_design', 'software_dev',
                'sprint_management', 'task_management', 'recurring_tasks', 'time_tracking',
                'team_communication', 'meeting_management', 'file_storage', 'approval_workflow',
                'proposal_quotation', 'contract_management', 'finance_accounting', 'payment_tracking',
                'invoice_system', 'payroll', 'attendance', 'leave_management', 'calendar',
                'notification_center', 'global_search', 'reports_analytics', 'risk_alert',
                'performance_evaluation', 'announcement_board', 'audit_logs', 'team_workload',
                'ai_assistant', 'custom_fields', 'import_export', 'recycle_bin',
                'system_health', 'settings', 'premium_ui', 'technical_architecture'
            ]
        }
    },
    TEAM_MEMBER: {
        name: 'Team Member / Manager',
        level: 2,
        permissions: {
            modules: {
                'authentication': 'full',
                'dashboard': 'full',
                'user_management': 'limited',
                'client_crm': 'limited',
                'project_management': 'full',
                'graphic_design': 'full',
                'software_dev': 'full',
                'sprint_management': 'full',
                'task_management': 'full',
                'recurring_tasks': 'limited',
                'time_tracking': 'full',
                'team_communication': 'full',
                'meeting_management': 'full',
                'file_storage': 'full',
                'approval_workflow': 'full',
                'proposal_quotation': 'limited',
                'contract_management': 'limited',
                'finance_accounting': 'none',
                'payment_tracking': 'limited',
                'invoice_system': 'limited',
                'payroll': 'none',
                'attendance': 'full',
                'leave_management': 'full',
                'calendar': 'full',
                'notification_center': 'full',
                'global_search': 'limited',
                'reports_analytics': 'limited',
                'risk_alert': 'limited',
                'performance_evaluation': 'limited',
                'announcement_board': 'limited',
                'audit_logs': 'none',
                'team_workload': 'full',
                'ai_assistant': 'limited',
                'import_export': 'limited',
                'settings': 'none',
                'premium_ui': 'full',
                'security': 'none',
                'rbac': 'none',
                'custom_fields': 'none',
                'recycle_bin': 'none',
                'system_health': 'none',
                'technical_architecture': 'none'
            }
        }
    },
    EMPLOYEE: {
        name: 'Employee',
        level: 1,
        permissions: {
            modules: {
                'authentication': 'full',
                'dashboard': 'full',
                'user_management': 'none',
                'client_crm': 'none',
                'project_management': 'limited',
                'graphic_design': 'limited',
                'software_dev': 'limited',
                'sprint_management': 'limited',
                'task_management': 'limited',
                'recurring_tasks': 'none',
                'time_tracking': 'full',
                'team_communication': 'full',
                'meeting_management': 'limited',
                'file_storage': 'limited',
                'approval_workflow': 'limited',
                'proposal_quotation': 'none',
                'contract_management': 'none',
                'finance_accounting': 'none',
                'payment_tracking': 'none',
                'invoice_system': 'none',
                'payroll': 'none',
                'attendance': 'full',
                'leave_management': 'full',
                'calendar': 'full',
                'notification_center': 'full',
                'global_search': 'limited',
                'reports_analytics': 'none',
                'risk_alert': 'none',
                'performance_evaluation': 'limited',
                'announcement_board': 'limited',
                'audit_logs': 'none',
                'team_workload': 'none',
                'ai_assistant': 'limited',
                'import_export': 'none',
                'recycle_bin': 'none',
                'settings': 'none',
                'premium_ui': 'full',
                'security': 'none',
                'rbac': 'none',
                'custom_fields': 'none',
                'system_health': 'none',
                'technical_architecture': 'none'
            }
        }
    }
};

// Helper function to check if user has module access
function hasModuleAccess(role, moduleName, accessLevel = 'full') {
    const roleConfig = ROLES[role];
    if (!roleConfig) return false;
    
    if (role === 'CEO') return true;
    
    const moduleAccess = roleConfig.permissions.modules[moduleName];
    if (!moduleAccess) return false;
    
    if (accessLevel === 'full') {
        return moduleAccess === 'full';
    }
    
    return moduleAccess === 'full' || moduleAccess === 'limited';
}

// Helper function to check if user has permission
function hasPermission(role, moduleName, permission) {
    const roleConfig = ROLES[role];
    if (!roleConfig) return false;
    
    if (role === 'CEO') return true;
    
    const moduleAccess = roleConfig.permissions.modules[moduleName];
    if (!moduleAccess) return false;
    
    if (permission === 'read') {
        return moduleAccess === 'full' || moduleAccess === 'limited';
    }
    
    if (permission === 'write') {
        return moduleAccess === 'full';
    }
    
    return false;
}

module.exports = {
    ROLES,
    hasModuleAccess,
    hasPermission
};