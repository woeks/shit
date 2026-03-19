<template>
  <section class="page-card page">
    <div class="page-header">
      <div>
        <h2 class="page-title">HR 初筛</h2>
        <p class="page-subtitle">初筛只做通过或淘汰决策，通过后进入面试官复筛队列。</p>
      </div>
      <el-button @click="fetchScreeningList">刷新队列</el-button>
    </div>

    <div class="toolbar search-bar">
      <el-input v-model="filters.keyword" placeholder="搜索姓名、电话、邮箱" style="width: 240px" @keyup.enter="fetchScreeningList" />
      <el-select v-model="filters.job_id" clearable placeholder="应聘岗位" style="width: 220px" @change="fetchScreeningList">
        <el-option v-for="job in jobs" :key="job.id" :label="job.title" :value="job.id" />
      </el-select>
      <el-button type="primary" @click="fetchScreeningList">查询</el-button>
      <el-button @click="resetFilters">重置</el-button>
    </div>

    <el-table :data="resumes" class="content-table" width="100%">
      <el-table-column prop="name" label="姓名" min-width="120" />
      <el-table-column prop="phone" label="电话" min-width="140" />
      <el-table-column prop="email" label="邮箱" min-width="220" />
      <el-table-column label="简历附件" min-width="120">
        <template #default="{ row }">
          <el-link v-if="row.file_url" :href="fileUrl(row.file_url)" target="_blank" type="primary">查看附件</el-link>
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column label="应聘岗位" min-width="180">
        <template #default="{ row }">
          {{ row.Job?.title || '-' }}
        </template>
      </el-table-column>
      <el-table-column label="接收时间" min-width="180" :formatter="formatEffectiveReceivedAtCell" />
      <el-table-column label="操作" min-width="220" fixed="right">
        <template #default="{ row }">
          <div class="actions">
            <el-button type="danger" plain @click="openRejectDialog(row)">淘汰</el-button>
            <el-button type="primary" @click="submitPass(row)">通过并进入复筛</el-button>
          </div>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog
      v-model="rejectDialogVisible"
      :width="rejectDialogFullscreen ? '100%' : '520px'"
      :fullscreen="rejectDialogFullscreen"
      class="smart-dialog"
    >
      <template #header>
        <DialogHeaderBar title="淘汰简历" :fullscreen="rejectDialogFullscreen" @toggle="toggleRejectDialogFullscreen" />
      </template>
      <el-form :model="rejectForm" label-width="88px">
        <el-form-item label="候选人">
          <el-input :model-value="activeResume?.name || ''" disabled />
        </el-form-item>
        <el-form-item label="淘汰原因">
          <el-input v-model="rejectForm.reason" type="textarea" :rows="4" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="rejectDialogVisible = false">取消</el-button>
        <el-button type="danger" :loading="submitting" @click="submitReject">确认淘汰</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { ElMessage } from 'element-plus';
import { onMounted, reactive, ref } from 'vue';
import { apiBaseUrl } from '../api/base';
import http from '../api/http';
import { formatDateTime } from '../utils/time';
import DialogHeaderBar from '../components/DialogHeaderBar.vue';
import { useDialogFullscreen } from '../composables/useDialogFullscreen';

interface Job {
  id: string;
  title: string;
}

interface Resume {
  id: string;
  name: string;
  phone: string;
  email: string;
  file_url?: string | null;
  received_at: string;
  source_received_at?: string | null;
  Job?: Job;
}

const resumes = ref<Resume[]>([]);
const jobs = ref<Job[]>([]);
const activeResume = ref<Resume | null>(null);
const { fullscreen: rejectDialogFullscreen, toggleFullscreen: toggleRejectDialogFullscreen } = useDialogFullscreen();
const rejectDialogVisible = ref(false);
const submitting = ref(false);
const filters = reactive({
  keyword: '',
  job_id: ''
});
const rejectForm = reactive({
  reason: ''
});
const fileUrl = (url: string) => `${apiBaseUrl}${url}`;
const formatEffectiveReceivedAtCell = (_row: unknown, _column: unknown, _value: unknown, _index: number) =>
  formatDateTime(((_row as Resume).source_received_at || (_row as Resume).received_at) ?? null);

const fetchJobs = async () => {
  const { data } = await http.get<Job[]>('/api/jobs');
  jobs.value = data;
};

const fetchScreeningList = async () => {
  try {
    const { data } = await http.get<Resume[]>('/api/resumes/screening', {
      params: {
        keyword: filters.keyword || undefined,
        job_id: filters.job_id || undefined
      }
    });
    resumes.value = data;
  } catch (error) {
    ElMessage.error('获取初筛队列失败');
  }
};

const resetFilters = async () => {
  filters.keyword = '';
  filters.job_id = '';
  await fetchScreeningList();
};

const openRejectDialog = (resume: Resume) => {
  activeResume.value = resume;
  rejectDialogVisible.value = true;
};

const submitReject = async () => {
  if (!activeResume.value) {
    return;
  }

  submitting.value = true;
  try {
    await http.post(`/api/resumes/${activeResume.value.id}/screen`, {
      action: 'reject',
      reason: rejectForm.reason
    });
    ElMessage.success('已淘汰该候选人');
    rejectDialogVisible.value = false;
    rejectForm.reason = '';
    await fetchScreeningList();
  } catch (error) {
    ElMessage.error('处理失败');
  } finally {
    submitting.value = false;
  }
};

const submitPass = async (resume: Resume) => {
  submitting.value = true;
  try {
    await http.post(`/api/resumes/${resume.id}/screen`, {
      action: 'pass'
    });
    ElMessage.success('初筛通过，已进入复筛队列');
    await fetchScreeningList();
  } catch (error) {
    ElMessage.error('初筛通过失败');
  } finally {
    submitting.value = false;
  }
};

onMounted(async () => {
  await Promise.all([fetchJobs(), fetchScreeningList()]);
});
</script>

<style scoped>
.page {
  padding: 28px;
}

.search-bar {
  margin-bottom: 16px;
}

.actions {
  display: flex;
  gap: 10px;
}
</style>
