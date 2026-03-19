const express = require('express');
const { Op } = require('sequelize');
const { ImapFlow } = require('imapflow');
const { PlatformAccount, PlatformTemplate, PlatformSyncLog } = require('../models');
const { syncEmailAccount, extractConnectionConfig, isEmailSyncRunning } = require('../services/email-sync');
const { requireModules, requireRoles } = require('../middleware/auth');

const router = express.Router();

const includeTemplate = [{ model: PlatformTemplate }];

const createSyncLog = async ({ account, actionType, targetType, status, message, payloadSnapshot, operatorId }) => {
  return PlatformSyncLog.create({
    platform_account_id: account.id,
    action_type: actionType,
    target_type: targetType,
    status,
    message,
    payload_snapshot: payloadSnapshot || null,
    operator_id: operatorId || null
  });
};

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

const stringifyCredentials = (value) => {
  if (!value || (typeof value === 'object' && !Object.keys(value).length)) {
    return null;
  }

  if (typeof value === 'string') {
    return value;
  }

  return JSON.stringify(value);
};

const normalizePlatformPayload = (body, existingAccount) => {
  const existingSnapshot = existingAccount?.auth_snapshot && typeof existingAccount.auth_snapshot === 'object' ? existingAccount.auth_snapshot : {};
  const existingCredentials = parseJsonText(existingAccount?.credentials_encrypted) || {};
  const authSnapshot = {
    ...existingSnapshot,
    ...(parseJsonText(body.auth_snapshot) || {})
  };
  const credentials = {
    ...existingCredentials,
    ...(parseJsonText(body.credentials_encrypted) || {})
  };

  const simpleFields = ['imap_host', 'imap_port', 'imap_user', 'imap_tls', 'mailbox', 'subject_filter', 'from_filter', 'default_job_id'];
  for (const key of simpleFields) {
    if (body[key] !== undefined) {
      if (String(body[key]).trim()) {
        authSnapshot[key] = String(body[key]).trim();
      } else {
        delete authSnapshot[key];
      }
    }
  }

  if (body.imap_password !== undefined) {
    if (String(body.imap_password).trim()) {
      credentials.imap_password = String(body.imap_password);
    } else {
      delete credentials.imap_password;
    }
  }

  return {
    auth_snapshot: Object.keys(authSnapshot).length ? authSnapshot : null,
    credentials_encrypted: stringifyCredentials(credentials)
  };
};

const validateRequiredFields = (account) => {
  const config = extractConnectionConfig(account);
  const schema = Array.isArray(account.PlatformTemplate?.auth_schema) ? account.PlatformTemplate.auth_schema : [];
  const missingFields = schema
    .filter((field) => field.required)
    .filter((field) => {
      const value = config[field.key];
      return value === null || value === undefined || value === '';
    })
    .map((field) => field.label || field.key);

  return { config, missingFields };
};

const buildTestResult = (account) => {
  const { config, missingFields } = validateRequiredFields(account);
  if (missingFields.length) {
    return {
      status: 'failed',
      message: `缺少必要配置：${missingFields.join('、')}`,
      details: { missing_fields: missingFields }
    };
  }

  if (account.status !== 'active') {
    return {
      status: 'failed',
      message: '平台账号当前处于停用状态，无法执行同步或发布。',
      details: { account_status: account.status }
    };
  }

  const templateCode = account.PlatformTemplate?.code;
  const templateName = account.PlatformTemplate?.name || '平台';

  if (templateCode === 'email_generic') {
    const port = Number(config.imap_port);

    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      return {
        status: 'failed',
        message: 'IMAP 端口无效，请填写 1 到 65535 之间的整数。',
        details: { imap_port: config.imap_port }
      };
    }

    return {
      status: 'success',
      message: `邮箱配置完整，可使用 ${config.imap_host}:${port} 进行连接测试。`,
      details: { mode: 'email_ingest', host: config.imap_host, port }
    };
  }

  return {
    status: 'failed',
    message: `${templateName} 不是可用的邮箱同步模板。`,
    details: { mode: 'unsupported' }
  };
};

router.get('/templates', requireModules('platforms'), requireRoles(['super_admin', 'hr_manager']), async (req, res) => {
  try {
    const templates = await PlatformTemplate.findAll({
      where: { code: 'email_generic' },
      order: [['created_at', 'ASC']]
    });
    res.json(templates);
  } catch (error) {
    res.status(500).json({ message: '获取平台模板失败。', error: error.message });
  }
});

router.get('/', requireModules('platforms'), requireRoles(['super_admin', 'hr_manager']), async (req, res) => {
  try {
    const where = {};

    if (req.query.status && req.query.status !== 'all') {
      where.status = req.query.status;
    }

    if (req.query.template_id) {
      where.template_id = req.query.template_id;
    }

    if (req.query.keyword) {
      where.account_name = { [Op.iLike]: `%${req.query.keyword}%` };
    }

    const accounts = await PlatformAccount.findAll({
      where,
      include: includeTemplate,
      order: [['created_at', 'DESC']]
    });
    res.json(accounts);
  } catch (error) {
    res.status(500).json({ message: '获取平台账号失败。', error: error.message });
  }
});

router.get('/sync-logs', requireModules('platforms'), requireRoles(['super_admin', 'hr_manager']), async (req, res) => {
  try {
    const where = {};

    if (req.query.platform_account_id) {
      where.platform_account_id = req.query.platform_account_id;
    }

    if (req.query.status) {
      where.status = req.query.status;
    }

    if (req.query.action_type) {
      where.action_type = req.query.action_type;
    }

    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const logs = await PlatformSyncLog.findAll({
      where,
      include: [{ model: PlatformAccount, include: includeTemplate }],
      order: [['created_at', 'DESC']],
      limit
    });

    res.json(logs);
  } catch (error) {
    res.status(500).json({ message: '获取平台同步日志失败。', error: error.message });
  }
});

router.post('/', requireModules('platforms'), requireRoles(['super_admin', 'hr_manager']), async (req, res) => {
  try {
    const { template_id, account_name, resume_import_enabled, status, notes } = req.body;

    if (!template_id || !account_name) {
      return res.status(400).json({ message: '平台模板和账号名称不能为空。' });
    }

    const template = await PlatformTemplate.findByPk(template_id);

    if (!template) {
      return res.status(404).json({ message: '未找到平台模板。' });
    }
    if (template.code !== 'email_generic') {
      return res.status(400).json({ message: '仅支持邮箱同步模板。' });
    }

    const normalizedPayload = normalizePlatformPayload(req.body);

    const account = await PlatformAccount.create({
      template_id,
      account_name,
      auth_type: 'imap',
      credentials_encrypted: normalizedPayload.credentials_encrypted,
      auth_snapshot: normalizedPayload.auth_snapshot,
      resume_import_enabled: resume_import_enabled ?? true,
      job_publish_enabled: false,
      status: status || 'active',
      notes: notes || null,
      created_by: req.currentUser.id
    });

    const created = await PlatformAccount.findByPk(account.id, { include: includeTemplate });
    res.status(201).json(created);
  } catch (error) {
    res.status(500).json({ message: '新增平台账号失败。', error: error.message });
  }
});

router.put('/:id', requireModules('platforms'), requireRoles(['super_admin', 'hr_manager']), async (req, res) => {
  try {
    const account = await PlatformAccount.findByPk(req.params.id);

    if (!account) {
      return res.status(404).json({ message: '未找到平台账号。' });
    }

    const normalizedPayload = normalizePlatformPayload(req.body, account);

    const payload = {
      template_id: req.body.template_id ?? account.template_id,
      account_name: req.body.account_name ?? account.account_name,
      auth_type: 'imap',
      credentials_encrypted: normalizedPayload.credentials_encrypted,
      auth_snapshot: normalizedPayload.auth_snapshot,
      resume_import_enabled: req.body.resume_import_enabled ?? account.resume_import_enabled,
      job_publish_enabled: false,
      status: req.body.status ?? account.status,
      notes: req.body.notes ?? account.notes,
      updated_at: new Date()
    };

    const template = await PlatformTemplate.findByPk(payload.template_id);

    if (!template) {
      return res.status(404).json({ message: '未找到平台模板。' });
    }
    if (template.code !== 'email_generic') {
      return res.status(400).json({ message: '仅支持邮箱同步模板。' });
    }

    await account.update(payload);
    const updated = await PlatformAccount.findByPk(account.id, { include: includeTemplate });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: '更新平台账号失败。', error: error.message });
  }
});

router.post('/:id/test-connection', requireModules('platforms'), requireRoles(['super_admin', 'hr_manager']), async (req, res) => {
  try {
    const account = await PlatformAccount.findByPk(req.params.id, { include: includeTemplate });

    if (!account) {
      return res.status(404).json({ message: '未找到平台账号。' });
    }

    const result = buildTestResult(account);
    if (result.status === 'success' && account.PlatformTemplate?.code === 'email_generic') {
      const config = extractConnectionConfig(account);
      const port = Number(config.imap_port || 993);
      const client = new ImapFlow({
        host: config.imap_host,
        port,
        secure: port === 993 || String(config.imap_tls).toLowerCase() === 'true',
        auth: { user: config.imap_user, pass: config.imap_password }
      });

      try {
        await client.connect();
        await client.mailboxOpen(config.mailbox || 'INBOX', { readOnly: true });
        await client.logout();
        result.message = 'IMAP 连接成功。';
      } catch (error) {
        result.status = 'failed';
        result.message = `IMAP 连接失败：${error.message}`;
      }
    }
    const now = new Date();
    const snapshot = account.auth_snapshot && typeof account.auth_snapshot === 'object' ? { ...account.auth_snapshot } : {};

    if (result.status === 'success' && account.PlatformTemplate?.code === 'email_generic' && !snapshot.bound_at) {
      snapshot.bound_at = now.toISOString();
    }

    await account.update({
      last_test_at: now,
      last_test_status: result.status,
      last_test_message: result.message,
      last_auth_at: result.status === 'success' ? now : account.last_auth_at,
      auth_snapshot: snapshot,
      updated_at: now
    });

    await createSyncLog({
      account,
      actionType: 'test_connection',
      targetType: 'platform_account',
      status: result.status,
      message: result.message,
      payloadSnapshot: {
        template_code: account.PlatformTemplate?.code || null,
        auth_type: account.auth_type,
        details: result.details || null
      },
      operatorId: req.currentUser.id
    });

    const refreshed = await PlatformAccount.findByPk(account.id, { include: includeTemplate });

    res.json({
      message: result.message,
      result,
      account: refreshed
    });
  } catch (error) {
    res.status(500).json({ message: '测试平台连接失败。', error: error.message });
  }
});

router.post('/:id/sync-email', requireModules('platforms'), requireRoles(['super_admin', 'hr_manager']), async (req, res) => {
  try {
    const account = await PlatformAccount.findByPk(req.params.id, { include: includeTemplate });

    if (!account || account.PlatformTemplate?.code !== 'email_generic') {
      return res.status(404).json({ message: '未找到邮箱同步账号。' });
    }

    if (isEmailSyncRunning(account.id)) {
      return res.status(409).json({ status: 'running', message: '该邮箱同步任务正在执行，请稍后再试。' });
    }

    const syncLog = await createSyncLog({
      account,
      actionType: 'email_sync',
      targetType: 'platform_account',
      status: 'running',
      message: '同步任务已提交，正在处理中。',
      payloadSnapshot: null,
      operatorId: req.currentUser.id
    });

    res.status(202).json({ status: 'running', message: '同步任务已提交。' });

    setImmediate(async () => {
      let result;
      try {
        result = await syncEmailAccount(account);
      } catch (error) {
        result = { status: 'failed', message: error.message || '同步失败' };
      }

      try {
        await PlatformSyncLog.update(
          {
            status: result.status || 'failed',
            message: result.message || '同步失败'
          },
          { where: { id: syncLog.id } }
        );
      } catch (error) {
        console.error('更新邮箱同步日志失败:', error.message);
      }
    });
  } catch (error) {
    res.status(500).json({ message: '邮箱同步失败。', error: error.message });
  }
});

module.exports = router;
