const { hasModuleAccess, hasPermission } = require('../config/roles');

// Check if user has access to a module
function checkModuleAccess(moduleName, accessLevel = 'full') {
    return (req, res, next) => {
        const userRole = req.user?.role;
        
        if (!userRole) {
            return res.status(403).json({
                error: 'Access denied',
                code: 'ACCESS_DENIED'
            });
        }
        
        const hasAccess = hasModuleAccess(userRole, moduleName, accessLevel);
        
        if (!hasAccess) {
            return res.status(403).json({
                error: `Access denied to module: ${moduleName}`,
                code: 'MODULE_ACCESS_DENIED'
            });
        }
        
        next();
    };
}

// Check if user has specific permission
function checkPermission(moduleName, permission) {
    return (req, res, next) => {
        const userRole = req.user?.role;
        
        if (!userRole) {
            return res.status(403).json({
                error: 'Access denied',
                code: 'ACCESS_DENIED'
            });
        }
        
        const hasPerm = hasPermission(userRole, moduleName, permission);
        
        if (!hasPerm) {
            return res.status(403).json({
                error: `Permission denied for: ${permission} on ${moduleName}`,
                code: 'PERMISSION_DENIED'
            });
        }
        
        next();
    };
}

// Role-based middleware
function requireRole(allowedRoles) {
    return (req, res, next) => {
        const userRole = req.user?.role;
        
        if (!userRole) {
            return res.status(403).json({
                error: 'Access denied',
                code: 'ACCESS_DENIED'
            });
        }
        
        if (!allowedRoles.includes(userRole)) {
            return res.status(403).json({
                error: `Role ${userRole} is not allowed`,
                code: 'ROLE_NOT_ALLOWED'
            });
        }
        
        next();
    };
}

// CEO only middleware
function ceoOnly(req, res, next) {
    if (req.user?.role !== 'CEO') {
        return res.status(403).json({
            error: 'CEO access required',
            code: 'CEO_ONLY'
        });
    }
    next();
}

// NEW: Simple RBAC helper (additional)
const rbac = (allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Access denied' });
        }
        next();
    };
};

module.exports = {
    checkModuleAccess,
    checkPermission,
    requireRole,
    ceoOnly,
    rbac   // ← NEW: Added this
};