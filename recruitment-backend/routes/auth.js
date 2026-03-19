const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const { User, Role, JobAssignment, Job, LoginAudit } = require('../models');
const { JWT_SECRET, requireAuth, requireModules, requireRoles } = require('../middleware/auth');

const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: '账号和密码不能为空。' });
    }

    const user = await User.scope('withPassword').findOne({
      where: { username, status: 'active' },
      include: [{ model: Role }]
    });

    if (!user?.password_hash) {
      await LoginAudit.create({
        username,
        status: 'failed',
        ip_address: req.ip,
        user_agent: req.get('user-agent'),
        failure_reason: '账号不存在或已停用'
      });
      return res.status(401).json({ message: '账号或密码错误。' });
    }

    const passwordMatched = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatched) {
      await LoginAudit.create({
        user_id: user.id,
        username,
        status: 'failed',
        ip_address: req.ip,
        user_agent: req.get('user-agent'),
        failure_reason: '密码校验失败'
      });
      return res.status(401).json({ message: '账号或密码错误。' });
    }

    const token = jwt.sign({ userId: user.id, role: user.Role?.code }, JWT_SECRET, { expiresIn: '12h' });
    const sessionUser = await User.findByPk(user.id, {
      include: [
        { model: Role },
        {
          model: JobAssignment,
          include: [{ model: Job }]
        }
      ]
    });

    await LoginAudit.create({
      user_id: user.id,
      username,
      status: 'success',
      ip_address: req.ip,
      user_agent: req.get('user-agent')
    });

    res.json({
      token,
      user: sessionUser
    });
  } catch (error) {
    res.status(500).json({ message: '登录失败。', error: error.message });
  }
});

router.post('/change-password', requireAuth, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return res.status(400).json({ message: '当前密码和新密码不能为空。' });
    }

    if (new_password.length < 8) {
      return res.status(400).json({ message: '新密码长度不能少于 8 位。' });
    }

    const user = await User.scope('withPassword').findByPk(req.currentUser.id);

    if (!user?.password_hash) {
      return res.status(400).json({ message: '当前账号尚未初始化密码。' });
    }

    const matched = await bcrypt.compare(current_password, user.password_hash);

    if (!matched) {
      return res.status(400).json({ message: '当前密码不正确。' });
    }

    const password_hash = await bcrypt.hash(new_password, 10);
    await user.update({ password_hash });
    res.json({ message: '密码修改成功。' });
  } catch (error) {
    res.status(500).json({ message: '修改密码失败。', error: error.message });
  }
});

router.get('/audit', requireModules('auth_audit'), requireRoles(['super_admin', 'hr_manager']), async (req, res) => {
  try {
    const where = {};

    if (req.query.status) {
      where.status = req.query.status;
    }

    if (req.query.username) {
      where.username = {
        [Op.iLike]: `%${req.query.username}%`
      };
    }

    const audits = await LoginAudit.findAll({
      where,
      include: [{ model: User, include: [{ model: Role }] }],
      order: [['created_at', 'DESC']],
      limit: Math.min(Number(req.query.limit || 100), 500)
    });

    res.json(audits);
  } catch (error) {
    res.status(500).json({ message: '获取登录审计失败。', error: error.message });
  }
});

module.exports = router;
