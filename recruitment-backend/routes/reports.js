const express = require('express');
const { Op } = require('sequelize');
const { sequelize, InterviewSchedule, Job, Resume, ResumeStageLog, TalentPool, User, Role } = require('../models');
const { requireModules, requireRoles } = require('../middleware/auth');

const router = express.Router();
const supportedGranularities = ['day', 'week', 'month'];

const effectiveReceivedLiteral = (tableAlias = 'Resume') =>
  sequelize.literal(`COALESCE("${tableAlias}"."source_received_at", "${tableAlias}"."received_at")`);

const buildResumeWhere = (query, tableAlias = 'Resume') => {
  const where = {};
  const andConditions = [];

  if (query.status && query.status !== 'all') {
    where.status = query.status;
  }

  if (query.job_id) {
    where.job_id = query.job_id;
  }

  if (query.source) {
    where.source = query.source;
  }

  if (query.date_from || query.date_to) {
    if (query.date_from) {
      andConditions.push(
        sequelize.where(effectiveReceivedLiteral(tableAlias), {
          [Op.gte]: new Date(`${query.date_from}T00:00:00.000Z`)
        })
      );
    }

    if (query.date_to) {
      andConditions.push(
        sequelize.where(effectiveReceivedLiteral(tableAlias), {
          [Op.lte]: new Date(`${query.date_to}T23:59:59.999Z`)
        })
      );
    }
  }

  if (andConditions.length) {
    where[Op.and] = andConditions;
  }

  return where;
};

const toCsv = (headers, rows) => {
  const escape = (value) => {
    const normalized = value === null || value === undefined ? '' : String(value);
    return `"${normalized.replace(/"/g, '""')}"`;
  };

  return [headers.map(escape).join(','), ...rows.map((row) => row.map(escape).join(','))].join('\n');
};

const normalizeGranularity = (value) => (supportedGranularities.includes(value) ? value : 'day');

const getIsoWeekInfo = (dateValue) => {
  const date = new Date(dateValue);
  const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNumber = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((utcDate - yearStart) / 86400000 + 1) / 7);

  return {
    year: utcDate.getUTCFullYear(),
    week
  };
};

const getPeriodInfo = (value, granularity) => {
  const date = new Date(value);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');

  if (granularity === 'month') {
    const key = `${year}-${month}`;
    return { key, label: key };
  }

  if (granularity === 'week') {
    const { year: weekYear, week } = getIsoWeekInfo(date);
    const label = `${weekYear}-W${String(week).padStart(2, '0')}`;
    return { key: label, label };
  }

  const key = `${year}-${month}-${day}`;
  return { key, label: key };
};

const buildStageLogWhere = (query) => {
  const where = {};

  if (query.date_from || query.date_to) {
    where.created_at = {};

    if (query.date_from) {
      where.created_at[Op.gte] = new Date(`${query.date_from}T00:00:00.000Z`);
    }

    if (query.date_to) {
      where.created_at[Op.lte] = new Date(`${query.date_to}T23:59:59.999Z`);
    }
  }

  return where;
};

const listUsersByRoleCode = async (roleCode) => {
  const users = await User.findAll({
    include: [{ model: Role, where: { code: roleCode }, required: true }],
    order: [['name', 'ASC']]
  });

  return users.map((item) => ({ id: item.id, name: item.name }));
};

const sortPerformanceRows = (rows, nameKey) =>
  rows.sort((a, b) => {
    if (a.period_key === b.period_key) {
      return a[nameKey].localeCompare(b[nameKey], 'zh-CN');
    }
    return a.period_key < b.period_key ? 1 : -1;
  });

const getHrDailyReportData = async (query) => {
  const resumeWhere = buildResumeWhere(query, 'Resume');
  const stageLogWhere = buildStageLogWhere(query);
  const granularity = normalizeGranularity(query.granularity);
  const hrUsers = await listUsersByRoleCode('hr_manager');

  const logs = await ResumeStageLog.findAll({
    where: stageLogWhere,
    include: [
      {
        model: Resume,
        where: resumeWhere,
        required: true
      }
    ],
    order: [['created_at', 'ASC']]
  });

  const rowsMap = new Map();

  for (const log of logs) {
    const resume = log.Resume;
    const period = getPeriodInfo(log.created_at, granularity);
    const ownerId = resume.hr_owner_id || (log.stage === 'screening' ? log.operator_id : null);
    const ownerName = resume.hr_owner_name || (log.stage === 'screening' ? log.operator_name : null);

    if (!ownerId || !ownerName) {
      continue;
    }

    if (query.hr_user_id && query.hr_user_id !== ownerId) {
      continue;
    }

    const key = `${period.key}:${ownerId}`;

    if (!rowsMap.has(key)) {
      rowsMap.set(key, {
        period_key: period.key,
        period_label: period.label,
        stat_date: period.label,
        hr_user_id: ownerId,
        hr_name: ownerName,
        screened_total: 0,
        screened_passed: 0,
        screened_rejected: 0,
        review_passed: 0,
        review_rejected: 0,
        interview_passed: 0,
        interview_rejected: 0,
        offer_sent: 0,
        offer_accepted: 0,
        offer_declined: 0
      });
    }

    const row = rowsMap.get(key);

    if (log.stage === 'screening') {
      row.screened_total += 1;
      if (log.action === 'passed') {
        row.screened_passed += 1;
      }
      if (log.action === 'rejected') {
        row.screened_rejected += 1;
      }
    }

    if (log.stage === 'review') {
      if (log.action === 'passed') {
        row.review_passed += 1;
      }
      if (log.action === 'rejected') {
        row.review_rejected += 1;
      }
    }

    if (log.stage === 'interview') {
      if (['passed_round', 'passed_final'].includes(log.action)) {
        row.interview_passed += 1;
      }
      if (log.action === 'failed') {
        row.interview_rejected += 1;
      }
    }

    if (log.stage === 'offer') {
      if (log.action === 'sent') {
        row.offer_sent += 1;
      }
      if (log.action === 'accepted') {
        row.offer_accepted += 1;
      }
      if (log.action === 'declined') {
        row.offer_declined += 1;
      }
    }
  }

  const rows = sortPerformanceRows(Array.from(rowsMap.values()), 'hr_name');

  return {
    granularity,
    hr_users: hrUsers,
    rows
  };
};

const getInterviewerDailyReportData = async (query) => {
  const resumeWhere = buildResumeWhere(query, 'Resume');
  const stageLogWhere = buildStageLogWhere(query);
  const granularity = normalizeGranularity(query.granularity);
  const interviewers = await listUsersByRoleCode('interviewer');
  const interviewerIds = new Set(interviewers.map((item) => item.id));

  const logs = await ResumeStageLog.findAll({
    where: {
      ...stageLogWhere,
      stage: {
        [Op.in]: ['review', 'interview']
      }
    },
    include: [
      {
        model: Resume,
        where: resumeWhere,
        required: true
      }
    ],
    order: [['created_at', 'ASC']]
  });

  const rowsMap = new Map();

  for (const log of logs) {
    const operatorId = log.operator_id;
    const operatorName = log.operator_name;
    const isReviewAction = log.stage === 'review' && ['passed', 'rejected'].includes(log.action);
    const isInterviewAction = log.stage === 'interview' && ['passed_round', 'passed_final', 'failed'].includes(log.action);

    if (!operatorId || !operatorName || !interviewerIds.has(operatorId)) {
      continue;
    }

    if (query.interviewer_user_id && query.interviewer_user_id !== operatorId) {
      continue;
    }

    if (!isReviewAction && !isInterviewAction) {
      continue;
    }

    const period = getPeriodInfo(log.created_at, granularity);
    const key = `${period.key}:${operatorId}`;

    if (!rowsMap.has(key)) {
      rowsMap.set(key, {
        period_key: period.key,
        period_label: period.label,
        stat_date: period.label,
        interviewer_user_id: operatorId,
        interviewer_name: operatorName,
        review_total: 0,
        review_passed: 0,
        review_rejected: 0,
        interview_total: 0,
        interview_passed: 0,
        interview_rejected: 0
      });
    }

    const row = rowsMap.get(key);

    if (isReviewAction) {
      row.review_total += 1;
      if (log.action === 'passed') {
        row.review_passed += 1;
      }
      if (log.action === 'rejected') {
        row.review_rejected += 1;
      }
    }

    if (isInterviewAction) {
      row.interview_total += 1;
      if (['passed_round', 'passed_final'].includes(log.action)) {
        row.interview_passed += 1;
      }
      if (log.action === 'failed') {
        row.interview_rejected += 1;
      }
    }
  }

  const rows = sortPerformanceRows(Array.from(rowsMap.values()), 'interviewer_name');

  return {
    granularity,
    interviewer_users: interviewers,
    rows
  };
};

router.get('/overview', requireModules('reports'), requireRoles(['super_admin', 'hr_manager']), async (req, res) => {
  try {
    const resumeWhere = buildResumeWhere(req.query, 'Resume');
    const [resumes, interviews, talents] = await Promise.all([
      Resume.findAll({ where: resumeWhere }),
      InterviewSchedule.findAll({ include: [{ model: Resume, where: resumeWhere, required: true }] }),
      TalentPool.findAll({ include: [{ model: Resume, where: resumeWhere, required: true }] })
    ]);

    res.json({
      resumes: resumes.length,
      pendingScreening: resumes.filter((item) => item.status === 'new').length,
      pendingReview: resumes.filter((item) => item.status === 'review_pending').length,
      pendingScheduling: resumes.filter((item) => item.status === 'schedule_pending').length,
      pendingOffer: resumes.filter((item) => ['offer_pending', 'offer_sent'].includes(item.status)).length,
      interviewing: resumes.filter((item) => item.status === 'interviewing').length,
      hired: resumes.filter((item) => item.status === 'hired').length,
      rejected: resumes.filter((item) => item.status === 'rejected').length,
      interviews: interviews.length,
      talentPool: talents.length
    });
  } catch (error) {
    res.status(500).json({ message: '获取报表概览失败。', error: error.message });
  }
});

router.get('/hr-daily', requireModules('reports'), requireRoles(['super_admin', 'hr_manager']), async (req, res) => {
  try {
    res.json(await getHrDailyReportData(req.query));
  } catch (error) {
    res.status(500).json({ message: '获取 HR 绩效统计失败。', error: error.message });
  }
});

router.get('/interviewer-daily', requireModules('reports'), requireRoles(['super_admin', 'hr_manager']), async (req, res) => {
  try {
    res.json(await getInterviewerDailyReportData(req.query));
  } catch (error) {
    res.status(500).json({ message: '获取面试官绩效统计失败。', error: error.message });
  }
});

router.get('/export', requireModules('reports'), requireRoles(['super_admin', 'hr_manager']), async (req, res) => {
  try {
    const dataset = req.query.dataset || 'resumes';
    const resumeWhere = buildResumeWhere(req.query, 'Resume');

    if (dataset === 'resumes') {
      const resumes = await Resume.findAll({
        where: resumeWhere,
        include: [{ model: Job }],
        order: [[effectiveReceivedLiteral(), 'DESC']]
      });

      const csv = toCsv(
        ['姓名', '电话', '邮箱', '岗位', '状态', '来源', '当前轮次', '总轮次', '初筛时间', '复筛时间', '复筛人', '接收时间'],
        resumes.map((item) => [
          item.name,
          item.phone,
          item.email,
          item.Job?.title || '',
          item.status,
          item.source,
          item.current_round,
          item.total_rounds,
          item.screened_at,
          item.reviewed_at,
          item.reviewer,
          item.source_received_at || item.received_at
        ])
      );

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="简历报表.csv"');
      return res.send(`\ufeff${csv}`);
    }

    if (dataset === 'interviews') {
      const interviews = await InterviewSchedule.findAll({
        include: [{ model: Resume, where: resumeWhere, required: true, include: [{ model: Job }] }],
        order: [['scheduled_time', 'DESC']]
      });

      const csv = toCsv(
        ['候选人', '岗位', '轮次', '面试官', '计划时间', '实际时间', '状态', '结果', '建议', '评价', '原因'],
        interviews.map((item) => [
          item.Resume?.name || '',
          item.Resume?.Job?.title || '',
          item.round_name || item.round_index,
          item.interviewer,
          item.scheduled_time,
          item.actual_time,
          item.status,
          item.result,
          item.recommendation,
          item.evaluation,
          item.reason
        ])
      );

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="面试报表.csv"');
      return res.send(`\ufeff${csv}`);
    }

    if (dataset === 'hr_daily') {
      const response = await getHrDailyReportData(req.query);
      const periodHeader = response.granularity === 'day' ? '日期' : response.granularity === 'week' ? '周' : '月份';

      const csv = toCsv(
        [periodHeader, 'HR经理', '筛选总数', '初筛通过', '初筛淘汰', '复筛通过', '复筛淘汰', '面试通过', '面试淘汰', '录用发放', '录用接受', '录用拒绝'],
        response.rows.map((item) => [
          item.period_label,
          item.hr_name,
          item.screened_total,
          item.screened_passed,
          item.screened_rejected,
          item.review_passed,
          item.review_rejected,
          item.interview_passed,
          item.interview_rejected,
          item.offer_sent,
          item.offer_accepted,
          item.offer_declined
        ])
      );

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="HR绩效-${response.granularity}.csv"`);
      return res.send(`\ufeff${csv}`);
    }

    if (dataset === 'interviewer_daily') {
      const response = await getInterviewerDailyReportData(req.query);
      const periodHeader = response.granularity === 'day' ? '日期' : response.granularity === 'week' ? '周' : '月份';

      const csv = toCsv(
        [periodHeader, '面试官', '复筛总数', '复筛通过', '复筛淘汰', '面试完成', '面试通过', '面试淘汰'],
        response.rows.map((item) => [
          item.period_label,
          item.interviewer_name,
          item.review_total,
          item.review_passed,
          item.review_rejected,
          item.interview_total,
          item.interview_passed,
          item.interview_rejected
        ])
      );

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="面试官绩效-${response.granularity}.csv"`);
      return res.send(`\ufeff${csv}`);
    }

    const talents = await TalentPool.findAll({
      include: [{ model: Resume, where: resumeWhere, required: true, include: [{ model: Job }] }],
      order: [['created_at', 'DESC']]
    });

    const csv = toCsv(
      ['候选人', '岗位', '淘汰阶段', '淘汰原因', '进入人才库时间'],
      talents.map((item) => [
        item.Resume?.name || '',
        item.Resume?.Job?.title || '',
        item.rejection_stage,
        item.rejection_reason,
        item.created_at
      ])
    );

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="人才库报表.csv"');
    res.send(`\ufeff${csv}`);
  } catch (error) {
    res.status(500).json({ message: '导出报表失败。', error: error.message });
  }
});

module.exports = router;
