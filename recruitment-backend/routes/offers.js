const express = require('express');
const { Op } = require('sequelize');
const { Offer, Resume, Job, TalentPool, sequelize } = require('../models');
const { requireModules, requireRoles } = require('../middleware/auth');
const { appendResumeStageLog } = require('../utils/workflow');

const router = express.Router();

router.get('/', requireModules('offers'), requireRoles(['super_admin', 'hr_manager']), async (req, res) => {
  try {
    const where = {};
    const resumeWhere = {};

    if (req.query.status && req.query.status !== 'all') {
      where.status = req.query.status;
    }

    if (req.query.job_id) {
      resumeWhere.job_id = req.query.job_id;
    }

    if (req.query.keyword) {
      resumeWhere[Op.or] = [
        { name: { [Op.iLike]: `%${req.query.keyword}%` } },
        { phone: { [Op.iLike]: `%${req.query.keyword}%` } },
        { email: { [Op.iLike]: `%${req.query.keyword}%` } }
      ];
    }

    const offers = await Offer.findAll({
      where,
      include: [{ model: Resume, where: resumeWhere, include: [{ model: Job }] }],
      order: [['created_at', 'DESC']]
    });

    res.json(offers);
  } catch (error) {
    res.status(500).json({ message: '获取录用列表失败。', error: error.message });
  }
});

router.post('/', requireModules('offers'), requireRoles(['super_admin', 'hr_manager']), async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { resume_id, salary, level, join_date, notes } = req.body;

    if (!resume_id) {
      await transaction.rollback();
      return res.status(400).json({ message: '候选人简历不能为空。' });
    }

    const resume = await Resume.findByPk(resume_id, { transaction });

    if (!resume) {
      await transaction.rollback();
      return res.status(404).json({ message: '未找到候选人简历。' });
    }

    if (!['offer_pending', 'offer_sent'].includes(resume.status)) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Only candidates in offer stage can be processed.' });
    }

    const [offer, created] = await Offer.findOrCreate({
      where: { resume_id },
      defaults: {
        resume_id,
        salary: salary || null,
        level: level || null,
        join_date: join_date || null,
        notes: notes || null,
        status: 'offer_sent',
        sent_at: new Date()
      },
      transaction
    });

    if (!created) {
      await offer.update(
        {
          salary: salary || offer.salary,
          level: level || offer.level,
          join_date: join_date || offer.join_date,
          notes: notes || offer.notes,
          status: 'offer_sent',
          sent_at: new Date()
        },
        { transaction }
      );
    }

    await resume.update(
      {
        status: 'offer_sent',
        updated_at: new Date()
      },
      { transaction }
    );

    await appendResumeStageLog({
      resume_id,
      stage: 'offer',
      action: 'sent',
      operator: req.currentUser,
      comment: notes || 'Offer 已发送',
      metadata: {
        salary: salary || offer.salary,
        level: level || offer.level,
        join_date: join_date || offer.join_date
      },
      transaction
    });

    await transaction.commit();
    const result = await Offer.findByPk(offer.id, {
      include: [{ model: Resume, include: [{ model: Job }] }]
    });
    res.status(created ? 201 : 200).json(result);
  } catch (error) {
    await transaction.rollback();
    res.status(500).json({ message: '保存录用信息失败。', error: error.message });
  }
});

router.post('/:id/decision', requireModules('offers'), requireRoles(['super_admin', 'hr_manager']), async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { action, reason } = req.body;
    const offer = await Offer.findByPk(req.params.id, {
      include: [{ model: Resume }],
      transaction
    });

    if (!offer) {
      await transaction.rollback();
      return res.status(404).json({ message: '未找到录用记录。' });
    }

    if (!['accept', 'decline'].includes(action)) {
      await transaction.rollback();
      return res.status(400).json({ message: '录用结果只能为接受或拒绝。' });
    }

    const offerStatus = action === 'accept' ? 'offer_accepted' : 'offer_declined';
    const resumeStatus = action === 'accept' ? 'hired' : 'rejected';

    await offer.update(
      {
        status: offerStatus,
        decided_at: new Date(),
        notes: reason || offer.notes
      },
      { transaction }
    );

    await offer.Resume.update(
      {
        status: resumeStatus,
        updated_at: new Date()
      },
      { transaction }
    );

    if (action === 'decline') {
      await TalentPool.create(
        {
          resume_id: offer.Resume.id,
          rejection_stage: 'rejected_offer',
          rejection_reason: reason || 'Offer declined'
        },
        { transaction }
      );
    }

    await appendResumeStageLog({
      resume_id: offer.Resume.id,
      stage: 'offer',
      action: action === 'accept' ? 'accepted' : 'declined',
      operator: req.currentUser,
      comment: reason || (action === 'accept' ? '候选人接受 Offer' : '候选人拒绝 Offer'),
      transaction
    });

    await transaction.commit();
    const result = await Offer.findByPk(offer.id, {
      include: [{ model: Resume, include: [{ model: Job }] }]
    });
    res.json(result);
  } catch (error) {
    await transaction.rollback();
    res.status(500).json({ message: '处理录用结果失败。', error: error.message });
  }
});

module.exports = router;
