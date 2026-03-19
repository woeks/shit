const express = require('express');
const { Op } = require('sequelize');
const { TalentPool, Resume, ResumeExperience, Job } = require('../models');
const { getScopedJobIds, requireModules, requireRoles } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireModules('talent_pool'), requireRoles(['super_admin', 'hr_manager']), async (req, res) => {
  try {
    const where = {};
    const resumeWhere = {};
    const scopedJobIds = await getScopedJobIds(req.currentUser);

    if (req.query.rejection_stage && req.query.rejection_stage !== 'all') {
      where.rejection_stage = req.query.rejection_stage;
    }

    if (req.query.job_id) {
      resumeWhere.job_id = req.query.job_id;
    }

    if (Array.isArray(scopedJobIds)) {
      resumeWhere.job_id = {
        [Op.in]: scopedJobIds.length ? scopedJobIds : ['00000000-0000-0000-0000-000000000000']
      };
    }

    if (req.query.keyword) {
      resumeWhere[Op.or] = [
        { name: { [Op.iLike]: `%${req.query.keyword}%` } },
        { school_major: { [Op.iLike]: `%${req.query.keyword}%` } },
        { current_company: { [Op.iLike]: `%${req.query.keyword}%` } },
        { current_position: { [Op.iLike]: `%${req.query.keyword}%` } },
        { phone: { [Op.iLike]: `%${req.query.keyword}%` } },
        { email: { [Op.iLike]: `%${req.query.keyword}%` } }
      ];
    }

    const talents = await TalentPool.findAll({
      where,
      include: [
        {
          model: Resume,
          where: resumeWhere,
          include: [{ model: Job }, { model: ResumeExperience }]
        }
      ],
      order: [['created_at', 'DESC']]
    });

    res.json(talents);
  } catch (error) {
    res.status(500).json({ message: '获取人才库失败。', error: error.message });
  }
});

module.exports = router;
