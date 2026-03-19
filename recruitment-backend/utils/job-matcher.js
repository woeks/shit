const normalizeText = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[\-_()（）\[\]{}，,。.。/:：|·]/g, '')
    .replace(/\d+/g, '');

const GENERIC_TOKENS = [
  '工程师',
  '开发',
  '研发',
  '经理',
  '主管',
  '专员',
  '顾问',
  '助理',
  '实习',
  '总监',
  '负责人',
  '高级',
  '资深',
  '中级',
  '初级',
  '专家',
  '总裁',
  'leader',
  'lead',
  'developer',
  'engineer',
  'manager',
  'director',
  'head',
  'specialist',
  'assistant',
  'intern',
  'senior',
  'junior',
  'mid'
].map((item) => item.toLowerCase());

const ALIAS_MAP = [
  { key: '前端', aliases: ['frontend', 'web', 'h5', 'javascript', 'js', 'vue', 'react'] },
  { key: '后端', aliases: ['backend', 'server', '服务端'] },
  { key: '全栈', aliases: ['fullstack'] },
  { key: '测试', aliases: ['qa', 'qualityassurance'] },
  { key: '产品', aliases: ['product', 'pm'] },
  { key: '运营', aliases: ['operation', 'ops', 'growth'] },
  { key: '运维', aliases: ['devops', 'sre', 'sysadmin'] },
  { key: '数据', aliases: ['data', 'bi', 'analytics'] },
  { key: '算法', aliases: ['algorithm', 'ai', 'ml', '机器学习'] },
  { key: '设计', aliases: ['design', 'ui', 'ux', '视觉'] },
  { key: '人事', aliases: ['hr', 'humanresource'] },
  { key: '招聘', aliases: ['recruit', 'talentacquisition'] },
  { key: '财务', aliases: ['finance', 'accounting'] },
  { key: '市场', aliases: ['marketing', 'bd'] },
  { key: '销售', aliases: ['sales', 'bizdev'] },
  { key: '客服', aliases: ['support', 'customer'] },
  { key: '项目', aliases: ['project', 'pm', 'projectmanager'] }
].map((item) => ({
  key: normalizeText(item.key),
  aliases: item.aliases.map((alias) => normalizeText(alias))
}));

const stripGenericTokens = (value) => {
  let result = value;
  for (const token of GENERIC_TOKENS) {
    if (!token) continue;
    result = result.replace(new RegExp(token, 'g'), '');
  }
  return result;
};

const buildTitleVariants = (title) => {
  const normalized = normalizeText(title);
  if (!normalized) {
    return [];
  }
  const stripped = stripGenericTokens(normalized);
  const variants = new Set([normalized]);
  if (stripped && stripped !== normalized) {
    variants.add(stripped);
  }
  return Array.from(variants).filter((item) => item.length >= 2);
};

const collectAliases = (job) => {
  const normalized = normalizeText(job?.title);
  const aliases = new Set();

  for (const { key, aliases: mapped } of ALIAS_MAP) {
    if (key && normalized.includes(key)) {
      mapped.forEach((alias) => aliases.add(alias));
    }
  }

  const customAliases = Array.isArray(job?.aliases) ? job.aliases : [];
  for (const item of customAliases) {
    const normalizedAlias = normalizeText(item);
    if (normalizedAlias) {
      aliases.add(normalizedAlias);
    }
  }

  return Array.from(aliases).filter((item) => item.length >= 2);
};

const bigramOverlapScore = (needle, haystack) => {
  if (needle.length < 4) {
    return 0;
  }
  const grams = new Set();
  for (let i = 0; i < needle.length - 1; i += 1) {
    grams.add(needle.slice(i, i + 2));
  }
  if (!grams.size) {
    return 0;
  }
  let matched = 0;
  grams.forEach((gram) => {
    if (haystack.includes(gram)) {
      matched += 1;
    }
  });
  const ratio = matched / grams.size;
  if (ratio >= 0.6 && matched >= 2) {
    return 450 + matched * 4;
  }
  return 0;
};

const scoreJob = (job, haystack) => {
  const variants = buildTitleVariants(job?.title || '');
  const aliases = collectAliases(job);
  let best = 0;

  for (const variant of variants) {
    if (haystack.includes(variant)) {
      best = Math.max(best, 1000 + variant.length);
    }
    best = Math.max(best, bigramOverlapScore(variant, haystack));
  }

  for (const alias of aliases) {
    if (haystack.includes(alias)) {
      best = Math.max(best, 700 + alias.length);
    }
  }

  return best;
};

const findJobSuggestion = (jobs, ...parts) => {
  const haystack = normalizeText(parts.filter(Boolean).join(' '));

  if (!haystack || !Array.isArray(jobs) || !jobs.length) {
    return null;
  }

  let best = null;
  let bestScore = 0;
  let bestLength = 0;

  for (const job of jobs) {
    const score = scoreJob(job, haystack);
    if (score > bestScore || (score === bestScore && normalizeText(job?.title).length > bestLength)) {
      best = job;
      bestScore = score;
      bestLength = normalizeText(job?.title).length;
    }
  }

  return bestScore >= 450 ? best : null;
};

module.exports = {
  findJobSuggestion
};
