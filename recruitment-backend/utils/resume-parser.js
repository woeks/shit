const fs = require('fs');
const os = require('os');
const path = require('path');
const { promisify } = require('util');
const { execFile } = require('child_process');

const execFileAsync = promisify(execFile);
const platformEmailPattern = /(service\.bosszhipin\.com|kanzhun\.com|zhipin\.com)$/i;

const normalizeCompat = (value) => {
  const text = typeof value === 'string' ? value : String(value || '');
  try {
    return text.normalize('NFKC');
  } catch (error) {
    return text;
  }
};

const trimValue = (value) => (typeof value === 'string' ? normalizeCompat(value).trim() : '');
const sectionTitlePattern =
  /^(个人信息|基本信息|教育背景|教育经历|工作经历|项目经历|职业经历|实习经历|自我评价|个人总结|求职意向|专业技能|技能特长|培训经历|荣誉奖项|证书|社会经历|教育|技能|工作经验|个人优势|个人简介|个人概况|核心优势|总体概述|工作内容|项目经验|educationalexperience|workexperience|personaladvantages)$/i;
const nameStopwordsPattern = /^(以及|内容|业绩|职责|项目|工作|教育|技能|简历|姓名|概述|优势)$/;
const invalidMajorPattern = /^(技能|教育|专业|学历|本科|硕士|博士|大专|中专|高中)$/;
const currentDate = new Date();

const cleanField = (value) =>
  trimValue(value)
    .replace(/^[|:：、，。;\s]+/, '')
    .replace(/[|:：、，。;\s]+$/g, '');

const isSuspiciousName = (value) => {
  const normalized = cleanField(value || '').replace(/\s+/g, '');
  if (!normalized) {
    return true;
  }
  if (/^[A-Za-z]{1,4}$/.test(normalized) || /^[A-Za-z0-9_-]{1,6}$/.test(normalized)) {
    return true;
  }
  if (sectionTitlePattern.test(normalized) || nameStopwordsPattern.test(normalized)) {
    return true;
  }
  if (/教育背景|工作经历|总体概述|自我评价|个人优势|核心优势|项目经验/.test(normalized)) {
    return true;
  }
  if (/^[\u4e00-\u9fa5]{5,}$/.test(normalized)) {
    return true;
  }
  return false;
};

const normalizePhone = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  const matched = digits.match(/1[3-9]\d{9}/);
  return matched?.[0] || '';
};

const trimEducationMajor = (value) => {
  let result = cleanField(value || '');
  if (!result) {
    return '';
  }
  result = result.split(/自我评价|工作经历|项目经历|项目经验|教育背景|教育经历|个人评价|个人总结/)[0];
  result = result.replace(/\b20\d{2}\s*-\s*20\d{2}\b/g, '');
  result = result.replace(/20\d{2}[./-]\d{1,2}\s*-\s*(?:20\d{2}[./-]\d{1,2}|至今)/g, '');
  result = result.replace(/20\d{2}\s*年\s*\d{1,2}\s*月[\s\S]{0,6}?(?:至今|20\d{2}\s*年\s*\d{1,2}\s*月)/g, '');
  result = result.replace(/(博士|硕士|本科|大专|中专|高中).*/g, '');
  result = result.replace(/^(的|在|于|和)/, '');
  result = result.replace(/技术储备.*/g, '');
  if (invalidMajorPattern.test(cleanField(result))) {
    return '';
  }
  return cleanField(result);
};

const sanitizeSchoolMajor = (value) => {
  let result = cleanField(value || '');
  if (!result) {
    return '';
  }
  result = result.split(/自我评价|工作经历|项目经历|项目经验|个人评价|个人总结/)[0];
  result = result.replace(/\b20\d{2}\s*-\s*20\d{2}\b/g, '');
  result = result.replace(/20\d{2}[./-]\d{1,2}\s*-\s*(?:20\d{2}[./-]\d{1,2}|至今)/g, '');
  result = result.replace(/20\d{2}\s*年\s*\d{1,2}\s*月[\s\S]{0,6}?(?:至今|20\d{2}\s*年\s*\d{1,2}\s*月)/g, '');
  result = result.replace(/(博士|硕士|本科|大专|中专|高中).*/g, '');
  result = result.replace(/^(的|在|于|和)/, '');
  result = result.replace(/技术储备.*/g, '');
  if (invalidMajorPattern.test(cleanField(result))) {
    return '';
  }
  return cleanField(result);
};

const formatSchoolMajor = (value) => {
  const cleaned = sanitizeSchoolMajor(value);
  if (!cleaned) {
    return '';
  }
  if (cleaned.includes('/')) {
    return cleaned;
  }
  const match = cleaned.match(/([\u4e00-\u9fa5A-Za-z0-9（）()·\-.]{2,40}(?:大学|学院|学校))(.{2,40})/);
  if (match) {
    return `${cleanField(match[1])} / ${cleanField(match[2])}`;
  }
  return cleaned;
};

const pickFirstNumber = (value) => {
  const matched = String(value || '').match(/\d{1,3}/);
  return matched ? Number(matched[0]) : null;
};

const decodeXmlEntities = (value) =>
  value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");

const normalizeText = (value) =>
  normalizeCompat(value)
    .replace(/\r/g, '\n')
    .replace(/\u0000/g, ' ')
    .replace(/\t/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const compactCjkSpacing = (value) => {
  let next = value;
  let prev;
  do {
    prev = next;
    next = next.replace(/([\u4e00-\u9fa5])\s+([\u4e00-\u9fa5])/g, '$1$2');
  } while (next !== prev);
  return next;
};

const normalizeLabelText = (value) => compactCjkSpacing(normalizeText(value));

const splitLines = (text) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

const commandExists = (command) => {
  try {
    const { status } = require('child_process').spawnSync('which', [command], { stdio: 'ignore' });
    return status === 0;
  } catch (error) {
    return false;
  }
};

const stripXml = (value) =>
  decodeXmlEntities(value)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const extractDocxText = async (filePath) => {
  if (commandExists('unzip')) {
    const { stdout } = await execFileAsync('unzip', ['-p', filePath, 'word/document.xml'], { maxBuffer: 16 * 1024 * 1024 });
    return stripXml(stdout);
  }

  if (commandExists('bsdtar')) {
    const { stdout } = await execFileAsync('bsdtar', ['-xOf', filePath, 'word/document.xml'], {
      maxBuffer: 16 * 1024 * 1024
    });
    return stripXml(stdout);
  }

  return '';
};

const extractPdfText = async (filePath) => {
  if (!commandExists('pdftotext')) {
    return '';
  }

  const { stdout } = await execFileAsync('pdftotext', ['-layout', filePath, '-'], { maxBuffer: 16 * 1024 * 1024 });
  return stdout;
};

const extractStringsText = async (filePath) => {
  if (!commandExists('strings')) {
    return '';
  }

  const { stdout } = await execFileAsync('strings', ['-n', '4', filePath], { maxBuffer: 16 * 1024 * 1024 });
  return stdout;
};

const extractPlainText = async (filePath) => fs.promises.readFile(filePath, 'utf8');

const extractImageTextWithOcr = async (filePath) => {
  if (!commandExists('tesseract')) {
    return '';
  }

  try {
    const { stdout } = await execFileAsync('tesseract', [filePath, 'stdout', '-l', 'chi_sim+eng', '--psm', '6'], {
      maxBuffer: 16 * 1024 * 1024
    });
    return normalizeText(stdout);
  } catch (error) {
    return '';
  }
};

const extractPdfTextWithOcr = async (filePath) => {
  if (!commandExists('tesseract') || !commandExists('pdftoppm')) {
    return '';
  }

  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'resume-ocr-'));

  try {
    const outputPrefix = path.join(tempDir, 'page');
    await execFileAsync('pdftoppm', ['-png', '-f', '1', '-l', '3', filePath, outputPrefix], {
      maxBuffer: 16 * 1024 * 1024
    });

    const files = (await fs.promises.readdir(tempDir))
      .filter((item) => item.endsWith('.png'))
      .sort();
    const chunks = [];

    for (const file of files) {
      const text = await extractImageTextWithOcr(path.join(tempDir, file));
      if (text) {
        chunks.push(text);
      }
    }

    return normalizeText(chunks.join('\n\n'));
  } catch (error) {
    return '';
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
};

const extractResumeText = async (filePath, fileName) => {
  const extension = path.extname(fileName || filePath).toLowerCase();

  try {
    if (['.txt', '.md', '.csv', '.log'].includes(extension)) {
      return normalizeText(await extractPlainText(filePath));
    }

    if (extension === '.docx') {
      const docxText = await extractDocxText(filePath);
      if (docxText) {
        return normalizeText(docxText);
      }
    }

    if (extension === '.pdf') {
      const pdfText = await extractPdfText(filePath);
      if (pdfText) {
        return normalizeText(pdfText);
      }
    }

    if (['.png', '.jpg', '.jpeg', '.webp'].includes(extension)) {
      const imageText = await extractImageTextWithOcr(filePath);
      if (imageText) {
        return normalizeText(imageText);
      }
    }

    const fallbackText = await extractStringsText(filePath);
    return normalizeText(fallbackText);
  } catch (error) {
    return '';
  }
};

const shouldUseOcrFallback = (text, parsedFields, fileName = '') => {
  const extension = path.extname(fileName).toLowerCase();
  if (!['.pdf', '.png', '.jpg', '.jpeg', '.webp'].includes(extension)) {
    return false;
  }

  const recognizedCount = [
    parsedFields.name,
    parsedFields.phone,
    parsedFields.email,
    parsedFields.education,
    parsedFields.work_years,
    parsedFields.school_major,
    parsedFields.current_company,
    parsedFields.current_position
  ].filter((item) => item !== null && item !== undefined && String(item).trim() !== '').length;

  if (!text || text.length < 120) {
    return true;
  }

  if (recognizedCount <= 2) {
    return true;
  }

  if ((isSuspiciousName(parsedFields.name) || !parsedFields.name) && !parsedFields.phone && !parsedFields.email) {
    return true;
  }

  return false;
};

const mergeParsedCandidates = (primary, secondary) => {
  const merged = { ...primary };
  const fillIfMissing = (key) => {
    if ((!merged[key] || String(merged[key]).trim() === '') && secondary[key]) {
      merged[key] = secondary[key];
    }
  };

  fillIfMissing('gender');
  fillIfMissing('age');
  fillIfMissing('education');
  fillIfMissing('work_years');
  fillIfMissing('phone');
  fillIfMissing('email');

  if ((isSuspiciousName(merged.name) || !merged.name) && secondary.name) {
    merged.name = secondary.name;
  }
  if ((!merged.school_major || String(merged.school_major).length < 6) && secondary.school_major) {
    merged.school_major = secondary.school_major;
  }
  if ((!merged.current_company || String(merged.current_company).length < 4) && secondary.current_company) {
    merged.current_company = secondary.current_company;
  }
  if ((!merged.current_position || String(merged.current_position).length < 2) && secondary.current_position) {
    merged.current_position = secondary.current_position;
  }

  merged.text = [primary.text, secondary.text].filter(Boolean).join('\n\n').trim();
  return merged;
};

const matchGroup = (text, patterns) => {
  for (const pattern of patterns) {
    const matched = text.match(pattern);
    if (matched?.[1]) {
      return trimValue(matched[1]);
    }
  }

  return '';
};

const pickNameFromFileName = (fileName) => {
  const baseName = path.basename(fileName, path.extname(fileName));
  const normalized = baseName
    .replace(/[-_]/g, ' ')
    .replace(/(个人)?简历/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  const stripHonorific = (value) => {
    const raw = String(value || '');
    const stripped = raw.replace(/(先生|女士|小姐)$/, '');
    return stripped.length >= 2 ? stripped : raw;
  };
  const salaryMatch = normalized.match(/[kK]\s*([\u4e00-\u9fa5]{2,4}(?:先生|女士|小姐)?)/);
  if (salaryMatch?.[1]) {
    return stripHonorific(salaryMatch[1]);
  }

  const yearMatch = normalized.match(/([\u4e00-\u9fa5]{2,4}(?:先生|女士|小姐)?)\s*\d{1,2}年/);
  if (yearMatch?.[1]) {
    return stripHonorific(yearMatch[1]);
  }

  const nameCandidates = normalized.match(/[\u4e00-\u9fa5]{2,4}(?:先生|女士|小姐)?/g) || [];
  const blacklist = /(经理|主管|工程师|开发|销售|运营|设计|测试|武汉|北京|上海|广州|深圳|杭州|成都|长沙|重庆|南京|苏州|西安|天津|合肥|贵阳|济南|郑州|武汉|公司|集团)/;
  const cleaned = nameCandidates
    .map((item) => stripHonorific(item))
    .filter((item) => item && !blacklist.test(item) && !isSectionTitle(item) && !nameStopwordsPattern.test(item));

  if (cleaned.length) {
    return cleaned[cleaned.length - 1];
  }

  return normalized || baseName;
};

const pickPhone = (text) => {
  const matched = text.match(/(?<!\d)(1[3-9][\d\s-]{9,15})(?!\d)/);
  return normalizePhone(matched?.[1] || '');
};

const pickNameFromText = (text) => {
  const headlineName = matchGroup(text, [
    /(?:姓名|候选人|名字)[:：]?\s*([\u4e00-\u9fa5]{2,4})/m,
    /^\s*([\u4e00-\u9fa5]{2,4})\s+(?:出生年月|性别|电话|邮箱|籍贯|求职意向)/m
  ]);

  if (headlineName) {
    return headlineName;
  }

  const lines = splitLines(text).slice(0, 20);

  for (const line of lines) {
    if (isSectionTitle(line)) {
      continue;
    }
    if (nameStopwordsPattern.test(line)) {
      continue;
    }
    if (/^[\u4e00-\u9fa5]{2,4}$/.test(line)) {
      return line;
    }
  }

  return '';
};

const scoreNameCandidate = (value, context = '') => {
  const normalized = cleanField(value || '').replace(/\s+/g, '');
  if (!normalized || isBadNameCandidate(normalized) || isSuspiciousName(normalized)) {
    return -1000;
  }

  let score = 0;
  if (/^[\u4e00-\u9fa5]{2,4}$/.test(normalized)) score += 12;
  if (/^[\u4e00-\u9fa5]{2,3}$/.test(normalized)) score += 4;
  if (/姓名|候选人|名字/.test(context)) score += 5;
  if (/出生年月|性别|电话|邮箱|求职意向/.test(context)) score += 4;
  if (/简历|resume/i.test(context)) score += 2;
  if (normalized.length > 4) score -= 5;
  if (/(经理|主管|工程师|开发|销售|运营|设计|测试|产品|项目|武汉|北京|上海|广州|深圳|杭州|成都|长沙|重庆|南京|苏州|公司|集团)/.test(normalized)) {
    score -= 10;
  }

  return score;
};

const pickNameFromHeader = (text) => {
  const head = String(text || '').slice(0, 240);
  const matched = head.match(/([\u4e00-\u9fa5]{2,4}(?:先生|女士|小姐)?)[\\s|/]*(?:男|女|\\d{2}岁|1[3-9]\\d{9}|[A-Za-z]{1,3})/);
  if (matched?.[1]) {
    return matched[1].replace(/(先生|女士|小姐)$/, '');
  }
  return '';
};

const pickBestName = (candidates) => {
  const scored = candidates
    .map((item) => ({
      value: cleanField(item.value || ''),
      score: scoreNameCandidate(item.value, item.context || '')
    }))
    .filter((item) => item.value && item.score > -1000)
    .sort((a, b) => b.score - a.score);

  return scored[0]?.value || '';
};

const normalizeName = (value) =>
  cleanField(
    String(value || '')
      .replace(/\s*(?:手机|电话|邮箱)[:：]?.*$/i, '')
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i, '')
      .replace(/(?<!\d)(1[3-9]\d{9})(?!\d)/, '')
      .replace(/^(?:姓名|候选人|名字)[:：]?/, '')
  );

const isSectionTitle = (value) => sectionTitlePattern.test(cleanField(value || ''));
const isBadNameCandidate = (value) => {
  const cleaned = cleanField(value || '');
  if (!cleaned) return true;
  if (isSectionTitle(cleaned)) return true;
  if (nameStopwordsPattern.test(cleaned)) return true;
  if (/\d/.test(cleaned)) return true;
  return false;
};

const findValueByLabels = (text, labels) => {
  for (const label of labels) {
    const pattern = new RegExp(`${label}\\s*[:：]?\\s*([^\\n]{1,80})`, 'i');
    const matched = text.match(pattern);
    if (matched?.[1]) {
      return cleanField(String(matched[1]).split(/[|｜]/)[0]);
    }
  }
  return '';
};

const extractTableMap = (text) => {
  const lines = splitLines(text);
  const labelGroups = [
    { key: 'name', labels: ['姓名', '名字', '候选人', 'Name'] },
    { key: 'gender', labels: ['性别', 'Gender'] },
    { key: 'age', labels: ['年龄', 'Age'] },
    { key: 'education', labels: ['学历', '最高学历', 'Education'] },
    { key: 'school_major', labels: ['学校及专业', '学校/专业', '毕业院校', '学校专业'] },
    { key: 'current_company', labels: ['所在公司', '当前公司', '现公司', '公司'] },
    { key: 'current_position', labels: ['所在岗位', '当前岗位', '岗位', '职位', '当前职位'] },
    { key: 'phone', labels: ['电话', '手机', '手机号', 'Phone', 'Mobile'] },
    { key: 'email', labels: ['邮箱', 'Email'] },
    { key: 'work_years', labels: ['工作年限', '工作经验', '从业年限', '年限'] }
  ];

  for (let i = 0; i < lines.length - 1; i += 1) {
    const header = lines[i];
    const columns = header.split(/\s{2,}/).filter(Boolean);
    if (columns.length < 3) {
      continue;
    }

    const indexMap = {};
    for (let colIndex = 0; colIndex < columns.length; colIndex += 1) {
      const col = columns[colIndex];
      for (const group of labelGroups) {
        if (group.labels.some((label) => col.includes(label))) {
          if (indexMap[group.key] === undefined) {
            indexMap[group.key] = colIndex;
          }
        }
      }
    }

    const recognized = Object.keys(indexMap).length;
    if (recognized < 3) {
      continue;
    }

    const valueColumns = lines[i + 1].split(/\s{2,}/).filter(Boolean);
    if (valueColumns.length < 2) {
      continue;
    }

    const result = {};
    for (const [key, idx] of Object.entries(indexMap)) {
      if (valueColumns[idx]) {
        result[key] = cleanField(valueColumns[idx]);
      }
    }

    if (Object.keys(result).length) {
      return result;
    }
  }

  return {};
};

const pickGender = (text) => {
  const normalized = normalizeLabelText(text);
  return matchGroup(normalized, [
    /(?:性\s*别|Gender)[:：]?\s*(男|女)/i,
    /(?:^|[\s|｜/])\s*(男|女)\s*(?:[|｜/]|(?:\d{2})岁|1[3-9])/m
  ]);
};

const pickAge = (text) => {
  const normalized = normalizeLabelText(text);
  const directAge = matchGroup(normalized, [/(?:年\s*龄|Age)[:：]?\s*(\d{2})/i, /(?:^|\s)(\d{2})岁(?:\s|$)/m]);

  if (directAge) {
    return Number(directAge);
  }

  const birthText = matchGroup(normalized, [/(?:出\s*生\s*年\s*月|出\s*生\s*日\s*期)[:：]?\s*(\d{4})[./-](\d{1,2})/i]);

  if (!birthText) {
    return null;
  }

  const matched = normalized.match(/(?:出\s*生\s*年\s*月|出\s*生\s*日\s*期)[:：]?\s*(\d{4})[./-](\d{1,2})/i);

  if (!matched) {
    return null;
  }

  const year = Number(matched[1]);
  const month = Number(matched[2]);

  if (!year || !month) {
    return null;
  }

  let age = currentDate.getFullYear() - year;

  if (currentDate.getMonth() + 1 < month) {
    age -= 1;
  }

  return age > 0 ? age : null;
};

const extractEducationLine = (text) => {
  const normalized = normalizeLabelText(text);
  const sectionMatch = normalized.match(/教育(?:背景|经历)([\s\S]{0,300})/i);
  if (sectionMatch?.[1]) {
    const lines = splitLines(sectionMatch[1]);
    const scored = lines
      .map((item) => {
        let score = 0;
        if (/(大学|学院|学校)/.test(item)) score += 3;
        if (/博士/.test(item)) score += 5;
        else if (/硕士/.test(item)) score += 4;
        else if (/本科|一本|二本/.test(item)) score += 3;
        else if (/大专|专科/.test(item)) score += 2;
        if (/20\d{2}\s*年\s*\d{1,2}\s*月/.test(item) || /20\d{2}[./-]\d{1,2}/.test(item)) score += 1;
        return { item, score };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score);
    if (scored[0]?.item) {
      return cleanField(scored[0].item);
    }
  }

  const fallbackMatch = normalized.match(
    /教育(?:背景|经历)[\s\S]{0,160}?(\d{4}[./-]\d{1,2}\s*-\s*\d{4}[./-]\d{1,2}(?:\s*\|\s*|\s+)[^\n]+)/i
  );
  return cleanField(fallbackMatch?.[1] || '');
};

const inferEducationFromLine = (educationLine) => {
  if (!educationLine) {
    return '';
  }

  if (/博士/.test(educationLine)) return '博士';
  if (/硕士/.test(educationLine)) return '硕士';
  if (/本科|一本|二本/.test(educationLine)) return '本科';
  if (/大专|专科/.test(educationLine)) return '大专';
  if (/中专/.test(educationLine)) return '中专';
  if (/高中/.test(educationLine)) return '高中';

  const matched = educationLine.match(/(20\d{2})[./-](\d{1,2})\s*-\s*(20\d{2})[./-](\d{1,2})/);

  if (!matched) {
    return '';
  }

  const startYear = Number(matched[1]);
  const startMonth = Number(matched[2]);
  const endYear = Number(matched[3]);
  const endMonth = Number(matched[4]);
  const months = (endYear - startYear) * 12 + (endMonth - startMonth);

  if (months >= 42) {
    return '本科';
  }

  if (months >= 30) {
    return '大专';
  }

  return '';
};

const pickEmail = (text) => {
  const matches = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  const candidate = matches.find((item) => !platformEmailPattern.test((item.split('@')[1] || '').trim())) || matches[0];
  return candidate || '';
};

const buildSchoolMajor = (text) => {
  const educationLine = extractEducationLine(text);
  const normalized = normalizeLabelText(text);

  const directPatternMatch =
    normalized.match(
      /教育(?:背景|经历)[\s\S]{0,220}?([\u4e00-\u9fa5A-Za-z0-9（）()·\-.]{2,40}(?:大学|学院|学校))\s+(博士|硕士|本科|大专|中专|高中)\s+([^\s]{2,30})\s+\d{4}(?:[./-]\d{1,2})?\s*-\s*\d{4}(?:[./-]\d{1,2})?/i
    ) ||
    normalized.match(
      /教育(?:背景|经历)[\s\S]{0,220}?([\u4e00-\u9fa5A-Za-z0-9（）()·\-.]{2,40}(?:大学|学院|学校))\s+([^\s]{2,30})\s+(博士|硕士|本科|大专|中专|高中)\s+\d{4}(?:[./-]\d{1,2})?\s*-\s*\d{4}(?:[./-]\d{1,2})?/i
    );
  if (directPatternMatch) {
    const school = cleanField(directPatternMatch[1]);
    const major = trimEducationMajor(directPatternMatch[3] || directPatternMatch[2]);
    return major ? `${school} / ${major}` : school;
  }

  if (educationLine) {
    const withoutDate = educationLine
      .replace(
        /20\d{2}\s*年\s*\d{1,2}\s*月[\s\S]{0,8}?(?:至|—|–|-)\s*20\d{2}\s*年\s*\d{1,2}\s*月/g,
        ''
      )
      .trim();
    if (withoutDate) {
      const tokens = withoutDate.split(/\s+/).filter(Boolean);
      const schoolIndex = tokens.findIndex((item) => /(大学|学院|学校)/.test(item));
      if (schoolIndex >= 0) {
        const school = tokens[schoolIndex];
        const degreeIndex = tokens.findIndex((item, index) => index > schoolIndex && /博士|硕士|本科|大专|中专|高中/.test(item));
        let major = '';
        if (degreeIndex > schoolIndex + 1) {
          major = tokens.slice(schoolIndex + 1, degreeIndex).join(' ');
        } else if (degreeIndex === schoolIndex + 1) {
          major = tokens.slice(degreeIndex + 1, degreeIndex + 4).join(' ');
        } else {
          major = tokens.slice(schoolIndex + 1, schoolIndex + 4).join(' ');
        }
        if (major) {
          const cleanedMajor = trimEducationMajor(major);
          return cleanedMajor ? `${cleanField(school)} / ${cleanedMajor}` : cleanField(school);
        }
      }
    }

    const lineMatch = educationLine.match(/\d{4}[./-]\d{1,2}\s*-\s*\d{4}[./-]\d{1,2}\s*\|\s*([^|]+)\|\s*([^|\n]+)/);

    if (lineMatch) {
      return `${cleanField(lineMatch[1])} / ${cleanField(lineMatch[2])}`;
    }

    const spacedLineMatch = educationLine.match(
      /\d{4}[./-]\d{1,2}\s*-\s*\d{4}[./-]\d{1,2}\s+([\u4e00-\u9fa5A-Za-z0-9（）()·\-.]{2,40}(?:大学|学院|学校))\s+([^\n]{2,40})/
    );

    if (spacedLineMatch) {
      const cleanedMajor = trimEducationMajor(spacedLineMatch[2]);
      return cleanedMajor ? `${cleanField(spacedLineMatch[1])} / ${cleanedMajor}` : cleanField(spacedLineMatch[1]);
    }

    const cnDateMatch = educationLine.match(
      /(20\d{2}\s*年\s*\d{1,2}\s*月)[\s\S]{0,10}?(?:至|—|–|-)\s*(20\d{2}\s*年\s*\d{1,2}\s*月)\s+([^\n]{2,40})/
    );
    if (cnDateMatch) {
      const tail = cnDateMatch[3];
      const parts = tail.split(/\s+/).filter(Boolean);
      if (parts.length >= 2) {
        const school = parts[0];
        const major = parts.slice(1).join(' ');
        const cleanedMajor = trimEducationMajor(major);
        return cleanedMajor ? `${cleanField(school)} / ${cleanedMajor}` : cleanField(school);
      }
      return cleanField(tail);
    }
  }

  const sectionMatch = normalized.match(/教育(?:背景|经历)([\s\S]{0,400})/i);
  if (sectionMatch?.[1]) {
    const lines = splitLines(sectionMatch[1]);
    const structuredLine = lines.find((line) =>
      /(大学|学院|学校).*(博士|硕士|本科|大专|中专|高中).*(20\d{2}|\d{4}[./-]\d{1,2})/.test(line)
    );
    if (structuredLine) {
      let matched = structuredLine.match(
        /([\u4e00-\u9fa5A-Za-z0-9（）()·\-.]{2,40}(?:大学|学院|学校))\s+([^\s]{2,30})\s+(博士|硕士|本科|大专|中专|高中)/
      );
      if (matched) {
        const major = trimEducationMajor(matched[2]);
        return major ? `${cleanField(matched[1])} / ${major}` : cleanField(matched[1]);
      }

      matched = structuredLine.match(
        /([\u4e00-\u9fa5A-Za-z0-9（）()·\-.]{2,40}(?:大学|学院|学校))\s+(博士|硕士|本科|大专|中专|高中)\s+([^\s]{2,30})/
      );
      if (matched) {
        const major = trimEducationMajor(matched[3]);
        return major ? `${cleanField(matched[1])} / ${major}` : cleanField(matched[1]);
      }

      matched = structuredLine.match(
        /([\u4e00-\u9fa5A-Za-z0-9（）()·\-.]{2,40}(?:大学|学院|学校))\s+([^\s]{2,30})\s+([^\s]{2,30})\s+(博士|硕士|本科|大专|中专|高中)/
      );
      if (matched) {
        const major = trimEducationMajor(`${matched[2]} ${matched[3]}`);
        return major ? `${cleanField(matched[1])} / ${major}` : cleanField(matched[1]);
      }
    }
    const candidate = lines.find((line) => /(大学|学院|学校)/.test(line));
    if (candidate) {
      const withoutDate = candidate.replace(
        /20\d{2}\s*年\s*\d{1,2}\s*月[\s\S]{0,8}?(?:至|—|–|-)\s*20\d{2}\s*年\s*\d{1,2}\s*月\s*/g,
        ''
      );
      const schoolMajorMatch = withoutDate.match(
        /([\u4e00-\u9fa5A-Za-z0-9（）()·\-.]{2,40}(?:大学|学院|学校))\s+([^\s]{2,40})/
      );
      if (schoolMajorMatch) {
        const cleanedMajor = trimEducationMajor(schoolMajorMatch[2]);
        return cleanedMajor
          ? `${cleanField(schoolMajorMatch[1])} / ${cleanedMajor}`
          : cleanField(schoolMajorMatch[1]);
      }
    }
  }

  const inlineEducationMatch = normalized.match(
    /教育(?:背景|经历)[\s\S]{0,200}?(?:20\d{2}\s*年\s*\d{1,2}\s*月[\s\S]{0,10}?(?:至|—|–|-)\s*20\d{2}\s*年\s*\d{1,2}\s*月)\s+([^\n]{2,80})/i
  );
  if (inlineEducationMatch?.[1]) {
    const tail = inlineEducationMatch[1];
    const parts = tail.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      const cleanedMajor = trimEducationMajor(parts.slice(1).join(' '));
      return cleanedMajor ? `${cleanField(parts[0])} / ${cleanedMajor}` : cleanField(parts[0]);
    }
    return cleanField(tail);
  }

  const simpleMatch = normalized.match(
    /([\u4e00-\u9fa5A-Za-z0-9（）()·\-.]{2,40}(?:大学|学院|学校))\s+([^\n]{2,40}?)(?:\s+(?:博士|硕士|本科|大专|中专|高中))?(?:\s|$)/
  );
  if (simpleMatch) {
    const cleanedMajor = trimEducationMajor(simpleMatch[2]);
    return cleanedMajor ? `${cleanField(simpleMatch[1])} / ${cleanedMajor}` : cleanField(simpleMatch[1]);
  }

  const school = matchGroup(text, [
    /(?:毕业院校|毕业学校|院校|学校)[:：]?\s*([^\n]{2,40})/i,
    /(?:School)[:：]?\s*([^\n]{2,40})/i,
    /教育经历[\s\S]{0,120}?([\u4e00-\u9fa5]{2,20}(?:大学|学院|学校))/i
  ]);
  const major = matchGroup(text, [
    /(?:专业|主修)[:：]?\s*([^\n]{2,40})/i,
    /(?:Major)[:：]?\s*([^\n]{2,40})/i,
    /教育经历[\s\S]{0,120}?(?:大学|学院|学校)\s+(?:博士|硕士|本科|大专|中专|高中)\s+([^\d\n]{2,40})/i
  ]);

  if (educationLine && school && major) {
    return `${school} / ${major}`;
  }

  if (school && major) {
    return `${school} / ${major}`;
  }

  return school || major;
};

const buildCurrentExperience = (text) => {
  const normalized = normalizeLabelText(text);
  const workSection = extractWorkSection(normalized);
  const workLines = splitLines(workSection);
  const lineWithCompanyAndRole = workLines.find((line) =>
    /(大学|学院|学校)/.test(line)
      ? false
      : /(公司|集团|科技|信息技术|网络|软件|有限公司|股份有限公司).*(20\d{2}[./-]\d{1,2}|20\d{2}\s*年\s*\d{1,2}\s*月)/.test(line)
  );

  if (lineWithCompanyAndRole) {
    const lineMatch = lineWithCompanyAndRole.match(
      /([\u4e00-\u9fa5A-Za-z0-9（）()·\-.]{2,80}(?:股份有限公司|有限责任公司|有限公司|集团|公司))\s+([A-Za-z0-9\u4e00-\u9fa5（）()·\-.]{2,30}?)\s+(?:20\d{2}[./-]\d{1,2}|20\d{2}\s*年\s*\d{1,2}\s*月)/
    );
    if (lineMatch) {
      return {
        company: cleanField(lineMatch[1].replace(/（[^）]*）/g, '')),
        position: cleanField(lineMatch[2])
      };
    }
  }

  const latestLineCandidates = workLines
    .map((line, index) => {
      const matched =
        line.match(/^(20\d{2,3})[./-](\d{1,2})\s*-\s*(?:至今|20\d{2,3}[./-]\d{1,2})/) ||
        line.match(/^(20\d{2})\s*年\s*(\d{1,2})\s*月[\s\S]{0,6}?(?:至今|20\d{2}\s*年\s*\d{1,2}\s*月)/);

      if (!matched) {
        return null;
      }

      const normalizedYear = matched[1].length === 5 ? Number(matched[1].slice(1)) : Number(matched[1]);
      const normalizedMonth = Number(matched[2]);

      if (!normalizedYear || !normalizedMonth) {
        return null;
      }

      return {
        index,
        line,
        score: normalizedYear * 100 + normalizedMonth
      };
    })
    .filter(Boolean)
    .sort((a, b) => (a.score === b.score ? b.index - a.index : b.score - a.score));
  const latestLineIndex = latestLineCandidates[0]?.index ?? -1;
  const latestExperienceLine = latestLineIndex >= 0 ? workLines[latestLineIndex] : '';

  if (latestExperienceLine) {
    const withoutDate = latestExperienceLine
      .replace(/^20\d{2}[./-]\d{1,2}\s*-\s*(?:至今|20\d{2}[./-]\d{1,2})\s*/, '')
      .replace(/^20\d{2}\s*年\s*\d{1,2}\s*月[\s\S]{0,6}?(?:至今|20\d{2}\s*年\s*\d{1,2}\s*月)\s*/, '');
    const companyMatch =
      withoutDate.match(/([\u4e00-\u9fa5A-Za-z0-9（）()·\-.]{2,80}(?:股份有限公司|有限责任公司|有限公司|集团|公司))/) ||
      withoutDate.match(/([\u4e00-\u9fa5A-Za-z0-9（）()·\-.]{2,40}(?:科技|教育|软件|信息技术|网络|信息))/) ||
      withoutDate.match(/^([\u4e00-\u9fa5]{2,20})/);

    if (companyMatch) {
      const tail = withoutDate.slice(companyMatch.index + companyMatch[1].length);
      const inlinePosition = cleanField(
        (tail.match(/([A-Za-z0-9\u4e00-\u9fa5（）()·\-.]{2,30}(?:工程师|开发|经理|主管|专员|架构师|设计师))/) || [])[1] || ''
      );
      const nextLine = latestLineIndex >= 0 ? workLines[latestLineIndex + 1] || '' : '';
      const nextLinePosition = cleanField(
        (nextLine.match(/([A-Za-z0-9\u4e00-\u9fa5（）()·\-.]{2,30}(?:工程师|开发|经理|主管|专员|架构师|设计师))/) || [])[1] || ''
      );
      const prevLine = latestLineIndex >= 1 ? workLines[latestLineIndex - 1] || '' : '';
      const prevLinePosition = cleanField(
        (prevLine.match(/([A-Za-z0-9\u4e00-\u9fa5（）()·\-.]{2,30}(?:工程师|开发|经理|主管|专员|架构师|设计师))/) || [])[1] || ''
      );

      if (inlinePosition || nextLinePosition || prevLinePosition) {
        return {
          company: cleanField(companyMatch[1]),
          position: inlinePosition || nextLinePosition || prevLinePosition
        };
      }

      const tokens = withoutDate.split(/\s+/).filter(Boolean);
      if (tokens.length >= 2) {
        return {
          company: cleanField(tokens[0]),
          position: cleanField(tokens.slice(1).join(' '))
        };
      }

      return {
        company: cleanField(companyMatch[1]),
        position: ''
      };
    }
  }

  const sectionMatch = workSection.match(
    /20\d{2}[./-]\d{1,2}\s*-\s*(?:至今|20\d{2}[./-]\d{1,2})[\s\S]{0,80}?([\u4e00-\u9fa5A-Za-z0-9（）()·\-.]{2,60}(?:公司|集团|科技|信息技术|网络|软件|有限公司|股份有限公司)?)\s+([A-Za-z0-9\u4e00-\u9fa5（）()·\-.]{2,30}(?:工程师|开发|经理|主管|专员|架构师|设计师))/
  );

  if (sectionMatch) {
    return {
      company: cleanField(sectionMatch[1]),
      position: cleanField(sectionMatch[2])
    };
  }

  const employedAtMatch = normalized.match(/就职于[^\n（）()]{0,40}[（(]([^\n（）()]{2,60}(?:股份有限公司|有限责任公司|有限公司|集团|公司|科技|信息技术|网络|软件))[）)]/i);
  if (employedAtMatch?.[1]) {
    return {
      company: cleanField(employedAtMatch[1]),
      position: ''
    };
  }

  const company = cleanField(matchGroup(normalized, [
    /(?:现任公司|当前公司|所在公司|最近公司|就职公司|工作单位)[:：]?\s*([^\n]{2,60})/i,
    /(?:Company)[:：]?\s*([^\n]{2,60})/i,
    /工作经历[\s\S]{0,120}?([\u4e00-\u9fa5A-Za-z0-9（）()·\-.]{4,60}(?:公司|集团|科技|信息技术|网络|软件|有限公司|股份有限公司))/i
  ]));
  const position = cleanField(matchGroup(normalized, [
    /(?:现任职位|当前职位|所在岗位|最近岗位|职位名称|任职岗位)[:：]?\s*([^\n]{2,60})/i,
    /(?:Position|Title)[:：]?\s*([^\n]{2,60})/i,
    /工作经历[\s\S]{0,160}?(?:公司|集团|科技|信息技术|网络|软件|有限公司|股份有限公司)\s+([^\n]{2,30}(?:工程师|开发|经理|主管|专员|架构师|设计师))/i,
    /(?:工作经历|工作经验)[\s\S]{0,160}?([A-Za-z0-9\u4e00-\u9fa5（）()·\-.]{2,30}(?:工程师|开发|经理|主管|专员|架构师|设计师))[\s\S]{0,20}?(?:20\d{2}[./-]\d{1,2}|20\d{2}\s*年\s*\d{1,2}\s*月)/i
  ]));

  return { company, position };
};

const pickEducation = (text) =>
  (() => {
    const educationLine = extractEducationLine(text);
    const degreeRank = {
      高中: 1,
      中专: 2,
      大专: 3,
      本科: 4,
      硕士: 5,
      博士: 6
    };
    const globalEducation = /博士/.test(text)
      ? '博士'
      : /硕士/.test(text)
        ? '硕士'
        : /本科|学士/.test(text)
          ? '本科'
          : /大专|专科/.test(text)
            ? '大专'
            : '';

    if (educationLine) {
      const inferred = inferEducationFromLine(educationLine);
      if (inferred || globalEducation) {
        return (degreeRank[globalEducation] || 0) > (degreeRank[inferred] || 0) ? globalEducation : inferred;
      }
    }

    if (globalEducation) return globalEducation;

    return matchGroup(text, [
      /(?:最高学历|学历|Education)[:：]?\s*([^\n]{2,20})/i,
      /教育(?:背景|经历)[\s\S]{0,80}?(博士|硕士|本科|大专|中专|高中)/i
    ]);
  })();

const extractWorkSection = (text) => {
  const matched = text.match(/工作(?:经历|经验)([\s\S]{0,2000}?)(?:项目经历|项目经验|教育背景|教育经历|自我评价|$)/i);
  return matched?.[1] || '';
};

const pickWorkYears = (text) => {
  const normalized = normalizeLabelText(text);
  const direct = normalized.match(/(\d{1,2})\s*年(?:工作经验|经验|开发经验|工作年限|从业年限)/);
  if (direct?.[1]) {
    return Number(direct[1]);
  }

  const labelMatch = normalized.match(/(?:工作年限|工作经验|从业年限)[:：]?\s*(\d{1,2})\s*年/);
  if (labelMatch?.[1]) {
    return Number(labelMatch[1]);
  }

  if (direct?.[1]) {
    return Number(direct[1]);
  }

  const workSection = extractWorkSection(normalized);
  const rangeMatches = [
    ...workSection.matchAll(/(20\d{2})[./-](\d{1,2})\s*-\s*(?:至今|20\d{2}[./-]\d{1,2})/g),
    ...workSection.matchAll(/(20\d{2})\s*年\s*(\d{1,2})\s*月[\s\S]{0,6}?(?:至今|20\d{2}\s*年\s*\d{1,2}\s*月)/g)
  ];

  if (!rangeMatches.length) {
    return null;
  }

  const starts = rangeMatches
    .map((item) => ({
      year: Number(item[1]),
      month: Number(item[2])
    }))
    .filter((item) => item.year && item.month);

  if (!starts.length) {
    return null;
  }

  const earliest = starts.sort((a, b) => (a.year === b.year ? a.month - b.month : a.year - b.year))[0];
  const months = (currentDate.getFullYear() - earliest.year) * 12 + (currentDate.getMonth() + 1 - earliest.month);

  if (months <= 0) {
    return null;
  }

  return Math.max(1, Math.round(months / 12));
};

const parseResumeText = (text, fileName = '') => {
  const tableMap = extractTableMap(text);
  const name = matchGroup(text, [
    /(?:姓名|候选人|名字|Name|Candidate)[:：]?\s*([^\n]{2,40})/i,
    /^([\u4e00-\u9fa5]{2,4})\s*(?:简历|Resume)?$/im
  ]);
  const headerName = pickNameFromHeader(text);
  const gender = pickGender(text);
  const ageValue = pickAge(text);
  const education = pickEducation(text);
  const workYears = pickWorkYears(text);
  const schoolMajor = formatSchoolMajor(buildSchoolMajor(text));
  const phone = pickPhone(text);
  const email = pickEmail(text);
  const { company, position } = buildCurrentExperience(text);
  const chineseName = pickNameFromText(text);
  const resolvedName = pickBestName([
    { value: tableMap.name, context: '姓名 表格字段' },
    { value: headerName, context: String(text || '').slice(0, 160) },
    { value: chineseName, context: String(text || '').slice(0, 240) },
    { value: name, context: '姓名 候选人 名字' },
    { value: pickNameFromFileName(fileName), context: String(fileName || '') }
  ]);

  return {
    text,
    name: normalizeName(resolvedName),
    gender: cleanField(tableMap.gender || gender || ''),
    age: tableMap.age ? pickFirstNumber(tableMap.age) : ageValue,
    education: cleanField(tableMap.education || education || ''),
    work_years: tableMap.work_years ? pickFirstNumber(tableMap.work_years) : workYears,
    school_major: cleanField(tableMap.school_major || schoolMajor || ''),
    current_company: cleanField(tableMap.current_company || company || ''),
    current_position: cleanField(tableMap.current_position || position || ''),
    phone: cleanField(tableMap.phone || phone || ''),
    email: cleanField(tableMap.email || email || '')
  };
};

const parseResumeFile = async (filePath, fileName) => {
  const text = await extractResumeText(filePath, fileName);
  const parsed = parseResumeText(text, fileName);

  if (!shouldUseOcrFallback(text, parsed, fileName)) {
    return parsed;
  }

  const extension = path.extname(fileName || filePath).toLowerCase();
  const ocrText = extension === '.pdf' ? await extractPdfTextWithOcr(filePath) : await extractImageTextWithOcr(filePath);

  if (!ocrText) {
    return parsed;
  }

  const ocrParsed = parseResumeText(ocrText, fileName);
  return mergeParsedCandidates(parsed, ocrParsed);
};

const mergeResumeFields = (manualFields, parsedFields) => {
  const pick = (key) => {
    const manualValue = manualFields[key];

    if (manualValue !== undefined && manualValue !== null && String(manualValue).trim() !== '') {
      return manualValue;
    }

    return parsedFields[key];
  };

  return {
    name: trimValue(pick('name')),
    gender: trimValue(pick('gender')),
    age: pick('age') ? Number(pick('age')) : null,
    education: trimValue(pick('education')),
    work_years: pick('work_years') ? Number(pick('work_years')) : null,
    school_major: trimValue(pick('school_major')),
    current_company: trimValue(pick('current_company')),
    current_position: trimValue(pick('current_position')),
    phone: trimValue(pick('phone')),
    email: trimValue(pick('email'))
  };
};

module.exports = {
  parseResumeFile,
  parseResumeText,
  mergeResumeFields,
  isSuspiciousName
};
