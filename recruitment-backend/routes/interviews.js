const express = require('express');
const { Op } = require('sequelize');
const { InterviewSchedule, Resume, Job, TalentPool, User, Role, JobAssignment, sequelize } = require('../models');
const { getRoleCode, getScopedJobIds, requireModules, requireRoles } = require('../middleware/auth');
const { appendResumeStageLog } = require('../utils/workflow');

const router = express.Router();
const validRecommendations = ['strong_hire', 'hire', 'hold', 'no_hire'];

const normalizeRoundName = (job, roundIndex) => {
  const names = Array.isArray(job?.round_names) ? job.round_names : [];
  return names[roundIndex - 1] || `第${roundIndex}轮面试`;
};

const isValidScore = (value) => Number.isInteger(value) && value >= 1 && value <= 5;

router.get('/', requireModules('interviews'), async (req, res) => {
  try {
    const where = {};
    const resumeWhere = {};
    const roleCode = getRoleCode(req.currentUser);

    if (req.query.result) {
      where.result = req.query.result;
    }

    if (req.query.status) {
      where.status = req.query.status;
    }

    if (req.query.interviewer_id) {
      where.interviewer_id = req.query.interviewer_id;
    }

    if (roleCode === 'interviewer') {
      where.interviewer_id = req.currentUser.id;
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

    const interviews = await InterviewSchedule.findAll({
      where,
      include: [{ model: Resume, where: resumeWhere, include: [{ model: Job }] }, { model: User, as: 'Interviewer' }],
      order: [['scheduled_time', 'ASC']]
    });

    res.json(interviews);
  } catch (error) {
    res.status(500).json({ message: '获取面试列表失败。', error: error.message });
  }
});

router.post('/schedule', requireModules('scheduling'), requireRoles(['super_admin', 'hr_manager']), async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { resume_id, interviewer_id, scheduled_time, round_index, interview_mode } = req.body;
    const resume = await Resume.findByPk(resume_id, {
      include: [{ model: Job }],
      transaction
    });

    if (!resume) {
      await transaction.rollback();
      return res.status(404).json({ message: '未找到候选人简历。' });
    }

    if (!interviewer_id || !scheduled_time) {
      await transaction.rollback();
      return res.status(400).json({ message: '面试官和面试时间不能为空。' });
    }

    const normalizedInterviewMode = ['online', 'offline'].includes(String(interview_mode || '').trim())
      ? String(interview_mode).trim()
      : 'offline';

    const roundIndex = Number(round_index || resume.current_round || 1);

    if (roundIndex < 1 || roundIndex > resume.total_rounds) {
      await transaction.rollback();
      return res.status(400).json({ message: 'round_index is out of range.' });
    }

    if (roundIndex !== resume.current_round) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Only the current round can be scheduled.' });
    }

    if (!['schedule_pending', 'interviewing'].includes(resume.status)) {
      await transaction.rollback();
      return res.status(400).json({ message: 'This candidate is not ready for interview scheduling.' });
    }

    if (roundIndex === 1 && !resume.reviewed_at) {
      await transaction.rollback();
      return res.status(400).json({ message: 'First-round interview can only be scheduled after review passes.' });
    }

    const interviewer = await User.findByPk(interviewer_id, {
      include: [
        {
          model: Role,
          where: { code: 'interviewer' }
        },
        {
          model: JobAssignment,
          where: { job_id: resume.job_id, assignment_type: { [Op.in]: ['interviewer', 'both'] } },
          required: false
        }
      ],
      transaction
    });

    if (!interviewer) {
      await transaction.rollback();
      return res.status(404).json({ message: '未找到指定面试官。' });
    }

    const hasJobAssignment = Array.isArray(interviewer.JobAssignments) && interviewer.JobAssignments.length > 0;

    const existingRound = await InterviewSchedule.findOne({
      where: { resume_id, round_index: roundIndex },
      transaction
    });

    if (existingRound && existingRound.status !== 'cancelled') {
      await transaction.rollback();
      return res.status(409).json({ message: 'This round has already been scheduled.' });
    }

    const interview = await InterviewSchedule.create(
      {
        resume_id,
        interviewer_id,
        round_index: roundIndex,
        round_name: normalizeRoundName(resume.Job, roundIndex),
        interviewer: interviewer.name,
        interview_mode: normalizedInterviewMode,
        scheduled_time,
        status: 'pending',
        result: 'pending'
      },
      { transaction }
    );

    await resume.update(
      {
        status: 'interviewing',
        interview_scheduled_at: scheduled_time,
        updated_at: new Date()
      },
      { transaction }
    );
    await appendResumeStageLog({
      resume_id,
      stage: 'interview',
      action: 'scheduled',
      operator: req.currentUser,
      comment: `${normalizeRoundName(resume.Job, roundIndex)} 已安排给 ${interviewer.name}`,
      metadata: {
        round_index: roundIndex,
        round_name: normalizeRoundName(resume.Job, roundIndex),
        interviewer: interviewer.name,
        scheduled_time,
        interview_mode: normalizedInterviewMode,
        interviewer_scope: hasJobAssignment ? 'job_assigned' : 'role_fallback'
      },
      transaction
    });

    await transaction.commit();
    const created = await InterviewSchedule.findByPk(interview.id, {
      include: [{ model: Resume, include: [{ model: Job }] }, { model: User, as: 'Interviewer' }]
    });
    res.status(201).json(created);
  } catch (error) {
    await transaction.rollback();
    res.status(500).json({ message: '安排面试失败。', error: error.message });
  }
});

router.post('/:id/feedback', requireModules('interviews'), requireRoles(['super_admin', 'interviewer']), async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { result, evaluation, reason, technical_score, communication_score, culture_score, recommendation } =
      req.body;
    const interview = await InterviewSchedule.findByPk(req.params.id, {
      include: [{ model: Resume }],
      transaction
    });

    if (!interview) {
      await transaction.rollback();
      return res.status(404).json({ message: '未找到面试记录。' });
    }

    if (getRoleCode(req.currentUser) === 'interviewer' && interview.interviewer_id !== req.currentUser.id) {
      await transaction.rollback();
      return res.status(403).json({ message: 'You can only submit feedback for your own interviews.' });
    }

    if (interview.status !== 'pending' || interview.result !== 'pending') {
      await transaction.rollback();
      return res.status(409).json({ message: '该面试反馈已提交，请勿重复操作。' });
    }

    if (!['passed', 'failed'].includes(result)) {
      await transaction.rollback();
      return res.status(400).json({ message: '面试结果只能为通过或不通过。' });
    }

    const parsedScores = {
      technical_score: Number(technical_score),
      communication_score: Number(communication_score),
      culture_score: Number(culture_score)
    };

    if (
      !isValidScore(parsedScores.technical_score) ||
      !isValidScore(parsedScores.communication_score) ||
      !isValidScore(parsedScores.culture_score)
    ) {
      await transaction.rollback();
      return res.status(400).json({ message: '评分必须为 1 到 5 的整数。' });
    }

    if (!validRecommendations.includes(recommendation)) {
      await transaction.rollback();
      return res.status(400).json({ message: '录用建议参数无效。' });
    }

    if (result === 'failed' && !reason) {
      await transaction.rollback();
      return res.status(400).json({ message: '面试不通过时必须填写原因。' });
    }

    await interview.update(
      {
        result,
        ...parsedScores,
        recommendation,
        evaluation,
        reason: reason || null,
        actual_time: new Date(),
        status: 'completed'
      },
      { transaction }
    );

    const nextResumeState =
      result === 'failed'
        ? { status: 'rejected' }
        : interview.Resume.current_round >= interview.Resume.total_rounds
          ? { status: 'offer_pending' }
          : {
              status: 'schedule_pending',
              current_round: interview.Resume.current_round + 1,
              interview_scheduled_at: null
            };

    await interview.Resume.update(
      {
        ...nextResumeState,
        interviewed_at: new Date(),
        updated_at: new Date()
      },
      { transaction }
    );

    if (result === 'failed') {
      await TalentPool.create(
        {
          resume_id: interview.Resume.id,
          rejection_stage: 'rejected_interview',
          rejection_reason: reason
        },
        { transaction }
      );
      await appendResumeStageLog({
        resume_id: interview.Resume.id,
        stage: 'interview',
        action: 'failed',
        operator: req.currentUser,
        comment: reason,
        metadata: {
          round_index: interview.round_index,
          round_name: interview.round_name
        },
        transaction
      });
    } else if (interview.Resume.current_round >= interview.Resume.total_rounds) {
      await appendResumeStageLog({
        resume_id: interview.Resume.id,
        stage: 'interview',
        action: 'passed_final',
        operator: req.currentUser,
        comment: '终面通过，进入 Offer 阶段',
        metadata: {
          round_index: interview.round_index,
          round_name: interview.round_name
        },
        transaction
      });
    } else {
      await appendResumeStageLog({
        resume_id: interview.Resume.id,
        stage: 'interview',
        action: 'passed_round',
        operator: req.currentUser,
        comment: `第 ${interview.Resume.current_round} 轮通过，待安排下一轮`,
        metadata: {
          round_index: interview.round_index,
          round_name: interview.round_name,
          next_round: interview.Resume.current_round + 1
        },
        transaction
      });
    }

    await transaction.commit();
    const updated = await InterviewSchedule.findByPk(interview.id, {
      include: [{ model: Resume, include: [{ model: Job }] }, { model: User, as: 'Interviewer' }]
    });
    res.json(updated);
  } catch (error) {
    await transaction.rollback();
    res.status(500).json({ message: '提交面试反馈失败。', error: error.message });
  }
});

module.exports = router;
