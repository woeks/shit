<template>
  <section class="page-card page">
    <div class="page-header">
      <div>
        <h2 class="page-title">面试官复筛</h2>
        <p class="page-subtitle">初筛通过后，由面试官或 HR 经理完成复筛，并将候选人移交待安排面试队列。</p>
      </div>
      <el-button @click="fetchReviewList">刷新队列</el-button>
    </div>

    <div class="toolbar search-bar">
      <el-input v-model="filters.keyword" placeholder="搜索姓名、电话、邮箱" style="width: 240px" @keyup.enter="fetchReviewList" />
      <el-select v-model="filters.job_id" clearable placeholder="应聘岗位" style="width: 220px" @change="fetchReviewList">
        <el-option v-for="job in jobs" :key="job.id" :label="job.title" :value="job.id" />
      </el-select>
      <el-button type="primary" @click="fetchReviewList">查询</el-button>
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
      <el-table-column prop="screened_at" label="初筛时间" min-width="180" :formatter="formatDateCell" />
      <el-table-column label="操作" min-width="240" fixed="right">
        <template #default="{ row }">
          <div class="actions">
            <el-button type="danger" plain :disabled="!canReview" @click="openDialog(row, 'reject')">淘汰</el-button>
            <el-button type="primary" :disabled="!canReview" @click="openDialog(row, 'pass')">通过并移交 HR</el-button>
          </div>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" :width="dialogFullscreen ? '100%' : '560px'" :fullscreen="dialogFullscreen" class="smart-dialog">
      <template #header>
        <DialogHeaderBar :title="dialogTitle" :fullscreen="dialogFullscreen" @toggle="toggleDialogFullscreen" />
      </template>
      <el-form :model="reviewForm" label-width="96px">
        <el-form-item label="候选人">
          <el-input :model-value="activeResume?.name || ''" disabled />
        </el-form-item>
        <el-form-item :label="actionLabel">
          <el-input
            v-model="reviewForm.reason"
            type="textarea"
            :rows="4"
            :placeholder="reviewMode === 'reject' ? '请填写淘汰原因' : '可填写复筛备注'"
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitReview">确认</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { apiBaseUrl } from '../api/base';
import http from '../api/http';
import { formatDateCell } from '../utils/time';
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
  screened_at: string;
  Job?: Job;
}

interface SessionUser {
  id: string;
  Role?: { code: string };
}

const resumes = ref<Resume[]>([]);
const jobs = ref<Job[]>([]);
const activeResume = ref<Resume | null>(null);
const dialogVisible = ref(false);
const { fullscreen: dialogFullscreen, toggleFullscreen: toggleDialogFullscreen } = useDialogFullscreen();
const submitting = ref(false);
const reviewMode = ref<'pass' | 'reject'>('pass');
const canReview = ref(false);
const filters = reactive({
  keyword: '',
  job_id: ''
});
const reviewForm = reactive({
  reason: ''
});
const fileUrl = (url: string) => `${apiBaseUrl}${url}`;

const dialogTitle = computed(() => (reviewMode.value === 'reject' ? '复筛淘汰' : '复筛通过'));
const actionLabel = computed(() => (reviewMode.value === 'reject' ? '淘汰原因' : '复筛备注'));

const resetForm = () => {
  reviewForm.reason = '';
};

const fetchSession = async () => {
  const { data } = await http.get<SessionUser>('/api/session');
  canReview.value = ['interviewer', 'hr_manager', 'super_admin'].includes(data.Role?.code || '');
};

const fetchJobs = async () => {
  const { data } = await http.get<Job[]>('/api/jobs');
  jobs.value = data;
};

const fetchReviewList = async () => {
  try {
    const { data } = await http.get<Resume[]>('/api/resumes/review', {
      params: {
        keyword: filters.keyword || undefined,
        job_id: filters.job_id || undefined
      }
    });
    resumes.value = data;
  } catch (error) {
    ElMessage.error('获取复筛队列失败');
  }
};

const resetFilters = async () => {
  filters.keyword = '';
  filters.job_id = '';
  await fetchReviewList();
};

const openDialog = (resume: Resume, mode: 'pass' | 'reject') => {
  activeResume.value = resume;
  reviewMode.value = mode;
  resetForm();
  dialogVisible.value = true;
};

const submitReview = async () => {
  if (!activeResume.value) {
    return;
  }

  if (reviewMode.value === 'reject' && !reviewForm.reason) {
    ElMessage.warning('请填写淘汰原因');
    return;
  }

  submitting.value = true;

  try {
    await http.post(`/api/resumes/${activeResume.value.id}/review`, {
      action: reviewMode.value,
      reason: reviewForm.reason
    });

    dialogVisible.value = false;
    await fetchReviewList();

    if (reviewMode.value === 'pass') {
      ElMessage.success('复筛通过，已进入 HR 待安排队列');
    } else {
      ElMessage.success('候选人已在复筛阶段淘汰');
    }
  } catch (error) {
    ElMessage.error('复筛处理失败');
  } finally {
    submitting.value = false;
  }
};

onMounted(async () => {
  await Promise.all([fetchSession(), fetchJobs(), fetchReviewList()]);
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
