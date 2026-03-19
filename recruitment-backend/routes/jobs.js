const express = require('express');
const { Op } = require('sequelize');
const { Job, JobAssignment, User, Resume, JobPlatformRecord, sequelize } = require('../models');
const { getScopedJobIds, requireModules, requireRoles } = require('../middleware/auth');

const router = express.Router();

const normalizeAliases = (aliases) => {
  if (Array.isArray(aliases)) {
    return aliases.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof aliases === 'string') {
    return aliases
      .split(/[,，;；/|、]/g)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
};

const normalizeRoundNames = (interviewRounds, roundNames) => {
  if (!Array.isArray(roundNames)) {
    return null;
  }

  if (roundNames.length !== interviewRounds) {
    return null;
  }

  return roundNames.map((item) => String(item).trim()).filter(Boolean);
};

router.get('/', requireModules('jobs'), async (req, res) => {
  try {
    const where = {};
    const scopedJobIds = await getScopedJobIds(req.currentUser);

    if (req.query.status && req.query.status !== 'all') {
      where.status = req.query.status;
    }

    if (req.query.department) {
      where.department = { [Op.iLike]: `%${req.query.department}%` };
    }

    if (req.query.keyword) {
      where[Op.or] = [
        { title: { [Op.iLike]: `%${req.query.keyword}%` } },
        { department: { [Op.iLike]: `%${req.query.keyword}%` } },
        { description: { [Op.iLike]: `%${req.query.keyword}%` } }
      ];
    }

    if (Array.isArray(scopedJobIds)) {
      where.id = {
        [Op.in]: scopedJobIds.length ? scopedJobIds : ['00000000-0000-0000-0000-000000000000']
      };
    }

    const jobs = await Job.findAll({
      where,
      include: [
        {
          model: JobAssignment,
          include: [{ model: User }]
        }
      ],
      order: [['created_at', 'DESC']]
    });
    res.json(jobs);
  } catch (error) {
    res.status(500).json({ message: '获取岗位列表失败。', error: error.message });
  }
});

router.post('/', requireModules('jobs'), requireRoles(['super_admin', 'hr_manager']), async (req, res) => {
  try {
    const { title, description, department, interview_rounds, round_names, aliases } = req.body;
    const interviewRounds = Number(interview_rounds || 3);
    const normalizedRoundNames = normalizeRoundNames(interviewRounds, round_names);
    const normalizedAliases = normalizeAliases(aliases);

    if (!title || !department) {
      return res.status(400).json({ message: '岗位名称和部门不能为空。' });
    }

    if (!Number.isInteger(interviewRounds) || interviewRounds < 1 || !normalizedRoundNames) {
      return res.status(400).json({ message: '面试轮次或轮次名称配置不正确。' });
    }

    const job = await Job.create({
      title,
      description,
      department,
      interview_rounds: interviewRounds,
      round_names: normalizedRoundNames,
      aliases: normalizedAliases.length ? normalizedAliases : null
    });
    res.status(201).json(job);
  } catch (error) {
    res.status(500).json({ message: '创建岗位失败。', error: error.message });
  }
});

router.put('/:id', requireModules('jobs'), requireRoles(['super_admin', 'hr_manager']), async (req, res) => {
  try {
    const { title, description, department, interview_rounds, round_names, aliases, status } = req.body;
    const job = await Job.findByPk(req.params.id);

    if (!job) {
      return res.status(404).json({ message: '未找到岗位。' });
    }

    const interviewRounds = Number(interview_rounds || job.interview_rounds || 3);
    const normalizedRoundNames = normalizeRoundNames(interviewRounds, round_names);
    const normalizedAliases = normalizeAliases(aliases);

    if (!title || !department) {
      return res.status(400).json({ message: '岗位名称和部门不能为空。' });
    }

    if (!Number.isInteger(interviewRounds) || interviewRounds < 1 || !normalizedRoundNames) {
      return res.status(400).json({ message: '面试轮次或轮次名称配置不正确。' });
    }

    await job.update({
      title,
      description,
      department,
      status: status || job.status || 'draft',
      interview_rounds: interviewRounds,
      round_names: normalizedRoundNames,
      aliases: normalizedAliases.length ? normalizedAliases : null
    });

    const updatedJob = await Job.findByPk(job.id, {
      include: [
        {
          model: JobAssignment,
          include: [{ model: User }]
        }
      ]
    });
    res.json(updatedJob);
  } catch (error) {
    res.status(500).json({ message: '更新岗位失败。', error: error.message });
  }
});

router.delete('/:id', requireModules('jobs'), requireRoles(['super_admin', 'hr_manager']), async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const job = await Job.findByPk(req.params.id, { transaction });

    if (!job) {
      await transaction.rollback();
      return res.status(404).json({ message: '未找到岗位。' });
    }

    const resumeCount = await Resume.count({ where: { job_id: job.id }, transaction });
    if (resumeCount > 0) {
      await transaction.rollback();
      return res.status(400).json({ message: '该岗位下已有候选人简历，暂不允许删除，请先处理关联数据。' });
    }

    await JobAssignment.destroy({ where: { job_id: job.id }, transaction });
    if (JobPlatformRecord) {
      await JobPlatformRecord.destroy({ where: { job_id: job.id }, transaction });
    }
    await job.destroy({ transaction });

    await transaction.commit();
    res.json({ success: true });
  } catch (error) {
    await transaction.rollback();
    res.status(500).json({ message: '删除岗位失败。', error: error.message });
  }
});


module.exports = router;
