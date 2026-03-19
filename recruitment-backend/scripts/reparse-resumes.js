#!/usr/bin/env node

const path = require('path');
const dotenv = require('dotenv');
const { isSuspiciousName, parseResumeFile } = require('../utils/resume-parser');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const db = require('../models');

const sectionTitlePattern =
  /^(个人信息|基本信息|教育背景|教育经历|工作经历|项目经历|职业经历|实习经历|自我评价|个人总结|求职意向|专业技能|技能特长|培训经历|荣誉奖项|证书|社会经历|教育|技能|工作经验|个人优势|个人简介|个人概况|核心优势)$/;
const nameStopwordsPattern = /^(以及|内容|业绩|职责|项目|工作|教育|技能|简历|姓名)$/;

const isSectionTitle = (value) => sectionTitlePattern.test(String(value || '').trim());

const isBadName = (value) => {
  const name = String(value || '').trim();
  if (!name) return true;
  if (name === '~~') return true;
  if (isSectionTitle(name)) return true;
  if (nameStopwordsPattern.test(name)) return true;
  if (/[0-9]/.test(name)) return true;
  if (/[A-Za-z]{2,}/.test(name)) return true;
  if (name.length > 6) return true;
  return isSuspiciousName(name);
};

const isBlank = (value) => value === null || value === undefined || String(value).trim() === '';

const pickBetter = (parsed, existing, validator) => {
  const parsedValue = isBlank(parsed) ? '' : String(parsed).trim();
  const existingValue = isBlank(existing) ? '' : String(existing).trim();

  if (parsedValue && (!validator || validator(parsedValue))) {
    return parsedValue;
  }

  if (existingValue && (!validator || validator(existingValue))) {
    return existingValue;
  }

  return parsedValue || existingValue || null;
};

const normalizeNumber = (value) => {
  if (value === null || value === undefined) return null;
  const matched = String(value).match(/\d{1,3}/);
  return matched ? Number(matched[0]) : null;
};

const reparse = async ({ ids }) => {
  const where = { file_url: { [db.Sequelize.Op.ne]: null } };

  const resumes = await db.Resume.findAll({ where, order: [['created_at', 'DESC']] });
  const target = ids.length
    ? resumes.filter((item) => ids.includes(item.id))
    : resumes.filter((item) => {
        if (isBadName(item.name)) return true;
        return (
          isBlank(item.gender) ||
          isBlank(item.age) ||
          isBlank(item.education) ||
          isBlank(item.work_years) ||
          isBlank(item.school_major) ||
          isBlank(item.current_company) ||
          isBlank(item.current_position)
        );
      });

  let updated = 0;
  let skipped = 0;

  for (const resume of target) {
    const relativePath = String(resume.file_url || '').replace(/^\//, '');
    if (!relativePath) {
      skipped += 1;
      continue;
    }

    const filePath = path.join(__dirname, '..', relativePath);
    try {
      const parsed = await parseResumeFile(filePath, path.basename(filePath));
      const payload = {
        name: pickBetter(parsed.name, resume.name, (value) => !isBadName(value)),
        gender: pickBetter(parsed.gender, resume.gender, (value) => /^(男|女)$/.test(value)),
        age: normalizeNumber(pickBetter(parsed.age, resume.age)),
        education: pickBetter(parsed.education, resume.education),
        work_years: normalizeNumber(pickBetter(parsed.work_years, resume.work_years)),
        school_major: pickBetter(parsed.school_major, resume.school_major),
        current_company: pickBetter(parsed.current_company, resume.current_company),
        current_position: pickBetter(parsed.current_position, resume.current_position),
        phone: pickBetter(parsed.phone, resume.phone),
        email: pickBetter(parsed.email, resume.email)
      };

      await resume.update({ ...payload, updated_at: new Date() });
      updated += 1;
    } catch (error) {
      skipped += 1;
      console.error(`reparse failed: ${resume.id}`, error.message);
    }
  }

  return { updated, skipped, total: target.length };
};

const main = async () => {
  const idsArg = process.argv.find((arg) => arg.startsWith('--ids='));
  const ids = idsArg ? idsArg.replace('--ids=', '').split(',').map((id) => id.trim()).filter(Boolean) : [];

  const result = await reparse({ ids });
  console.log(JSON.stringify(result));
  await db.sequelize.close();
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
