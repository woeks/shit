const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { Op } = require('sequelize');
const {
  Resume,
  Job,
  InterviewSchedule,
  ResumeExperience,
  TalentPool,
  User,
  Role,
  JobAssignment,
  ResumeStageLog,
  Offer,
  Interview,
  PlatformResumeRecord,
  ResumeParseFeedback,
  sequelize
} = require('../models');
const { getRoleCode, getScopedJobIds, requireModules, requireRoles } = require('../middleware/auth');
const { appendResumeStageLog } = require('../utils/workflow');
const { parseResumeFile, mergeResumeFields } = require('../utils/resume-parser');
const { findJobSuggestion } = require('../utils/job-matcher');

const router = express.Router();
const uploadDir = path.join(__dirname, '..', 'uploads', 'resumes');

fs.mkdirSync(uploadDir, { recursive: true });

const cleanupUploadedFile = (file) => {
  if (!file?.path || !fs.existsSync(file.path)) {
    return;
  }

  fs.unlinkSync(file.path);
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/\s+/g, '-');
    cb(null, `${Date.now()}-${safeName}`);
  }
});

const upload = multer({ storage });
const FULL_RESUME_ACCESS_ROLES = ['super_admin', 'hr_manager'];
const getAvailableInterviewers = async (jobId) => {
  const assigned = await User.findAll({
    where: { status: 'active' },
    include: [
      { model: Role, where: { code: 'interviewer' } },
      {
        model: JobAssignment,
        where: { job_id: jobId, assignment_type: { [Op.in]: ['interviewer', 'both'] } }
      }
    ],
    order: [['created_at', 'DESC']]
  });

  if (assigned.length) {
    return {
      interviewers: assigned.map((item) => ({ id: item.id, name: item.name, assigned_to_job: true })),
      used_fallback: false
    };
  }

  const fallback = await User.findAll({
    where: { status: 'active' },
    include: [{ model: Role, where: { code: 'interviewer' } }],
    order: [['created_at', 'DESC']]
  });

  return {
    interviewers: fallback.map((item) => ({ id: item.id, name: item.name, assigned_to_job: false })),
    used_fallback: fallback.length > 0
  };
};
const buildKeywordConditions = (keyword) => [
  { name: { [Op.iLike]: `%${keyword}%` } },
  { phone: { [Op.iLike]: `%${keyword}%` } },
  { email: { [Op.iLike]: `%${keyword}%` } },
  { school_major: { [Op.iLike]: `%${keyword}%` } },
  { current_company: { [Op.iLike]: `%${keyword}%` } },
  { current_position: { [Op.iLike]: `%${keyword}%` } }
];

const effectiveReceivedLiteral = (tableAlias = 'Resume') =>
  sequelize.literal(`COALESCE("${tableAlias}"."source_received_at", "${tableAlias}"."received_at")`);

const effectiveReceivedWhere = (query, tableAlias = 'Resume') => {
  const conditions = [];

  if (query.date_from) {
    conditions.push(
      sequelize.where(effectiveReceivedLiteral(tableAlias), {
        [Op.gte]: new Date(`${query.date_from}T00:00:00.000Z`)
      })
    );
  }

  if (query.date_to) {
    conditions.push(
      sequelize.where(effectiveReceivedLiteral(tableAlias), {
        [Op.lte]: new Date(`${query.date_to}T23:59:59.999Z`)
      })
    );
  }

  return conditions;
};

const FEEDBACK_FIELDS = [
  'name',
  'gender',
  'age',
  'education',
  'work_years',
  'school_major',
  'current_company',
  'current_position',
  'phone',
  'email'
];

const normalizeFeedbackValue = (value) => {
  if (value === null || value === undefined || value === '') {
    return '';
  }
  return String(value).trim();
};

const saveParseFeedback = async ({ resume, latestPlatformRecord, body, currentUser, transaction }) => {
  if (!latestPlatformRecord?.parsed_snapshot) {
    return;
  }

  const predicted = latestPlatformRecord.parsed_snapshot || {};
  const rows = FEEDBACK_FIELDS.flatMap((field) => {
    if (!Object.prototype.hasOwnProperty.call(body, field)) {
      return [];
    }

    const correctedValue = normalizeFeedbackValue(resume[field]);
    const predictedValue = normalizeFeedbackValue(predicted[field]);

    if (!correctedValue && !predictedValue) {
      return [];
    }

    if (correctedValue === predictedValue) {
      return [];
    }

    return [
      {
        resume_id: resume.id,
        platform_resume_record_id: latestPlatformRecord.id,
        field_name: field,
        predicted_value: predictedValue || null,
        corrected_value: correctedValue || null,
        operator_id: currentUser?.id || null,
        operator_name: currentUser?.name || null,
        source_label: latestPlatformRecord.source_label || null
      }
    ];
  });

  if (!rows.length) {
    return;
  }

  await ResumeParseFeedback.bulkCreate(rows, { transaction });
};

const updateResumeExperienceSnapshot = async (resumeId, payload, transaction) => {
  const latestExperience = await ResumeExperience.findOne({
    where: { resume_id: resumeId },
    order: [['start_date', 'DESC NULLS LAST'], ['created_at', 'DESC']],
    transaction
  });

  if (!payload.current_company && !payload.current_position) {
    return;
  }

  if (latestExperience) {
    await latestExperience.update(
      {
        company_name: payload.current_company || latestExperience.company_name,
        position_name: payload.current_position || latestExperience.position_name,
        start_date: payload.experience_start_date || latestExperience.start_date,
        end_date: payload.experience_is_current === 'true' ? null : payload.experience_end_date || latestExperience.end_date,
        is_current:
          payload.experience_is_current === undefined
            ? latestExperience.is_current
            : payload.experience_is_current === 'true',
        description: payload.experience_description || latestExperience.description
      },
      { transaction }
    );
    return;
  }

  await ResumeExperience.create(
    {
      resume_id: resumeId,
      company_name: payload.current_company,
      position_name: payload.current_position,
      start_date: payload.experience_start_date || null,
      end_date: payload.experience_is_current === 'true' ? null : payload.experience_end_date || null,
      is_current: payload.experience_is_current === 'true',
      description: payload.experience_description || null
    },
    { transaction }
  );
};

router.get('/', requireModules('resumes'), requireRoles(FULL_RESUME_ACCESS_ROLES), async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page || 1), 1);
    const pageSize = Math.min(Math.max(Number(req.query.pageSize || 10), 1), 100);
    const where = {};
    const scopedJobIds = await getScopedJobIds(req.currentUser);
    const effectiveReceivedConditions = effectiveReceivedWhere(req.query);

    if (req.query.status && req.query.status !== 'all') {
      where.status = req.query.status;
    }

    if (req.query.job_id) {
      where.job_id = req.query.job_id;
    }

    if (req.query.source && req.query.source !== 'all') {
      where.source = req.query.source;
    }

    if (req.query.keyword) {
      where[Op.or] = buildKeywordConditions(req.query.keyword);
    }

    if (effectiveReceivedConditions.length) {
      where[Op.and] = [...(where[Op.and] || []), ...effectiveReceivedConditions];
    }

    if (Array.isArray(scopedJobIds)) {
      where.job_id = {
        [Op.in]: scopedJobIds.length ? scopedJobIds : ['00000000-0000-0000-0000-000000000000']
      };
    }

    const result = await Resume.findAndCountAll({
      where,
      include: [{ model: Job }],
      order: [[effectiveReceivedLiteral(), 'DESC']],
      offset: (page - 1) * pageSize,
      limit: pageSize
    });

    res.json({
      rows: result.rows,
      total: result.count,
      page,
      pageSize
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch resumes.', error: error.message });
  }
});

router.post('/upload', requireModules('resumes'), requireRoles(FULL_RESUME_ACCESS_ROLES), upload.single('file'), async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const {
      experience_start_date,
      experience_end_date,
      experience_is_current,
      experience_description,
      job_id,
      source,
      force_create
    } = req.body;

    if (!req.file) {
      await transaction.rollback();
      return res.status(400).json({ message: '请上传简历文件。' });
    }

    const parsedFields = await parseResumeFile(req.file.path, req.file.originalname);
    const mergedFields = mergeResumeFields(req.body, parsedFields);
    let resolvedJobId = job_id;

    if (!resolvedJobId) {
      const jobs = await Job.findAll({ attributes: ['id', 'title', 'interview_rounds', 'aliases'] });
      const suggestion = findJobSuggestion(jobs, req.file.originalname, parsedFields?.text || '');
      resolvedJobId = suggestion?.id || '';
    }

    if (!resolvedJobId) {
      cleanupUploadedFile(req.file);
      await transaction.rollback();
      return res.status(400).json({ message: '岗位不能为空。' });
    }

    const job = await Job.findByPk(resolvedJobId);

    if (!job) {
      cleanupUploadedFile(req.file);
      await transaction.rollback();
      return res.status(404).json({ message: '未找到对应岗位。' });
    }
    const duplicateConditions = [];

    if (mergedFields.phone) {
      duplicateConditions.push({ phone: mergedFields.phone });
    }

    if (mergedFields.email) {
      duplicateConditions.push({ email: mergedFields.email });
    }

    const existingResume = duplicateConditions.length
      ? await Resume.findOne({
          where: { [Op.or]: duplicateConditions },
          include: [{ model: Job }],
          order: [['created_at', 'DESC']]
        })
      : null;

    if (existingResume && force_create !== 'true') {
      cleanupUploadedFile(req.file);
      await transaction.rollback();
      return res.status(409).json({
        message: '系统中已存在相同手机号或邮箱的候选人。',
        duplicate: true,
        existingResume
      });
    }

    const resume = await Resume.create({
      name: mergedFields.name || path.parse(req.file.originalname).name,
      gender: mergedFields.gender || null,
      age: mergedFields.age ? Number(mergedFields.age) : null,
      education: mergedFields.education || null,
      work_years: mergedFields.work_years ? Number(mergedFields.work_years) : null,
      school_major: mergedFields.school_major || null,
      current_company: mergedFields.current_company || null,
      current_position: mergedFields.current_position || null,
      phone: mergedFields.phone || null,
      email: mergedFields.email || null,
      job_id: resolvedJobId,
      source: source || 'manual',
      hr_owner_id: getRoleCode(req.currentUser) === 'hr_manager' ? req.currentUser.id : null,
      hr_owner_name: getRoleCode(req.currentUser) === 'hr_manager' ? req.currentUser.name : null,
      total_rounds: job.interview_rounds,
      current_round: 0,
      file_url: `/uploads/resumes/${req.file.filename}`,
      status: 'new',
      updated_at: new Date()
    }, { transaction });

    if (mergedFields.current_company && mergedFields.current_position) {
      await ResumeExperience.create(
        {
          resume_id: resume.id,
          company_name: mergedFields.current_company,
          position_name: mergedFields.current_position,
          start_date: experience_start_date || null,
          end_date: experience_is_current === 'true' ? null : experience_end_date || null,
          is_current: experience_is_current === 'true',
          description: experience_description || null
        },
        { transaction }
      );
    }

    await appendResumeStageLog({
      resume_id: resume.id,
      stage: 'resume',
      action: 'received',
      operator: req.currentUser,
      comment: `简历已入库，来源：${source || 'manual'}`,
      metadata: { source: source || 'manual', job_id: resolvedJobId },
      transaction
    });

    await transaction.commit();
    res.status(201).json({ ...resume.toJSON(), parsed_fields: parsedFields });
  } catch (error) {
    await transaction.rollback();
    cleanupUploadedFile(req.file);
    res.status(500).json({ message: '上传简历失败。', error: error.message });
  }
});

router.post('/parse', requireModules('resumes'), requireRoles(FULL_RESUME_ACCESS_ROLES), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: '请上传简历文件。' });
    }

    const parsedFields = await parseResumeFile(req.file.path, req.file.originalname);
    const jobs = await Job.findAll({ attributes: ['id', 'title', 'aliases'] });
    const suggestion = findJobSuggestion(jobs, req.file.originalname, parsedFields?.text || '');
    cleanupUploadedFile(req.file);
    res.json({
      ...parsedFields,
      job_suggestion_id: suggestion?.id || '',
      job_suggestion_title: suggestion?.title || ''
    });
  } catch (error) {
    cleanupUploadedFile(req.file);
    res.status(500).json({ message: '解析简历失败。', error: error.message });
  }
});

router.get('/screening', requireModules('screening'), requireRoles(['super_admin', 'hr_manager']), async (req, res) => {
  try {
    const where = { status: 'new' };

    if (req.query.job_id) {
      where.job_id = req.query.job_id;
    }

    if (req.query.keyword) {
      where[Op.or] = buildKeywordConditions(req.query.keyword);
    }

    const resumes = await Resume.findAll({
      where,
      include: [{ model: Job }],
      order: [[effectiveReceivedLiteral(), 'ASC']]
    });

    res.json(resumes);
  } catch (error) {
    res.status(500).json({ message: '获取初筛队列失败。', error: error.message });
  }
});

router.get('/scheduling', requireModules('scheduling'), requireRoles(['super_admin', 'hr_manager']), async (req, res) => {
  try {
    const where = { status: 'schedule_pending' };

    if (req.query.job_id) {
      where.job_id = req.query.job_id;
    }

    if (req.query.keyword) {
      where[Op.or] = buildKeywordConditions(req.query.keyword);
    }

    const resumes = await Resume.findAll({
      where,
      include: [{ model: Job }],
      order: [['reviewed_at', 'ASC'], [effectiveReceivedLiteral(), 'ASC']]
    });

    res.json(resumes);
  } catch (error) {
    res.status(500).json({ message: '获取待安排面试队列失败。', error: error.message });
  }
});

router.get('/review', requireModules('review'), requireRoles(['super_admin', 'hr_manager', 'interviewer']), async (req, res) => {
  try {
    const roleCode = getRoleCode(req.currentUser);
    const where = { status: 'review_pending' };
    const scopedJobIds = await getScopedJobIds(req.currentUser, ['reviewer', 'both']);

    if (roleCode === 'interviewer') {
      where.job_id = {
        [Op.in]: scopedJobIds?.length ? scopedJobIds : ['00000000-0000-0000-0000-000000000000']
      };
    }

    if (req.query.job_id) {
      if (roleCode === 'interviewer') {
        if ((scopedJobIds || []).includes(req.query.job_id)) {
          where.job_id = req.query.job_id;
        } else {
          where.job_id = '00000000-0000-0000-0000-000000000000';
        }
      } else {
        where.job_id = req.query.job_id;
      }
    }

    if (req.query.keyword) {
      where[Op.or] = buildKeywordConditions(req.query.keyword);
    }

    const resumes = await Resume.findAll({
      where,
      include: [{ model: Job }],
      order: [['screened_at', 'ASC'], [effectiveReceivedLiteral(), 'ASC']]
    });

    res.json(resumes);
  } catch (error) {
    res.status(500).json({ message: '获取复筛队列失败。', error: error.message });
  }
});

router.put('/:id', requireModules('resumes'), requireRoles(['super_admin', 'hr_manager']), async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const resume = await Resume.findByPk(req.params.id, { transaction });
    const latestPlatformRecord = await PlatformResumeRecord.findOne({
      where: { resume_id: req.params.id },
      order: [['imported_at', 'DESC'], ['last_sync_at', 'DESC']],
      transaction
    });

    if (!resume) {
      await transaction.rollback();
      return res.status(404).json({ message: '未找到候选人简历。' });
    }

    const hasField = (key) => Object.prototype.hasOwnProperty.call(req.body, key);
    const pickValue = (key, currentValue, transform = (value) => value) => {
      if (!hasField(key)) {
        return currentValue;
      }

      const value = req.body[key];

      if (value === '' || value === null || typeof value === 'undefined') {
        return null;
      }

      return transform(value);
    };

    const nextJobId = pickValue('job_id', resume.job_id);
    let nextTotalRounds = resume.total_rounds;
    let nextCurrentRound = resume.current_round;

    if (nextJobId && nextJobId !== resume.job_id) {
      const nextJob = await Job.findByPk(nextJobId, { transaction });

      if (!nextJob) {
        await transaction.rollback();
        return res.status(404).json({ message: '未找到对应岗位。' });
      }

      nextTotalRounds = nextJob.interview_rounds || resume.total_rounds || 3;
      if (nextCurrentRound > nextTotalRounds) {
        nextCurrentRound = nextTotalRounds;
      }
    }

    const payload = {
      name: pickValue('name', resume.name),
      gender: pickValue('gender', resume.gender),
      age: pickValue('age', resume.age, Number),
      education: pickValue('education', resume.education),
      work_years: pickValue('work_years', resume.work_years, Number),
      school_major: pickValue('school_major', resume.school_major),
      current_company: pickValue('current_company', resume.current_company),
      current_position: pickValue('current_position', resume.current_position),
      phone: pickValue('phone', resume.phone),
      email: pickValue('email', resume.email),
      job_id: nextJobId || null,
      total_rounds: nextTotalRounds,
      current_round: nextCurrentRound,
      source: pickValue('source', resume.source),
      updated_at: new Date()
    };

    await resume.update(payload, { transaction });
    await updateResumeExperienceSnapshot(resume.id, req.body, transaction);
    await saveParseFeedback({
      resume,
      latestPlatformRecord,
      body: req.body,
      currentUser: req.currentUser,
      transaction
    });
    await transaction.commit();

    const updatedResume = await Resume.findByPk(resume.id, { include: [{ model: Job }, { model: ResumeExperience }] });
    res.json(updatedResume);
  } catch (error) {
    await transaction.rollback();
    res.status(500).json({ message: '更新候选人简历失败。', error: error.message });
  }
});

router.delete('/:id', requireModules('resumes'), requireRoles(['super_admin', 'hr_manager']), async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const resume = await Resume.findByPk(req.params.id, { transaction });

    if (!resume) {
      await transaction.rollback();
      return res.status(404).json({ message: '未找到候选人简历。' });
    }

    await InterviewSchedule.destroy({ where: { resume_id: resume.id }, transaction });
    await Interview.destroy({ where: { resume_id: resume.id }, transaction });
    await Offer.destroy({ where: { resume_id: resume.id }, transaction });
    await TalentPool.destroy({ where: { resume_id: resume.id }, transaction });
    await ResumeStageLog.destroy({ where: { resume_id: resume.id }, transaction });
    await ResumeExperience.destroy({ where: { resume_id: resume.id }, transaction });
    await ResumeParseFeedback.destroy({ where: { resume_id: resume.id }, transaction });
    await PlatformResumeRecord.destroy({ where: { resume_id: resume.id }, transaction });
    await Resume.destroy({ where: { id: resume.id }, transaction });

    await transaction.commit();

    if (resume.file_url) {
      const relativePath = String(resume.file_url).replace(/^\//, '');
      const filePath = path.join(__dirname, '..', relativePath);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    res.json({ message: '简历已删除。' });
  } catch (error) {
    await transaction.rollback();
    res.status(500).json({ message: '删除简历失败。', error: error.message });
  }
});

router.get(
  '/:id/interview-progress',
  requireModules(['resumes', 'scheduling']),
  requireRoles(FULL_RESUME_ACCESS_ROLES),
  async (req, res) => {
  try {
    const resume = await Resume.findByPk(req.params.id, {
      include: [
        { model: Job },
        {
          model: InterviewSchedule
        },
        {
          model: ResumeStageLog
        },
        {
          model: ResumeExperience
        },
        {
          model: Offer
        }
      ]
    });

    if (!resume) {
      return res.status(404).json({ message: '未找到候选人简历。' });
    }

    const scopedJobIds = await getScopedJobIds(req.currentUser);

    if (Array.isArray(scopedJobIds) && !scopedJobIds.includes(resume.job_id)) {
      return res.status(403).json({ message: 'You do not have access to this resume.' });
    }

    const schedules = [...resume.InterviewSchedules].sort((a, b) => a.round_index - b.round_index);
    const stageLogs = [...resume.ResumeStageLogs].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    const experiences = [...resume.ResumeExperiences].sort((a, b) => {
      const timeA = a.start_date ? new Date(a.start_date).getTime() : 0;
      const timeB = b.start_date ? new Date(b.start_date).getTime() : 0;
      return timeB - timeA;
    });
    const latestPlatformRecord = await PlatformResumeRecord.findOne({
      where: { resume_id: resume.id },
      order: [
        ['imported_at', 'DESC'],
        ['last_sync_at', 'DESC']
      ]
    });
    const { interviewers: availableInterviewers, used_fallback: interviewerFallbackUsed } = await getAvailableInterviewers(
      resume.job_id
    );

    res.json({
      resume,
      job: resume.Job,
      current_round: resume.current_round,
      total_rounds: resume.total_rounds,
      history: schedules,
      experiences,
      stage_logs: stageLogs,
      offer: resume.Offer,
      latest_import_record: latestPlatformRecord
        ? {
            source_label: latestPlatformRecord.source_label,
            imported_at: latestPlatformRecord.imported_at,
            parsed_snapshot: latestPlatformRecord.parsed_snapshot,
            raw_payload: latestPlatformRecord.raw_payload
          }
        : null,
      available_interviewers: availableInterviewers,
      interviewer_fallback_used: interviewerFallbackUsed
    });
  } catch (error) {
    res.status(500).json({ message: '获取候选人进度失败。', error: error.message });
  }
}
);

router.post('/:id/screen', requireModules('screening'), requireRoles(['super_admin', 'hr_manager']), async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { action, reason } = req.body;
    const resume = await Resume.findByPk(req.params.id, { transaction });

    if (!resume) {
      await transaction.rollback();
      return res.status(404).json({ message: '未找到候选人简历。' });
    }

    if (resume.status !== 'new') {
      await transaction.rollback();
      return res.status(400).json({ message: 'Only new resumes can be screened.' });
    }

    if (action === 'reject') {
      await resume.update(
        {
          hr_owner_id: resume.hr_owner_id || req.currentUser.id,
          hr_owner_name: resume.hr_owner_name || req.currentUser.name,
          status: 'rejected',
          screening_reason: reason || null,
          screened_at: new Date(),
          updated_at: new Date()
        },
        { transaction }
      );

      await TalentPool.create(
        {
          resume_id: resume.id,
          rejection_stage: 'rejected_screening',
          rejection_reason: reason || null
        },
        { transaction }
      );
      await appendResumeStageLog({
        resume_id: resume.id,
        stage: 'screening',
        action: 'rejected',
        operator: req.currentUser,
        comment: reason || null,
        transaction
      });
    } else if (action === 'pass') {
      await resume.update(
        {
          hr_owner_id: resume.hr_owner_id || req.currentUser.id,
          hr_owner_name: resume.hr_owner_name || req.currentUser.name,
          status: 'review_pending',
          screened_at: new Date(),
          current_round: 1,
          updated_at: new Date()
        },
        { transaction }
      );
      await appendResumeStageLog({
        resume_id: resume.id,
        stage: 'screening',
        action: 'passed',
        operator: req.currentUser,
        comment: '已进入复筛队列',
        transaction
      });
    } else {
      await transaction.rollback();
      return res.status(400).json({ message: '操作类型只能为通过或淘汰。' });
    }

    await transaction.commit();
    const updatedResume = await Resume.findByPk(resume.id, { include: [{ model: Job }] });
    res.json(updatedResume);
  } catch (error) {
    await transaction.rollback();
    res.status(500).json({ message: '处理初筛失败。', error: error.message });
  }
});

router.post('/:id/review', requireModules('review'), requireRoles(['super_admin', 'interviewer', 'hr_manager']), async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { action, reason } = req.body;
    const reviewer = req.currentUser?.name;
    const resume = await Resume.findByPk(req.params.id, { transaction });

    if (!resume) {
      await transaction.rollback();
      return res.status(404).json({ message: '未找到候选人简历。' });
    }

    const scopedJobIds = await getScopedJobIds(req.currentUser, ['reviewer', 'both']);

    if (Array.isArray(scopedJobIds) && !scopedJobIds.includes(resume.job_id)) {
      await transaction.rollback();
      return res.status(403).json({ message: 'You do not have access to review this resume.' });
    }

    if (resume.status !== 'review_pending') {
      await transaction.rollback();
      return res.status(400).json({ message: 'Only resumes pending review can be reviewed.' });
    }

    if (action === 'reject') {
      if (!reason) {
        await transaction.rollback();
        return res.status(400).json({ message: '复筛淘汰时必须填写原因。' });
      }

      await resume.update(
        {
          status: 'rejected',
          reviewer,
          review_reason: reason,
          reviewed_at: new Date(),
          updated_at: new Date()
        },
        { transaction }
      );

      await TalentPool.create(
        {
          resume_id: resume.id,
          rejection_stage: 'rejected_review',
          rejection_reason: reason
        },
        { transaction }
      );
      await appendResumeStageLog({
        resume_id: resume.id,
        stage: 'review',
        action: 'rejected',
        operator: req.currentUser,
        comment: reason,
        transaction
      });
    } else if (action === 'pass') {
      await resume.update(
        {
          status: 'schedule_pending',
          reviewer,
          review_reason: reason || null,
          reviewed_at: new Date(),
          updated_at: new Date()
        },
        { transaction }
      );
      await appendResumeStageLog({
        resume_id: resume.id,
        stage: 'review',
        action: 'passed',
        operator: req.currentUser,
        comment: reason || '复筛通过，待 HR 发起面试安排',
        transaction
      });
    } else {
      await transaction.rollback();
      return res.status(400).json({ message: '操作类型只能为通过或淘汰。' });
    }

    await transaction.commit();
    const updatedResume = await Resume.findByPk(resume.id, { include: [{ model: Job }] });
    res.json(updatedResume);
  } catch (error) {
    await transaction.rollback();
    res.status(500).json({ message: '处理复筛失败。', error: error.message });
  }
});

module.exports = router;
