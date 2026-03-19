const express = require('express');
const { User, Role, JobAssignment, Job } = require('../models');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    if (!req.currentUser) {
      return res.status(404).json({ message: '未找到当前登录人员。' });
    }

    const user = await User.findByPk(req.currentUser.id, {
      include: [
        { model: Role },
        {
          model: JobAssignment,
          include: [{ model: Job }]
        }
      ]
    });

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: '获取当前登录信息失败。', error: error.message });
  }
});

module.exports = router;
