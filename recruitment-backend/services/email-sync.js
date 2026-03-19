const fs = require('fs');
const path = require('path');
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const { Op } = require('sequelize');
const {
  PlatformAccount,
  PlatformTemplate,
  PlatformResumeRecord,
  Resume,
  Job,
  ResumeExperience,
  ResumeStageLog
} = require('../models');
const { parseResumeFile, parseResumeText, mergeResumeFields, isSuspiciousName } = require('../utils/resume-parser');
const { appendResumeStageLog } = require('../utils/workflow');
const { findJobSuggestion } = require('../utils/job-matcher');

const uploadDir = path.join(__dirname, '..', 'uploads', 'resumes');
const runningEmailSyncAccounts = new Set();

fs.mkdirSync(uploadDir, { recursive: true });

const parseJsonText = (value) => {
  if (!value || typeof value === 'object') {
    return value || null;
  }

  if (!value || typeof value !== 'string' || !value.trim()) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const parseDateValue = (value) => {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const normalizeReceivedHeaderValues = (value) => {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.map((item) => String(item || '')).filter(Boolean);
  }

  return [String(value)];
};

const extractDateFromReceivedHeader = (headerValue) => {
  const normalized = String(headerValue || '').trim();
  if (!normalized) {
    return null;
  }

  const dateSegment = normalized.includes(';') ? normalized.slice(normalized.lastIndexOf(';') + 1).trim() : normalized;
  return parseDateValue(dateSegment);
};

const extractEmailReceivedAt = (parsed, envelopeDate = null) => {
  const candidates = [];
  const receivedHeader = parsed?.headers?.get?.('received');
  for (const item of normalizeReceivedHeaderValues(receivedHeader)) {
    const extracted = extractDateFromReceivedHeader(item);
    if (extracted) {
      candidates.push(extracted);
    }
  }

  for (const header of parsed?.headerLines || []) {
    if (String(header?.key || '').toLowerCase() !== 'received') {
      continue;
    }
    const extracted = extractDateFromReceivedHeader(header?.line || header?.value || '');
    if (extracted) {
      candidates.push(extracted);
    }
  }

  const latestReceived = candidates.sort((a, b) => b.getTime() - a.getTime())[0] || null;
  return latestReceived || parseDateValue(parsed?.date) || parseDateValue(envelopeDate) || null;
};

const maxDateValue = (...values) => {
  const dates = values
    .map((value) => parseDateValue(value))
    .filter(Boolean)
    .sort((a, b) => a.getTime() - b.getTime());

  return dates[dates.length - 1] || null;
};

const extractConnectionConfig = (account) => {
  const snapshot = account.auth_snapshot && typeof account.auth_snapshot === 'object' ? account.auth_snapshot : {};
  const credentials = parseJsonText(account.credentials_encrypted) || {};

  return {
    ...snapshot,
    ...credentials
  };
};

const isEmailSyncRunning = (accountId) => runningEmailSyncAccounts.has(accountId);

const saveSyncSnapshot = async (account, snapshot, updates = {}) => {
  await account.update({
    auth_snapshot: snapshot,
    updated_at: new Date(),
    ...updates
  });
};

const normalizeFilename = (name) => {
  if (!name) {
    return `resume-${Date.now()}.bin`;
  }

  return name.replace(/\s+/g, '-').replace(/[^\w.\-()（）\u4e00-\u9fa5]/g, '');
};

const buildExternalResumeId = (messageId, filename, uid) => {
  const source = messageId || `uid:${uid}`;
  return `${source}#${filename || 'resume'}`;
};

const isAllowedAttachment = (filename) => /\.(pdf|docx|doc|txt)$/i.test(filename || '');

const pickDefaultJobId = (config) => (config.default_job_id ? String(config.default_job_id).trim() : '');

const cleanupFile = async (filePath) => {
  if (!filePath) {
    return;
  }

  try {
    await fs.promises.unlink(filePath);
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }
};

const invalidSchoolMajorPattern = /自我评价|工作经历|项目经历|项目经验|个人评价|个人总结/;
const invalidTextPattern = /教育背景|教育经历|工作经历|项目经历|项目经验|总体概述|自我评价|个人总结|个人优势|核心优势/;
const educationWhitelist = /博士|硕士|本科|大专|专科|中专|高中/;
const emailPattern = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
const platformEmailPattern = /(service\.bosszhipin\.com|kanzhun\.com|zhipin\.com)$/i;
const mobilePattern = /^1[3-9]\d{9}$/;

const cleanText = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const isInvalidEmail = (value) => !emailPattern.test(cleanText(value)) || platformEmailPattern.test((cleanText(value).split('@')[1] || '').trim());
const isInvalidPhone = (value) => !mobilePattern.test(cleanText(value));
const isInvalidEducation = (value) => !educationWhitelist.test(cleanText(value));
const isInvalidSchoolMajorValue = (value) => {
  const normalized = cleanText(value);
  if (!normalized || normalized.length > 80 || invalidSchoolMajorPattern.test(normalized)) {
    return true;
  }
  if (/^(技能|专业|教育|学历|的.+|在.+|于.+)$/.test(normalized)) {
    return true;
  }
  if (/\/\s*(的|在|于)/.test(normalized) || /技术储备/.test(normalized)) {
    return true;
  }
  return false;
};
const isInvalidTextValue = (value, maxLength = 80) => {
  const normalized = cleanText(value);
  return !normalized || normalized.length > maxLength || invalidTextPattern.test(normalized);
};
const shouldReplaceName = (current, next) => {
  const currentValue = cleanText(current);
  const nextValue = cleanText(next);
  if (!nextValue || isSuspiciousName(nextValue) || invalidTextPattern.test(nextValue) || /\d/.test(nextValue)) {
    return false;
  }
  return !currentValue || isSuspiciousName(currentValue) || invalidTextPattern.test(currentValue) || /\d/.test(currentValue);
};
const degreeRank = {
  高中: 1,
  中专: 2,
  大专: 3,
  本科: 4,
  硕士: 5,
  博士: 6
};
const shouldReplaceSchoolMajor = (current, next) => {
  const currentValue = cleanText(current);
  const nextValue = cleanText(next);
  if (!nextValue || isInvalidSchoolMajorValue(nextValue)) {
    return false;
  }
  return !currentValue || isInvalidSchoolMajorValue(currentValue) || (!currentValue.includes('/') && nextValue.includes('/'));
};
const shouldReplaceCompany = (currentCompany, currentPosition, nextCompany, nextPosition) => {
  const currentCompanyValue = cleanText(currentCompany);
  const currentPositionValue = cleanText(currentPosition);
  const nextCompanyValue = cleanText(nextCompany);
  const nextPositionValue = cleanText(nextPosition);
  if (!nextCompanyValue || isInvalidTextValue(nextCompanyValue)) {
    return false;
  }
  if (!currentCompanyValue || isInvalidTextValue(currentCompanyValue)) {
    return true;
  }
  if (nextPositionValue && currentPositionValue && nextPositionValue === currentPositionValue && nextCompanyValue !== currentCompanyValue) {
    return true;
  }
  return false;
};
const shouldReplacePosition = (current, next) => {
  const currentValue = cleanText(current);
  const nextValue = cleanText(next);
  if (!nextValue || isInvalidTextValue(nextValue, 60)) {
    return false;
  }
  return !currentValue || isInvalidTextValue(currentValue, 60);
};

const pickSenderName = (mail) => {
  const sender = mail?.from?.value?.[0]?.name || '';
  const normalized = cleanText(sender).replace(/(先生|女士|小姐)$/, '');
  if (!normalized || isSuspiciousName(normalized) || invalidTextPattern.test(normalized) || /\d/.test(normalized)) {
    return '';
  }
  return normalized;
};

const pickNameFromSubject = (subject) => {
  const normalized = cleanText(subject);
  const matches = normalized.match(/[\u4e00-\u9fa5]{2,4}/g) || [];
  const candidates = matches.filter((item) => !invalidTextPattern.test(item) && !isSuspiciousName(item));
  return candidates[0] || '';
};

const parseTemplateWorkYears = (value) => {
  const normalized = cleanText(value);
  const matched = normalized.match(/(\d{1,2})(?:\s*(?:年|年以上|-\d{1,2}年|到\d{1,2}年))/);
  return matched ? Number(matched[1]) : null;
};

const parseEmailTemplateFields = (parsed) => {
  const subject = cleanText(parsed?.subject || '');
  if (!subject) {
    return { fields: {}, template_job: '' };
  }

  const normalizedFrom = cleanText(parsed?.from?.value?.[0]?.address || parsed?.from?.text || '');
  const isBossTemplate = /bosszhipin\.com|kanzhun\.com|zhipin\.com/i.test(normalizedFrom) || /BOSS直聘/i.test(subject);
  const segments = subject.split('|').map((item) => cleanText(item)).filter(Boolean);
  const fields = {};
  let templateJob = '';

  if (isBossTemplate && segments.length >= 2) {
    const nameCandidate = cleanText(segments[0]).replace(/(先生|女士|小姐)$/, '');
    if (nameCandidate && !isSuspiciousName(nameCandidate) && !invalidTextPattern.test(nameCandidate)) {
      fields.name = nameCandidate;
    }

    const yearSegment = segments.find((item) => /(?:年|年以上)/.test(item));
    const workYears = parseTemplateWorkYears(yearSegment);
    if (workYears) {
      fields.work_years = workYears;
    }

    const jobSegment =
      segments.find((item) => /^应聘/.test(item)) ||
      segments.find((item) => /(?:开发|工程师|经理|主管|专员|设计|运营|测试|销售|产品|架构师)/.test(item));

    if (jobSegment) {
      templateJob = cleanText(jobSegment.replace(/^应聘\s*/, '').replace(/【.*$/, ''));
    }
  }

  return {
    fields,
    template_job: templateJob
  };
};

const normalizeParsedProfile = (fields) => {
  const normalized = {
    name: cleanText(fields.name),
    gender: cleanText(fields.gender),
    age: fields.age ? Number(fields.age) : null,
    education: cleanText(fields.education),
    work_years: fields.work_years ? Number(fields.work_years) : null,
    school_major: cleanText(fields.school_major),
    current_company: cleanText(fields.current_company),
    current_position: cleanText(fields.current_position),
    phone: cleanText(fields.phone),
    email: cleanText(fields.email),
    text: fields.text || ''
  };

  if (normalized.current_company && normalized.current_position && normalized.current_position.startsWith(normalized.current_company)) {
    normalized.current_position = cleanText(normalized.current_position.slice(normalized.current_company.length));
  }

  if (!normalized.name || isSuspiciousName(normalized.name) || invalidTextPattern.test(normalized.name) || /\d/.test(normalized.name)) {
    normalized.name = '';
  }
  if (!['男', '女'].includes(normalized.gender)) {
    normalized.gender = '';
  }
  if (!Number.isInteger(normalized.age) || normalized.age < 16 || normalized.age > 65) {
    normalized.age = null;
  }
  if (!normalized.education || !educationWhitelist.test(normalized.education)) {
    normalized.education = '';
  }
  if (!Number.isInteger(normalized.work_years) || normalized.work_years < 0 || normalized.work_years > 40) {
    normalized.work_years = null;
  }
  if (
    !normalized.school_major ||
    normalized.school_major.length > 80 ||
    isInvalidSchoolMajorValue(normalized.school_major)
  ) {
    normalized.school_major = '';
  }
  if (isInvalidTextValue(normalized.current_company)) {
    normalized.current_company = '';
  }
  if (isInvalidTextValue(normalized.current_position, 60)) {
    normalized.current_position = '';
  }
  if (isInvalidPhone(normalized.phone)) {
    normalized.phone = '';
  }
  if (isInvalidEmail(normalized.email)) {
    normalized.email = '';
  }

  return normalized;
};

const mergeEmailResumeFields = (...sources) => {
  const merged = {};
  const keys = ['name', 'gender', 'age', 'education', 'work_years', 'school_major', 'current_company', 'current_position', 'phone', 'email'];

  for (const key of keys) {
    for (const source of sources) {
      const value = source?.[key];
      if (value !== null && value !== undefined && String(value).trim() !== '') {
        merged[key] = value;
        break;
      }
    }
  }

  return merged;
};

const buildEmailResumeAnalysis = ({ attachmentFields, emailBodyFields, emailTemplateFields, emailFallbackFields }) => {
  const mergedFields = mergeEmailResumeFields(attachmentFields, emailBodyFields, emailTemplateFields, emailFallbackFields);
  const fieldSources = {};
  const fieldConfidence = {};
  const comparableKeys = ['name', 'gender', 'age', 'education', 'work_years', 'school_major', 'current_company', 'current_position', 'phone', 'email'];
  const sourceEntries = [
    { key: 'attachment', weight: 0.92, fields: attachmentFields || {} },
    { key: 'email_body', weight: 0.76, fields: emailBodyFields || {} },
    { key: 'email_template', weight: 0.84, fields: emailTemplateFields || {} },
    { key: 'email_meta', weight: 0.58, fields: emailFallbackFields || {} }
  ];

  for (const key of comparableKeys) {
    const winner = mergedFields[key];
    if (winner === null || winner === undefined || String(winner).trim() === '') {
      continue;
    }

    const matchedSources = sourceEntries.filter(({ fields }) => {
      const value = fields[key];
      return value !== null && value !== undefined && String(value).trim() !== '' && String(value).trim() === String(winner).trim();
    });

    const bestSource = matchedSources[0]?.key || 'unknown';
    const boost = matchedSources.length > 1 ? Math.min(0.12, (matchedSources.length - 1) * 0.06) : 0;
    const baseConfidence = matchedSources[0]?.weight || 0.4;

    fieldSources[key] = matchedSources.map((item) => item.key);
    fieldConfidence[key] = Number(Math.min(0.99, baseConfidence + boost).toFixed(2));

    if (!fieldSources[key].length) {
      fieldSources[key] = [bestSource];
    }
  }

  const presentConfidences = Object.values(fieldConfidence);
  const overallConfidence = presentConfidences.length
    ? Number((presentConfidences.reduce((sum, item) => sum + item, 0) / presentConfidences.length).toFixed(2))
    : 0;
  const lowConfidenceFields = Object.entries(fieldConfidence)
    .filter(([, score]) => Number(score) < 0.75)
    .map(([key]) => key);

  return {
    mergedFields,
    analysis: {
      field_sources: fieldSources,
      field_confidence: fieldConfidence,
      overall_confidence: overallConfidence,
      low_confidence_fields: lowConfidenceFields
    }
  };
};

const buildResumePatchFromParsed = (resume, parsed, job, sourceReceivedAt = null) => {
  const payload = {};

  if (shouldReplaceName(resume.name, parsed.name)) {
    payload.name = parsed.name;
  }
  if ((!resume.gender || !['男', '女'].includes(resume.gender)) && parsed.gender) payload.gender = parsed.gender;
  if ((!resume.age || Number(resume.age) < 16 || Number(resume.age) > 65) && parsed.age) payload.age = Number(parsed.age);
  if (
    parsed.education &&
    (
      !resume.education ||
      isInvalidEducation(resume.education) ||
      (degreeRank[parsed.education] || 0) > (degreeRank[resume.education] || 0)
    )
  ) {
    payload.education = parsed.education;
  }
  if ((!resume.work_years || Number(resume.work_years) < 0 || Number(resume.work_years) > 40) && parsed.work_years) {
    payload.work_years = Number(parsed.work_years);
  }
  if (shouldReplaceSchoolMajor(resume.school_major, parsed.school_major)) {
    payload.school_major = parsed.school_major;
  } else if (isInvalidSchoolMajorValue(resume.school_major) && !parsed.school_major) {
    payload.school_major = null;
  }
  if (shouldReplaceCompany(resume.current_company, resume.current_position, parsed.current_company, parsed.current_position)) {
    payload.current_company = parsed.current_company;
  }
  if (shouldReplacePosition(resume.current_position, parsed.current_position)) {
    payload.current_position = parsed.current_position;
  } else if (
    parsed.current_position &&
    resume.current_company &&
    resume.current_position &&
    cleanText(resume.current_position).startsWith(cleanText(resume.current_company)) &&
    cleanText(parsed.current_position) !== cleanText(resume.current_position)
  ) {
    payload.current_position = parsed.current_position;
  } else if (isInvalidTextValue(resume.current_position, 60) && !parsed.current_position) {
    payload.current_position = null;
  }
  if ((isInvalidPhone(resume.phone) || !resume.phone) && parsed.phone) payload.phone = parsed.phone;
  if ((isInvalidEmail(resume.email) || !resume.email) && parsed.email) {
    payload.email = parsed.email;
  } else if (isInvalidEmail(resume.email) && !parsed.email) {
    payload.email = null;
  }

  if (!resume.job_id && job?.id) {
    payload.job_id = job.id;
    payload.total_rounds = job.interview_rounds || resume.total_rounds || 3;
  }

  const normalizedSourceReceivedAt = parseDateValue(sourceReceivedAt);
  const currentSourceReceivedAt = parseDateValue(resume.source_received_at);
  if (normalizedSourceReceivedAt && (!currentSourceReceivedAt || normalizedSourceReceivedAt < currentSourceReceivedAt)) {
    payload.source_received_at = normalizedSourceReceivedAt;
  }

  if (Object.keys(payload).length) {
    payload.updated_at = new Date();
  }

  return payload;
};

const syncExistingResumeExperience = async (resume, parsed, transaction) => {
  if (!parsed.current_company && !parsed.current_position) {
    return;
  }

  const latestExperience = await ResumeExperience.findOne({
    where: { resume_id: resume.id },
    order: [['start_date', 'DESC NULLS LAST'], ['created_at', 'DESC']],
    transaction
  });

  if (!latestExperience) {
    await ResumeExperience.create(
      {
        resume_id: resume.id,
        company_name: parsed.current_company || null,
        position_name: parsed.current_position || null,
        is_current: true
      },
      { transaction }
    );
    return;
  }

  const patch = {};
  if ((!latestExperience.company_name || isInvalidTextValue(latestExperience.company_name)) && parsed.current_company) {
    patch.company_name = parsed.current_company;
  }
  if ((!latestExperience.position_name || isInvalidTextValue(latestExperience.position_name, 60)) && parsed.current_position) {
    patch.position_name = parsed.current_position;
  }
  if (Object.keys(patch).length) {
    await latestExperience.update(patch, { transaction });
  }
};

const createResumeFromParsed = async ({ parsed, fileUrl, job, source, sourceReceivedAt, transaction }) => {
  const nameFallback = parsed.name || parsed.email || parsed.phone || '未知候选人';
  const resume = await Resume.create(
    {
      name: nameFallback,
      gender: parsed.gender || null,
      age: parsed.age ? Number(parsed.age) : null,
      education: parsed.education || null,
      work_years: parsed.work_years ? Number(parsed.work_years) : null,
      school_major: parsed.school_major || null,
      current_company: parsed.current_company || null,
      current_position: parsed.current_position || null,
      phone: parsed.phone || null,
      email: parsed.email || null,
      job_id: job ? job.id : null,
      source: source || 'email',
      source_received_at: parseDateValue(sourceReceivedAt),
      total_rounds: job ? job.interview_rounds || 3 : 3,
      current_round: 0,
      file_url: fileUrl,
      status: 'new',
      updated_at: new Date()
    },
    { transaction }
  );

  if (parsed.current_company && parsed.current_position) {
    await ResumeExperience.create(
      {
        resume_id: resume.id,
        company_name: parsed.current_company,
        position_name: parsed.current_position,
        is_current: true
      },
      { transaction }
    );
  }

  await appendResumeStageLog({
    resume_id: resume.id,
    stage: 'resume',
    action: 'received',
    operator: null,
    comment: `邮箱同步入库，来源账号：${source}`,
    metadata: { source: source || 'email', job_id: job ? job.id : null },
    transaction
  });

  return resume;
};

const syncEmailAccount = async (account) => {
  if (runningEmailSyncAccounts.has(account.id)) {
    return { status: 'running', message: '同步任务仍在执行，请稍后再试。' };
  }

  runningEmailSyncAccounts.add(account.id);
  const config = extractConnectionConfig(account);
  const host = config.imap_host;
  const port = Number(config.imap_port || 993);
  const user = config.imap_user;
  const password = config.imap_password;
  const mailbox = config.mailbox || 'INBOX';
  const defaultJobId = pickDefaultJobId(config);
  const subjectFilter = config.subject_filter ? String(config.subject_filter) : '';
  const fromFilter = config.from_filter ? String(config.from_filter) : '';
  const snapshot = account.auth_snapshot && typeof account.auth_snapshot === 'object' ? { ...account.auth_snapshot } : {};
  let boundAt = parseDateValue(snapshot.bound_at);
  let lastMessageAt = parseDateValue(snapshot.last_message_at);
  const lastSyncAt = parseDateValue(account.last_sync_at);

  if (!host || !user || !password) {
    return { status: 'failed', message: '邮箱配置不完整，缺少 IMAP 连接信息。' };
  }

  let job = null;
  if (defaultJobId) {
    job = await Job.findByPk(defaultJobId);
    if (!job) {
      return { status: 'failed', message: '默认岗位不存在或已删除。' };
    }
  }
  const availableJobs = await Job.findAll({ attributes: ['id', 'title', 'interview_rounds', 'aliases'] });

  const client = new ImapFlow({
    host,
    port,
    secure: port === 993 || String(config.imap_tls).toLowerCase() === 'true',
    auth: { user, pass: password },
    socketTimeout: 10 * 60 * 1000
  });

  let syncedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  let connectionError = null;

  try {
    client.on('error', (err) => {
      connectionError = err;
    });
    await client.connect();
    await client.mailboxOpen(mailbox, { readOnly: true });

    if (!boundAt) {
      boundAt = new Date();
      snapshot.bound_at = boundAt.toISOString();
      await saveSyncSnapshot(account, snapshot);
    }

    const bindingSince = maxDateValue(boundAt, lastMessageAt, lastSyncAt) || boundAt;
    const searchQuery = { since: bindingSince };
    const uids = (await client.search(searchQuery)).sort((a, b) => a - b);

    for (const uid of uids) {
      for await (const message of client.fetch([uid], { uid: true, envelope: true, source: true })) {
        const parsed = await simpleParser(message.source);
        let processed = false;

        const messageDate = parsed?.date || message?.envelope?.date || null;
        if (bindingSince && messageDate && messageDate < bindingSince) {
          skippedCount += 1;
          processed = true;
          continue;
        }

        if (subjectFilter && !String(parsed.subject || '').includes(subjectFilter)) {
          skippedCount += 1;
          processed = true;
          continue;
        }

        if (fromFilter && !String(parsed.from?.text || '').includes(fromFilter)) {
          skippedCount += 1;
          processed = true;
          continue;
        }

        const attachments = (parsed.attachments || []).filter((item) => isAllowedAttachment(item.filename));

        if (!attachments.length) {
          skippedCount += 1;
          processed = true;
          continue;
        }

        for (const attachment of attachments) {
          const safeName = normalizeFilename(attachment.filename || `resume-${Date.now()}.pdf`);
          const externalId = buildExternalResumeId(parsed.messageId, safeName, message.uid);

          const exists = await PlatformResumeRecord.findOne({
            where: { platform_account_id: account.id, external_resume_id: externalId }
          });

          if (exists) {
            skippedCount += 1;
            continue;
          }

          const filePath = path.join(uploadDir, `${Date.now()}-${safeName}`);
          await fs.promises.writeFile(filePath, attachment.content);

          const attachmentFields = normalizeParsedProfile(await parseResumeFile(filePath, safeName));
          const emailBodyFields = normalizeParsedProfile(parseResumeText(parsed.text || '', parsed.subject || safeName));
          const templateContext = parseEmailTemplateFields(parsed);
          const emailTemplateFields = normalizeParsedProfile(templateContext.fields || {});
          const emailFallbackFields = normalizeParsedProfile({
            name: pickSenderName(parsed) || pickNameFromSubject(parsed.subject || ''),
            email:
              parsed.replyTo?.value?.[0]?.address ||
              parsed.from?.value?.[0]?.address ||
              ''
          });
          const { mergedFields, analysis } = buildEmailResumeAnalysis({
            attachmentFields,
            emailBodyFields,
            emailTemplateFields,
            emailFallbackFields
          });
          const normalizedMergedFields = mergeResumeFields({}, mergedFields);
          const emailText = parsed.text || '';
          const sourceReceivedAt = extractEmailReceivedAt(parsed, message?.envelope?.date || null);
          const resolvedJob =
            job ||
            findJobSuggestion(
              availableJobs,
              safeName,
              templateContext.template_job || '',
              parsed.subject || '',
              emailText,
              attachmentFields?.text || ''
            ) ||
            null;

          const duplicateConditions = [];
          if (normalizedMergedFields.phone) duplicateConditions.push({ phone: normalizedMergedFields.phone });
          if (normalizedMergedFields.email) duplicateConditions.push({ email: normalizedMergedFields.email });

          const transaction = await Resume.sequelize.transaction();

          try {
            const existingResume = duplicateConditions.length
              ? await Resume.findOne({
                  where: { [Op.or]: duplicateConditions },
                  transaction
                })
              : null;

            let resume = existingResume;

            if (resume) {
              const payload = buildResumePatchFromParsed(resume, normalizedMergedFields, resolvedJob, sourceReceivedAt);
              if (Object.keys(payload).length) {
                await resume.update(payload, { transaction });
              }
              await syncExistingResumeExperience(resume, normalizedMergedFields, transaction);
            } else {
              resume = await createResumeFromParsed({
                parsed: normalizedMergedFields,
                fileUrl: `/uploads/resumes/${path.basename(filePath)}`,
                job: resolvedJob,
                source: 'email',
                sourceReceivedAt,
                transaction
              });
            }

            await PlatformResumeRecord.create(
              {
                platform_account_id: account.id,
                resume_id: resume.id,
                external_resume_id: externalId,
                source_label: parsed.subject || 'Email',
                sync_status: existingResume ? 'duplicate' : 'synced',
                raw_payload: {
                  subject: parsed.subject || '',
                  from: parsed.from?.text || '',
                  from_name: parsed.from?.value?.[0]?.name || '',
                  from_email: parsed.from?.value?.[0]?.address || '',
                  message_id: parsed.messageId || '',
                  email_received_at: sourceReceivedAt ? sourceReceivedAt.toISOString() : '',
                  file_name: safeName,
                  text_body: String(parsed.text || '').slice(0, 4000)
                },
                parsed_snapshot: {
                  ...normalizedMergedFields,
                  _meta: analysis
                },
                imported_at: new Date(),
                last_sync_at: new Date()
              },
              { transaction }
            );

            if (existingResume) {
              await cleanupFile(filePath);
            }
            await transaction.commit();
            if (existingResume) {
              updatedCount += 1;
            } else {
              syncedCount += 1;
            }
            processed = true;
          } catch (error) {
            if (!transaction.finished) {
              await transaction.rollback();
            }
            await cleanupFile(filePath);
            await PlatformResumeRecord.create({
              platform_account_id: account.id,
              external_resume_id: externalId,
              source_label: parsed.subject || 'Email',
              sync_status: 'failed',
              sync_error: error.message,
              imported_at: new Date(),
              last_sync_at: new Date()
            });
            processed = true;
          }
        }

        if (processed) {
          if (messageDate) {
            const nextCursor = maxDateValue(lastMessageAt, messageDate);
            if (nextCursor && (!lastMessageAt || nextCursor.getTime() > lastMessageAt.getTime())) {
              lastMessageAt = nextCursor;
              snapshot.last_message_at = nextCursor.toISOString();
              await saveSyncSnapshot(account, snapshot);
            }
          }
        }
      }

      if (connectionError) {
        throw connectionError;
      }
    }

    await saveSyncSnapshot(account, snapshot, { last_sync_at: new Date() });
    return { status: 'success', message: `同步完成：新增 ${syncedCount}，更新 ${updatedCount}，跳过 ${skippedCount}` };
  } catch (error) {
    if (snapshot.last_message_at) {
      await saveSyncSnapshot(account, snapshot);
    }
    return { status: 'failed', message: error.message };
  } finally {
    await client.logout().catch(() => {});
    runningEmailSyncAccounts.delete(account.id);
  }
};

const syncAllEmailAccounts = async () => {
  const accounts = await PlatformAccount.findAll({
    where: { status: 'active', resume_import_enabled: true },
    include: [{ model: PlatformTemplate }]
  });

  const results = [];

  for (const account of accounts) {
    if (account.PlatformTemplate?.code !== 'email_generic') {
      continue;
    }

    results.push({
      account,
      result: await syncEmailAccount(account)
    });
  }

  return results;
};

module.exports = {
  buildEmailResumeAnalysis,
  buildResumePatchFromParsed,
  normalizeParsedProfile,
  parseEmailTemplateFields,
  syncEmailAccount,
  syncAllEmailAccounts,
  extractConnectionConfig,
  isEmailSyncRunning
};
