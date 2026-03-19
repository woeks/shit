require('dotenv').config();

const express = require('express');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');
const { Op } = require('sequelize');
const db = require('./models');
const { parseResumeFile, isSuspiciousName } = require('./utils/resume-parser');

const authRouter = require('./routes/auth');
const jobsRouter = require('./routes/jobs');
const resumesRouter = require('./routes/resumes');
const interviewsRouter = require('./routes/interviews');
const offersRouter = require('./routes/offers');
const talentPoolRouter = require('./routes/talent-pool');
const usersRouter = require('./routes/users');
const sessionRouter = require('./routes/session');
const platformsRouter = require('./routes/platforms');
const reportsRouter = require('./routes/reports');
const { loadCurrentUser, requireAuth } = require('./middleware/auth');
const cron = require('node-cron');
const { syncAllEmailAccounts } = require('./services/email-sync');

const app = express();
const port = process.env.PORT || 3000;

const ensureTableColumns = async (tableName, columns) => {
  const queryInterface = db.sequelize.getQueryInterface();
  const table = await queryInterface.describeTable(tableName);
  const missingColumns = columns.filter(([columnName]) => !table[columnName]);

  for (const [columnName, definition] of missingColumns) {
    await queryInterface.addColumn(tableName, columnName, definition);
  }
};

const ensureRecruitmentSchema = async () => {
  await ensureTableColumns('jobs', [
    ['interview_rounds', { type: db.Sequelize.INTEGER, allowNull: true, defaultValue: 3 }],
    ['round_names', { type: db.Sequelize.JSON, allowNull: true }],
    ['aliases', { type: db.Sequelize.JSONB, allowNull: true }]
  ]);

  await ensureTableColumns('resumes', [
    ['hr_owner_id', { type: db.Sequelize.UUID, allowNull: true }],
    ['hr_owner_name', { type: db.Sequelize.STRING, allowNull: true }],
    ['gender', { type: db.Sequelize.STRING, allowNull: true }],
    ['age', { type: db.Sequelize.INTEGER, allowNull: true }],
    ['education', { type: db.Sequelize.STRING, allowNull: true }],
    ['work_years', { type: db.Sequelize.INTEGER, allowNull: true }],
    ['school_major', { type: db.Sequelize.STRING, allowNull: true }],
    ['current_company', { type: db.Sequelize.STRING, allowNull: true }],
    ['current_position', { type: db.Sequelize.STRING, allowNull: true }],
    ['source_received_at', { type: db.Sequelize.DATE, allowNull: true }],
    ['current_round', { type: db.Sequelize.INTEGER, allowNull: true, defaultValue: 0 }],
    ['total_rounds', { type: db.Sequelize.INTEGER, allowNull: true, defaultValue: 3 }],
    ['reviewer', { type: db.Sequelize.STRING, allowNull: true }],
    ['review_reason', { type: db.Sequelize.TEXT, allowNull: true }],
    ['reviewed_at', { type: db.Sequelize.DATE, allowNull: true }],
    ['updated_at', { type: db.Sequelize.DATE, allowNull: true, defaultValue: db.Sequelize.literal('CURRENT_TIMESTAMP') }]
  ]);

  await ensureTableColumns('users', [['password_hash', { type: db.Sequelize.STRING, allowNull: true }]]);
  await ensureTableColumns('users', [['module_permissions', { type: db.Sequelize.JSONB, allowNull: true }]]);

  await ensureTableColumns('login_audits', [
    ['username', { type: db.Sequelize.STRING, allowNull: true }],
    ['status', { type: db.Sequelize.STRING, allowNull: true, defaultValue: 'success' }],
    ['ip_address', { type: db.Sequelize.STRING, allowNull: true }],
    ['user_agent', { type: db.Sequelize.TEXT, allowNull: true }],
    ['failure_reason', { type: db.Sequelize.TEXT, allowNull: true }]
  ]);

  await ensureTableColumns('interview_schedules', [
    ['interviewer_id', { type: db.Sequelize.UUID, allowNull: true }],
    ['interview_mode', { type: db.Sequelize.STRING, allowNull: true, defaultValue: 'offline' }]
  ]);

  await ensureTableColumns('platform_configs', [
    ['sync_mode', { type: db.Sequelize.STRING, allowNull: true, defaultValue: 'official_api' }],
    ['api_endpoint', { type: db.Sequelize.STRING, allowNull: true }],
    ['resume_import_enabled', { type: db.Sequelize.BOOLEAN, allowNull: true, defaultValue: true }],
    ['job_publish_enabled', { type: db.Sequelize.BOOLEAN, allowNull: true, defaultValue: false }],
    ['last_sync_at', { type: db.Sequelize.DATE, allowNull: true }],
    ['notes', { type: db.Sequelize.TEXT, allowNull: true }]
  ]);

  await ensureTableColumns('platform_accounts', [
    ['last_test_at', { type: db.Sequelize.DATE, allowNull: true }],
    ['last_test_status', { type: db.Sequelize.STRING, allowNull: true, defaultValue: 'pending' }],
    ['last_test_message', { type: db.Sequelize.TEXT, allowNull: true }]
  ]);
};

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

const ensureDefaultUsers = async () => {
  const roles = [
    { code: 'super_admin', name: '超级管理员' },
    { code: 'hr_manager', name: 'HR经理' },
    { code: 'interviewer', name: '面试官' }
  ];

  for (const role of roles) {
    await db.Role.findOrCreate({
      where: { code: role.code },
      defaults: role
    });
  }

  const roleMap = Object.fromEntries((await db.Role.findAll()).map((role) => [role.code, role.id]));
  const bootstrapUsername = String(process.env.BOOTSTRAP_ADMIN_USERNAME || '').trim();
  const bootstrapPassword = String(process.env.BOOTSTRAP_ADMIN_PASSWORD || '').trim();

  if (!bootstrapUsername || !bootstrapPassword) {
    return;
  }

  const existingAdmin = await db.User.findOne({
    where: {
      role_id: roleMap.super_admin
    }
  });

  if (existingAdmin) {
    return;
  }

  const passwordHash = await bcrypt.hash(bootstrapPassword, 10);

  await db.User.create({
    username: bootstrapUsername,
    name: String(process.env.BOOTSTRAP_ADMIN_NAME || bootstrapUsername).trim(),
    email: String(process.env.BOOTSTRAP_ADMIN_EMAIL || '').trim() || null,
    role_id: roleMap.super_admin,
    password_hash: passwordHash,
    module_permissions: HR_MANAGER_DEFAULT_MODULES
  });
};

const ensureDefaultPlatformTemplates = async () => {
  const templates = [
    {
      code: 'email_generic',
      name: '邮箱同步',
      category: 'email_ingest',
      supports_job_publish: false,
      supports_resume_pull: true,
      supports_webhook: false,
      auth_schema: [
        { key: 'imap_host', label: 'IMAP地址', type: 'text', required: true },
        { key: 'imap_port', label: 'IMAP端口', type: 'number', required: true },
        { key: 'imap_user', label: '邮箱账号', type: 'text', required: true },
        { key: 'imap_password', label: '邮箱授权码', type: 'password', required: true },
        { key: 'mailbox', label: '收件箱', type: 'text', required: true },
        { key: 'default_job_id', label: '默认岗位（可选）', type: 'text', required: false }
      ]
    }
  ];

  for (const item of templates) {
    const [template] = await db.PlatformTemplate.findOrCreate({
      where: { code: item.code },
      defaults: item
    });

    await template.update({
      name: item.name,
      category: item.category,
      supports_job_publish: item.supports_job_publish,
      supports_resume_pull: item.supports_resume_pull,
      supports_webhook: item.supports_webhook,
      auth_schema: item.auth_schema
    });
  }
};

const ensureDefaultModuleAccessRules = async () => {
  if (!db.ModuleAccessRule) {
    return;
  }

  const defaults = [
    {
      module_code: 'jobs',
      grant_modules: [
        'dashboard',
        'resumes',
        'screening',
        'review',
        'scheduling',
        'interviews',
        'offers',
        'talent_pool',
        'reports',
        'people',
        'platforms'
      ]
    },
    {
      module_code: 'resumes',
      grant_modules: ['dashboard', 'offers', 'talent_pool']
    },
    {
      module_code: 'talent_pool',
      grant_modules: ['dashboard']
    }
  ];

  for (const item of defaults) {
    const [rule] = await db.ModuleAccessRule.findOrCreate({
      where: { module_code: item.module_code },
      defaults: item
    });

    await rule.update({ grant_modules: item.grant_modules });
  }
};

const runStartupBackfill = async () => {
  try {
    await backfillResumeExperiences();
    await backfillResumeProfileFields();
    console.log('Startup backfill completed.');
  } catch (error) {
    console.error('Startup backfill failed:', error.message);
  }
};

const backfillResumeExperiences = async () => {
  const resumes = await db.Resume.findAll({
    where: {
      current_company: { [Op.not]: null },
      current_position: { [Op.not]: null }
    },
    include: [{ model: db.ResumeExperience }]
  });

  for (const resume of resumes) {
    if ((resume.ResumeExperiences || []).length) {
      continue;
    }

    await db.ResumeExperience.create({
      resume_id: resume.id,
      company_name: resume.current_company,
      position_name: resume.current_position,
      is_current: true
    });
  }
};

const backfillResumeProfileFields = async () => {
  const resumes = await db.Resume.findAll({
    where: {
      file_url: { [Op.ne]: null },
      [Op.or]: [
        { gender: null },
        { age: null },
        { education: null },
        { work_years: null },
        { school_major: null },
        { school_major: { [Op.iLike]: '%自我评价%' } },
        { school_major: { [Op.iLike]: '%工作经历%' } },
        { school_major: { [Op.iLike]: '%项目经历%' } },
        { school_major: { [Op.iLike]: '%项目经验%' } },
        { school_major: { [Op.iLike]: '%个人总结%' } },
        { current_company: null },
        { current_position: null }
      ]
    }
  });

  for (const resume of resumes) {
    const relativePath = String(resume.file_url || '').replace(/^\//, '');

    if (!relativePath) {
      continue;
    }

    const filePath = path.join(__dirname, relativePath);

    try {
      const parsed = await parseResumeFile(filePath, path.basename(filePath));
      const payload = {};

      if ((!resume.name || isSuspiciousName(resume.name)) && parsed.name && !isSuspiciousName(parsed.name)) {
        payload.name = parsed.name;
      }
      if (!resume.gender && parsed.gender) payload.gender = parsed.gender;
      if (!resume.age && parsed.age) payload.age = parsed.age;
      if (!resume.education && parsed.education) payload.education = parsed.education;
      if (!resume.work_years && parsed.work_years) payload.work_years = parsed.work_years;
      const invalidSchoolMajor =
        !resume.school_major ||
        resume.school_major.length > 80 ||
        /自我评价|工作经历|项目经历|项目经验|个人评价|个人总结/.test(resume.school_major);
      if (invalidSchoolMajor && parsed.school_major) payload.school_major = parsed.school_major;
      if (!resume.current_company && parsed.current_company) payload.current_company = parsed.current_company;
      if (!resume.current_position && parsed.current_position) payload.current_position = parsed.current_position;
      if (!resume.phone && parsed.phone) payload.phone = parsed.phone;
      if (!resume.email && parsed.email) payload.email = parsed.email;

      if (Object.keys(payload).length) {
        payload.updated_at = new Date();
        await resume.update(payload);
      }
    } catch (error) {
      // Ignore unreadable historical files and continue startup.
    }
  }
};

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(loadCurrentUser);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRouter);
app.use('/api', requireAuth);

app.use('/api/jobs', jobsRouter);
app.use('/api/resumes', resumesRouter);
app.use('/api/interviews', interviewsRouter);
app.use('/api/offers', offersRouter);
app.use('/api/talent-pool', talentPoolRouter);
app.use('/api/users', usersRouter);
app.use('/api/session', sessionRouter);
app.use('/api/platforms', platformsRouter);
app.use('/api/reports', reportsRouter);

db.sequelize
  .sync({ force: false })
  .then(async () => {
    await ensureRecruitmentSchema();
    await ensureDefaultUsers();
    await ensureDefaultPlatformTemplates();
    await ensureDefaultModuleAccessRules();
    console.log('Sync db.');
    const syncSchedule = process.env.EMAIL_SYNC_CRON || '*/10 * * * *';
    cron.schedule(syncSchedule, async () => {
      try {
        await syncAllEmailAccounts();
      } catch (error) {
        console.error('Email sync failed:', error.message);
      }
    });
    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
      if (process.env.ENABLE_STARTUP_BACKFILL !== 'false') {
        setImmediate(runStartupBackfill);
      }
    });
  })
  .catch((error) => {
    console.error('Unable to sync database:', error);
    process.exit(1);
  });
