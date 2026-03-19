const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const { User, Role, JobAssignment, ModuleAccessRule } = require('../models');

const ADMIN_ROLES = ['super_admin', 'hr_manager'];
const JWT_SECRET = process.env.JWT_SECRET || 'recruitment-system-dev-secret';

const getRoleCode = (user) => user?.Role?.code || '';

const hasRole = (user, roles) => roles.includes(getRoleCode(user));

const moduleAccessCache = {
  loadedAt: 0,
  map: new Map()
};

const MODULE_CACHE_TTL_MS = 60 * 1000;

const loadModuleAccessRules = async () => {
  const now = Date.now();
  if (moduleAccessCache.map.size && now - moduleAccessCache.loadedAt < MODULE_CACHE_TTL_MS) {
    return moduleAccessCache.map;
  }

  if (!ModuleAccessRule) {
    moduleAccessCache.map = new Map();
    moduleAccessCache.loadedAt = now;
    return moduleAccessCache.map;
  }

  try {
    const rules = await ModuleAccessRule.findAll();
    const map = new Map();
    for (const rule of rules) {
      const grants = Array.isArray(rule.grant_modules)
        ? rule.grant_modules.filter((item) => typeof item === 'string' && item.trim())
        : [];
      map.set(rule.module_code, grants);
    }
    moduleAccessCache.map = map;
    moduleAccessCache.loadedAt = now;
    return map;
  } catch (error) {
    moduleAccessCache.map = new Map();
    moduleAccessCache.loadedAt = now;
    return moduleAccessCache.map;
  }
};

const hasModulePermission = async (user, modules) => {
  if (!user) {
    return false;
  }
  const permissions = user.module_permissions;
  if (!Array.isArray(permissions) || permissions.length === 0) {
    return true;
  }
  const requiredModules = Array.isArray(modules) ? modules : [modules];
  if (requiredModules.some((moduleCode) => permissions.includes(moduleCode))) {
    return true;
  }

  const accessRules = await loadModuleAccessRules();
  return requiredModules.some((moduleCode) => {
    const grants = accessRules.get(moduleCode) || [];
    return grants.some((grant) => permissions.includes(grant));
  });
};

const loadCurrentUser = async (req, res, next) => {
  try {
    const authorization = req.header('authorization') || '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';

    if (!token) {
      req.currentUser = null;
      return next();
    }

    const payload = jwt.verify(token, JWT_SECRET);

    req.currentUser = await User.findOne({
      where: { id: payload.userId, status: 'active' },
      include: [{ model: Role }]
    });

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      req.currentUser = null;
      return next();
    }

    res.status(500).json({ message: '解析当前登录人员失败。', error: error.message });
  }
};

const requireAuth = (req, res, next) => {
  if (!req.currentUser) {
    return res.status(401).json({ message: '请先登录后再访问。' });
  }

  next();
};

const requireRoles = (roles) => (req, res, next) => {
  if (!req.currentUser) {
    return res.status(401).json({ message: '当前登录状态无效，请重新登录。' });
  }

  if (!hasRole(req.currentUser, roles)) {
    return res.status(403).json({ message: 'You do not have permission to perform this action.' });
  }

  next();
};

const requireModules = (modules) => async (req, res, next) => {
  if (!req.currentUser) {
    return res.status(401).json({ message: '当前登录状态无效，请重新登录。' });
  }

  if (!(await hasModulePermission(req.currentUser, modules))) {
    return res.status(403).json({ message: '当前账号无权访问该模块。' });
  }

  next();
};

const getScopedJobIds = async (user, assignmentTypes = ['reviewer', 'interviewer', 'both']) => {
  if (!user) {
    return [];
  }

  if (hasRole(user, ADMIN_ROLES)) {
    return null;
  }

  const assignments = await JobAssignment.findAll({
    where: {
      user_id: user.id,
      assignment_type: {
        [Op.in]: assignmentTypes
      }
    }
  });

  return assignments.map((item) => item.job_id);
};

module.exports = {
  ADMIN_ROLES,
  getRoleCode,
  hasRole,
  hasModulePermission,
  loadCurrentUser,
  requireAuth,
  requireRoles,
  requireModules,
  getScopedJobIds,
  JWT_SECRET
};
