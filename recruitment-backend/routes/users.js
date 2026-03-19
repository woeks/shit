const express = require('express');
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const {
  InterviewSchedule,
  Job,
  JobAssignment,
  JobPlatformRecord,
  LoginAudit,
  PlatformAccount,
  PlatformSyncLog,
  Resume,
  ResumeStageLog,
  Role,
  User,
  sequelize
} = require('../models');
const { requireModules, requireRoles } = require('../middleware/auth');

const router = express.Router();

const HR_MANAGER_DEFAULT_MODULES = [
  'dashboard',
  'jobs',
  'resumes',
  'screening',
  'review',
  'scheduling',
  'interviews',
  'offers',
  'talent_pool',
  'reports'
];

const normalizeAssignments = (assignments = []) =>
  assignments
    .filter((item) => item?.job_id && item?.assignment_type)
    .map((item) => ({
      job_id: item.job_id,
      assignment_type: item.assignment_type
    }));

const normalizeModulePermissions = (modules) => {
  if (!Array.isArray(modules)) {
    return null;
  }

  return modules
    .filter((item) => typeof item === 'string' && item.trim())
    .map((item) => item.trim());
};

router.get('/', requireModules('people'), requireRoles(['super_admin', 'hr_manager']), async (req, res) => {
  try {
    const where = {};

    if (req.query.status && req.query.status !== 'all') {
      where.status = req.query.status;
    }

    if (req.query.role_id) {
      where.role_id = req.query.role_id;
    }

    if (req.query.keyword) {
      where[Op.or] = [
        { username: { [Op.iLike]: `%${req.query.keyword}%` } },
        { name: { [Op.iLike]: `%${req.query.keyword}%` } },
        { email: { [Op.iLike]: `%${req.query.keyword}%` } }
      ];
    }

    const users = await User.findAll({
      where,
      include: [
        { model: Role },
        {
          model: JobAssignment,
          include: [{ model: Job }]
        }
      ],
      order: [['created_at', 'DESC']]
    });

    res.json(users);
  } catch (error) {
    res.status(500).json({ message: '获取人员列表失败。', error: error.message });
  }
});

router.get('/roles', requireModules('people'), requireRoles(['super_admin', 'hr_manager']), async (req, res) => {
  try {
    const roles = await Role.findAll({ order: [['created_at', 'ASC']] });
    res.json(roles);
  } catch (error) {
    res.status(500).json({ message: '获取角色列表失败。', error: error.message });
  }
});

router.post('/', requireModules('people'), requireRoles(['super_admin', 'hr_manager']), async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { username, name, email, role_id, status, assignments, password, module_permissions } = req.body;

    if (!username || !name || !role_id || !password) {
      await transaction.rollback();
      return res.status(400).json({ message: '账号、姓名、角色和密码不能为空。' });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const role = await Role.findByPk(role_id, { transaction });
    const defaultModules = role?.code === 'hr_manager' ? HR_MANAGER_DEFAULT_MODULES : null;
    const normalizedModules = normalizeModulePermissions(module_permissions) ?? defaultModules;

    const user = await User.create(
      {
        username,
        name,
        email: email || null,
        password_hash,
        role_id,
        status: status || 'active',
        module_permissions: normalizedModules
      },
      { transaction }
    );

    const normalizedAssignments = normalizeAssignments(assignments);

    if (normalizedAssignments.length) {
      await JobAssignment.bulkCreate(
        normalizedAssignments.map((item) => ({
          ...item,
          user_id: user.id
        })),
        { transaction }
      );
    }

    await transaction.commit();
    const createdUser = await User.findByPk(user.id, {
      include: [
        { model: Role },
        {
          model: JobAssignment,
          include: [{ model: Job }]
        }
      ]
    });
    res.status(201).json(createdUser);
  } catch (error) {
    await transaction.rollback();
    res.status(500).json({ message: '新增人员失败。', error: error.message });
  }
});

router.put('/:id', requireModules('people'), requireRoles(['super_admin', 'hr_manager']), async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { username, name, email, role_id, status, assignments, password, module_permissions } = req.body;
    const user = await User.findByPk(req.params.id, { transaction });

    if (!user) {
      await transaction.rollback();
      return res.status(404).json({ message: '未找到人员信息。' });
    }

    const role = await Role.findByPk(role_id || user.role_id, { transaction });
    const defaultModules = role?.code === 'hr_manager' ? HR_MANAGER_DEFAULT_MODULES : null;
    const normalizedModules = normalizeModulePermissions(module_permissions);
    const resolvedModules =
      normalizedModules === null
        ? Array.isArray(user.module_permissions) && user.module_permissions.length
          ? user.module_permissions
          : defaultModules
        : normalizedModules;
    const payload = {
      username: username || user.username,
      name: name || user.name,
      email: email ?? user.email,
      role_id: role_id || user.role_id,
      status: status || user.status,
      module_permissions: resolvedModules
    };

    if (password) {
      payload.password_hash = await bcrypt.hash(password, 10);
    }

    await user.update(payload, { transaction });

    await JobAssignment.destroy({
      where: { user_id: user.id },
      transaction
    });

    const normalizedAssignments = normalizeAssignments(assignments);

    if (normalizedAssignments.length) {
      await JobAssignment.bulkCreate(
        normalizedAssignments.map((item) => ({
          ...item,
          user_id: user.id
        })),
        { transaction }
      );
    }

    await transaction.commit();
    const updatedUser = await User.findByPk(user.id, {
      include: [
        { model: Role },
        {
          model: JobAssignment,
          include: [{ model: Job }]
        }
      ]
    });
    res.json(updatedUser);
  } catch (error) {
    await transaction.rollback();
    res.status(500).json({ message: '更新人员失败。', error: error.message });
  }
});

router.delete('/:id', requireModules('people'), requireRoles(['super_admin', 'hr_manager']), async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const user = await User.findByPk(req.params.id, {
      include: [{ model: Role }],
      transaction
    });

    if (!user) {
      await transaction.rollback();
      return res.status(404).json({ message: '未找到人员信息。' });
    }

    if (req.currentUser?.id === user.id) {
      await transaction.rollback();
      return res.status(400).json({ message: '当前登录账号不能删除自己。' });
    }

    if (user.username === '系统管理员' || user.Role?.code === 'super_admin') {
      await transaction.rollback();
      return res.status(400).json({ message: '超级管理员账号不允许删除。' });
    }

    await JobAssignment.destroy({
      where: { user_id: user.id },
      transaction
    });

    await Promise.all([
      Resume.update(
        {
          hr_owner_id: null,
          hr_owner_name: null
        },
        {
          where: { hr_owner_id: user.id },
          transaction
        }
      ),
      InterviewSchedule.update(
        {
          interviewer_id: null
        },
        {
          where: { interviewer_id: user.id },
          transaction
        }
      ),
      ResumeStageLog.update(
        {
          operator_id: null
        },
        {
          where: { operator_id: user.id },
          transaction
        }
      ),
      PlatformAccount.update(
        {
          created_by: null
        },
        {
          where: { created_by: user.id },
          transaction
        }
      ),
      JobPlatformRecord.update(
        {
          created_by: null
        },
        {
          where: { created_by: user.id },
          transaction
        }
      ),
      PlatformSyncLog.update(
        {
          operator_id: null
        },
        {
          where: { operator_id: user.id },
          transaction
        }
      ),
      LoginAudit.update(
        {
          user_id: null
        },
        {
          where: { user_id: user.id },
          transaction
        }
      )
    ]);

    await user.destroy({ transaction });
    await transaction.commit();

    res.json({ message: '人员删除成功。' });
  } catch (error) {
    await transaction.rollback();
    res.status(500).json({ message: '删除人员失败。', error: error.message });
  }
});

module.exports = router;
