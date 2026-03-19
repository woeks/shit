<template>
  <section class="page-card page">
    <div class="page-header">
      <div>
        <h2 class="page-title">邮箱同步</h2>
        <p class="page-subtitle">配置企业邮箱账号后，系统定时拉取简历并自动入库预填。</p>
      </div>
      <div class="toolbar">
        <el-button @click="loadAll">刷新</el-button>
        <el-button type="primary" @click="openCreate">新增邮箱账号</el-button>
      </div>
    </div>

    <div class="section">
      <div class="section-header">
        <div>
          <h3>邮箱账号</h3>
          <p>一个账号代表一个邮箱收件箱配置，支持测试连接和手动同步。</p>
        </div>
        <div class="toolbar account-filters">
          <el-input v-model="filters.keyword" placeholder="搜索账号名称" clearable style="width: 220px" @keyup.enter="fetchAccounts" />
          <el-select v-model="filters.status" clearable placeholder="状态" style="width: 140px">
            <el-option label="启用" value="active" />
            <el-option label="停用" value="inactive" />
          </el-select>
          <el-button @click="fetchAccounts">筛选</el-button>
          <el-button @click="resetFilters">重置</el-button>
        </div>
      </div>

      <el-table :data="accounts" class="content-table" width="100%">
        <el-table-column prop="account_name" label="账号名称" min-width="180" />
        <el-table-column label="邮箱账号" min-width="200">
          <template #default="{ row }">
            {{ resolveConfig(row).imap_user || '-' }}
          </template>
        </el-table-column>
        <el-table-column label="收件箱" min-width="160">
          <template #default="{ row }">
            {{ resolveConfig(row).mailbox || 'INBOX' }}
          </template>
        </el-table-column>
        <el-table-column label="岗位范围" min-width="200">
          <template #default="{ row }">
            {{ resolveJobTitle(resolveConfig(row).default_job_id) }}
          </template>
        </el-table-column>
        <el-table-column label="简历同步" min-width="120">
          <template #default="{ row }">
            {{ row.resume_import_enabled ? '开启' : '关闭' }}
          </template>
        </el-table-column>
        <el-table-column label="状态" min-width="120">
          <template #default="{ row }">
            {{ toLabel(row.status, statusLabelMap) }}
          </template>
        </el-table-column>
        <el-table-column label="测试结果" min-width="160">
          <template #default="{ row }">
            {{ toLabel(row.last_test_status || 'pending', statusLabelMap) }}
          </template>
        </el-table-column>
        <el-table-column prop="last_test_at" label="最近测试" min-width="180" :formatter="formatDateCell" />
        <el-table-column prop="last_sync_at" label="最近同步" min-width="180" :formatter="formatDateCell" />
        <el-table-column prop="last_test_message" label="测试说明" min-width="280" show-overflow-tooltip />
        <el-table-column label="操作" min-width="200" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link :loading="testingMap[row.id]" @click="testConnection(row)">测试连接</el-button>
            <el-button type="primary" link :loading="syncingMap[row.id]" @click="manualSync(row)">手动同步</el-button>
            <el-button type="primary" link @click="openEdit(row)">编辑</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <div class="section">
      <div class="section-header">
        <div>
          <h3>同步日志</h3>
          <p>记录邮箱连接测试与同步结果。</p>
        </div>
      </div>
      <el-table :data="syncLogs" class="content-table" width="100%">
        <el-table-column prop="created_at" label="时间" min-width="180" :formatter="formatDateCell" />
        <el-table-column label="账号" min-width="200">
          <template #default="{ row }">
            {{ row.PlatformAccount?.account_name || '-' }}
          </template>
        </el-table-column>
        <el-table-column label="动作" min-width="140">
          <template #default="{ row }">
            {{ row.action_type === 'email_sync' ? '邮箱同步' : '测试连接' }}
          </template>
        </el-table-column>
        <el-table-column label="状态" min-width="120">
          <template #default="{ row }">
            {{ toLabel(row.status, statusLabelMap) }}
          </template>
        </el-table-column>
        <el-table-column prop="message" label="说明" min-width="360" show-overflow-tooltip />
      </el-table>
    </div>

    <el-dialog v-model="dialogVisible" :width="dialogFullscreen ? '100%' : '720px'" :fullscreen="dialogFullscreen" class="smart-dialog">
      <template #header>
        <DialogHeaderBar
          :title="editingAccount ? '编辑邮箱账号' : '新增邮箱账号'"
          :fullscreen="dialogFullscreen"
          @toggle="toggleDialogFullscreen"
        />
      </template>
      <el-form :model="form" label-width="120px">
        <el-form-item label="账号名称">
          <el-input v-model="form.account_name" placeholder="例如：招聘邮箱主账号" />
        </el-form-item>
        <el-form-item label="IMAP地址">
          <el-input v-model="form.imap_host" placeholder="例如：imap.exmail.qq.com" />
        </el-form-item>
        <el-form-item label="IMAP端口">
          <el-input-number v-model="form.imap_port" :min="1" :max="65535" style="width: 100%" />
        </el-form-item>
        <el-form-item label="邮箱账号">
          <el-input v-model="form.imap_user" placeholder="例如：hr@company.com" />
        </el-form-item>
        <el-form-item label="邮箱授权码">
          <el-input v-model="form.imap_password" show-password placeholder="邮箱应用密码/授权码" />
        </el-form-item>
        <el-form-item label="收件箱">
          <el-input v-model="form.mailbox" placeholder="例如：INBOX/Resume" />
        </el-form-item>
        <el-form-item label="默认岗位（可选）">
          <el-select v-model="form.default_job_id" filterable placeholder="不选择则同步全部岗位" style="width: 100%">
            <el-option v-for="job in jobs" :key="job.id" :label="job.title" :value="job.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="主题关键字">
          <el-input v-model="form.subject_filter" placeholder="可选：只同步包含关键字的邮件" />
        </el-form-item>
        <el-form-item label="发件人过滤">
          <el-input v-model="form.from_filter" placeholder="可选：只同步指定发件人" />
        </el-form-item>
        <el-form-item label="简历同步">
          <el-switch v-model="form.resume_import_enabled" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="form.status" style="width: 100%">
            <el-option label="启用" value="active" />
            <el-option label="停用" value="inactive" />
          </el-select>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveAccount">保存</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { ElMessage } from 'element-plus';
import { onMounted, reactive, ref } from 'vue';
import http from '../api/http';
import { statusLabelMap, toLabel } from '../utils/labels';
import { formatDateCell } from '../utils/time';
import DialogHeaderBar from '../components/DialogHeaderBar.vue';
import { useDialogFullscreen } from '../composables/useDialogFullscreen';

interface Job {
  id: string;
  title: string;
}

interface PlatformAccount {
  id: string;
  account_name: string;
  status: string;
  auth_snapshot?: Record<string, any> | null;
  credentials_encrypted?: string | null;
  resume_import_enabled: boolean;
  last_test_status?: string | null;
  last_test_message?: string | null;
  last_test_at?: string | null;
  last_sync_at?: string | null;
}

interface PlatformSyncLog {
  id: string;
  created_at: string;
  action_type: string;
  status: string;
  message: string;
  PlatformAccount?: PlatformAccount | null;
}

const accounts = ref<PlatformAccount[]>([]);
const templates = ref<{ id: string; name: string }[]>([]);
const jobs = ref<Job[]>([]);
const syncLogs = ref<PlatformSyncLog[]>([]);
const { fullscreen: dialogFullscreen, toggleFullscreen: toggleDialogFullscreen } = useDialogFullscreen();
const dialogVisible = ref(false);
const saving = ref(false);
const editingAccount = ref<PlatformAccount | null>(null);
const testingMap = reactive<Record<string, boolean>>({});
const syncingMap = reactive<Record<string, boolean>>({});
const filters = reactive({ keyword: '', status: '' });

const form = reactive({
  account_name: '',
  imap_host: '',
  imap_port: 993,
  imap_user: '',
  imap_password: '',
  mailbox: 'INBOX',
  default_job_id: '',
  subject_filter: '',
  from_filter: '',
  resume_import_enabled: true,
  status: 'active'
});

const resolveConfig = (account: PlatformAccount) => {
  const snapshot = account.auth_snapshot || {};
  let credentials: Record<string, any> = {};
  if (account.credentials_encrypted) {
    try {
      credentials = JSON.parse(account.credentials_encrypted);
    } catch {
      credentials = {};
    }
  }
  return { ...snapshot, ...credentials };
};

const resolveJobTitle = (jobId?: string) => {
  if (!jobId) return '全部岗位';
  const job = jobs.value.find((item) => item.id === jobId);
  return job?.title || '全部岗位';
};

const fetchJobs = async () => {
  const { data } = await http.get<Job[]>('/api/jobs');
  jobs.value = data;
};

const fetchTemplates = async () => {
  const { data } = await http.get<{ id: string; name: string }[]>('/api/platforms/templates');
  templates.value = data;
};

const fetchAccounts = async () => {
  const { data } = await http.get<PlatformAccount[]>('/api/platforms', {
    params: {
      keyword: filters.keyword || undefined,
      status: filters.status || undefined
    }
  });
  accounts.value = data;
};

const fetchSyncLogs = async () => {
  const { data } = await http.get<PlatformSyncLog[]>('/api/platforms/sync-logs', {
    params: { limit: 30 }
  });
  syncLogs.value = data;
};

const loadAll = async () => {
  await Promise.all([fetchTemplates(), fetchJobs(), fetchAccounts(), fetchSyncLogs()]);
};

const resetFilters = async () => {
  filters.keyword = '';
  filters.status = '';
  await fetchAccounts();
};

const fillForm = (account?: PlatformAccount) => {
  const config = account ? resolveConfig(account) : {};
  form.account_name = account?.account_name || '';
  form.imap_host = config.imap_host || '';
  form.imap_port = Number(config.imap_port || 993);
  form.imap_user = config.imap_user || '';
  form.imap_password = config.imap_password || '';
  form.mailbox = config.mailbox || 'INBOX';
  form.default_job_id = config.default_job_id || '';
  form.subject_filter = config.subject_filter || '';
  form.from_filter = config.from_filter || '';
  form.resume_import_enabled = account?.resume_import_enabled ?? true;
  form.status = account?.status || 'active';
};

const openCreate = () => {
  editingAccount.value = null;
  fillForm();
  dialogVisible.value = true;
};

const openEdit = (account: PlatformAccount) => {
  editingAccount.value = account;
  fillForm(account);
  dialogVisible.value = true;
};

const saveAccount = async () => {
  if (!form.account_name || !form.imap_host || !form.imap_user || !form.imap_password) {
    ElMessage.warning('请填写账号名称、IMAP配置和授权码');
    return;
  }

  saving.value = true;
  try {
    const payload = {
      account_name: form.account_name,
      imap_host: form.imap_host,
      imap_port: form.imap_port,
      imap_user: form.imap_user,
      imap_password: form.imap_password,
      mailbox: form.mailbox,
      default_job_id: form.default_job_id,
      subject_filter: form.subject_filter,
      from_filter: form.from_filter,
      resume_import_enabled: form.resume_import_enabled,
      status: form.status
    };

    if (editingAccount.value) {
      await http.put(`/api/platforms/${editingAccount.value.id}`, payload);
    } else {
      if (!templates.value.length) {
        ElMessage.error('未找到邮箱同步模板');
        return;
      }
      await http.post('/api/platforms', { ...payload, template_id: templates.value[0].id });
    }

    dialogVisible.value = false;
    await loadAll();
    ElMessage.success('保存成功');
  } catch (error) {
    ElMessage.error('保存失败');
  } finally {
    saving.value = false;
  }
};

const testConnection = async (account: PlatformAccount) => {
  testingMap[account.id] = true;
  try {
    await http.post(`/api/platforms/${account.id}/test-connection`);
    await loadAll();
    ElMessage.success('测试完成');
  } catch {
    ElMessage.error('测试失败');
  } finally {
    testingMap[account.id] = false;
  }
};

const manualSync = async (account: PlatformAccount) => {
  syncingMap[account.id] = true;
  try {
    await http.post(`/api/platforms/${account.id}/sync-email`);
    await loadAll();
    ElMessage.success('同步已执行');
  } catch {
    ElMessage.error('同步失败');
  } finally {
    syncingMap[account.id] = false;
  }
};

onMounted(loadAll);
</script>

<style scoped>
.page {
  padding: 28px;
}

.section {
  margin-top: 20px;
}

.account-filters {
  gap: 12px;
}
</style>
