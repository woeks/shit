#!/usr/bin/env node

const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const db = require('../models');
const { parseResumeFile, parseResumeText, mergeResumeFields } = require('../utils/resume-parser');
const {
  buildEmailResumeAnalysis,
  buildResumePatchFromParsed,
  normalizeParsedProfile,
  parseEmailTemplateFields
} = require('../services/email-sync');
const { findJobSuggestion } = require('../utils/job-matcher');

const cleanText = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const invalidTextPattern = /教育背景|教育经历|工作经历|项目经历|项目经验|总体概述|自我评价|个人总结|个人优势|核心优势/;
const isInvalidExperienceValue = (value, maxLength = 80) => {
  const normalized = cleanText(value);
  return !normalized || normalized.length > maxLength || invalidTextPattern.test(normalized);
};

const pickSenderName = (rawPayload) => cleanText(rawPayload?.from_name || rawPayload?.from || '').replace(/<.*?>/g, '').trim();
const pickSenderEmail = (rawPayload) => {
  const direct = cleanText(rawPayload?.from_email || '');
  if (direct) {
    return direct;
  }
  const matched = String(rawPayload?.from || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return matched?.[0] || '';
};

const parseDateValue = (value) => {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const updateExperienceSnapshot = async (resume, parsed, transaction) => {
  if (!parsed.current_company && !parsed.current_position) {
    return;
  }

  const latestExperience = await db.ResumeExperience.findOne({
    where: { resume_id: resume.id },
    order: [['start_date', 'DESC NULLS LAST'], ['created_at', 'DESC']],
    transaction
  });

  if (!latestExperience) {
    if (!parsed.current_company || !parsed.current_position) {
      return;
    }
    await db.ResumeExperience.create(
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
  if (isInvalidExperienceValue(latestExperience.company_name) && parsed.current_company) {
    patch.company_name = parsed.current_company;
  }
  if (isInvalidExperienceValue(latestExperience.position_name, 60) && parsed.current_position) {
    patch.position_name = parsed.current_position;
  }
  if (Object.keys(patch).length) {
    await latestExperience.update(patch, { transaction });
  }
};

const reparseEmailResumes = async ({ limit = 0 } = {}) => {
  const records = await db.PlatformResumeRecord.findAll({
    include: [
      {
        model: db.Resume,
        where: { source: 'email' },
        required: true
      }
    ],
    order: [['imported_at', 'DESC']]
  });

  const latestByResume = new Map();
  for (const record of records) {
    if (!record.resume_id || latestByResume.has(record.resume_id)) {
      continue;
    }
    latestByResume.set(record.resume_id, record);
  }

  const targets = Array.from(latestByResume.values()).slice(0, limit > 0 ? limit : undefined);
  const jobs = await db.Job.findAll({ attributes: ['id', 'title', 'interview_rounds', 'aliases'] });

  let updated = 0;
  let skipped = 0;

  for (const record of targets) {
    const resume = record.Resume;
    const relativePath = String(resume.file_url || '').replace(/^\//, '');
    const filePath = relativePath ? path.join(__dirname, '..', relativePath) : '';

    if (!relativePath) {
      skipped += 1;
      continue;
    }

    try {
      const attachmentFields = normalizeParsedProfile(await parseResumeFile(filePath, path.basename(filePath)));
      const rawPayload = record.raw_payload || {};
      const emailBodyFields = normalizeParsedProfile(
        parseResumeText(rawPayload.text_body || '', rawPayload.subject || path.basename(filePath))
      );
      const templateContext = parseEmailTemplateFields({
        subject: rawPayload.subject || '',
        from: {
          text: rawPayload.from || '',
          value: [{ address: rawPayload.from_email || '', name: rawPayload.from_name || '' }]
        }
      });
      const emailTemplateFields = normalizeParsedProfile(templateContext.fields || {});
      const fallbackFields = normalizeParsedProfile({
        name: pickSenderName(rawPayload),
        email: pickSenderEmail(rawPayload)
      });
      const { mergedFields, analysis } = buildEmailResumeAnalysis({
        attachmentFields,
        emailBodyFields,
        emailTemplateFields,
        emailFallbackFields: fallbackFields
      });
      const normalized = mergeResumeFields({}, mergedFields);
      const transaction = await db.sequelize.transaction();

      try {
        const resolvedJob =
          resume.job_id
            ? await db.Job.findByPk(resume.job_id, { transaction })
            : findJobSuggestion(
                jobs,
                rawPayload.file_name || path.basename(filePath),
                templateContext.template_job || '',
                rawPayload.subject || '',
                rawPayload.text_body || '',
                attachmentFields.text || ''
              ) || null;
        const sourceReceivedAt = parseDateValue(rawPayload.email_received_at);
        const payload = buildResumePatchFromParsed(resume, normalized, resolvedJob, sourceReceivedAt);

        if (Object.keys(payload).length) {
          await resume.update(payload, { transaction });
        }

        await updateExperienceSnapshot(resume, normalized, transaction);
        await record.update(
          {
            parsed_snapshot: {
              ...normalized,
              _meta: analysis
            },
            last_sync_at: new Date()
          },
          { transaction }
        );
        await transaction.commit();
        updated += 1;
      } catch (error) {
        await transaction.rollback();
        skipped += 1;
        console.error(`reparse email resume failed: ${resume.id}`, error.message);
      }
    } catch (error) {
      skipped += 1;
      console.error(`parse email resume failed: ${resume.id}`, error.message);
    }
  }

  return { updated, skipped, total: targets.length };
};

const main = async () => {
  const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.replace('--limit=', '')) : 0;
  const result = await reparseEmailResumes({ limit: Number.isFinite(limit) ? limit : 0 });
  console.log(JSON.stringify(result));
  await db.sequelize.close();
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
