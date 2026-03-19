<template>
  <section class="page-card page">
    <div class="page-header">
      <div>
        <h2 class="page-title">面试管理</h2>
        <p class="page-subtitle">统一查看各轮面试安排，并录入结构化面试反馈。</p>
      </div>
      <div class="toolbar">
        <el-input v-model="filters.keyword" style="width: 220px" placeholder="搜索候选人" @keyup.enter="fetchInterviews" />
        <el-select v-model="filters.job_id" clearable style="width: 200px" placeholder="岗位" @change="fetchInterviews">
          <el-option v-for="job in jobs" :key="job.id" :label="job.title" :value="job.id" />
        </el-select>
        <el-select v-model="filters.status" style="width: 180px" @change="fetchInterviews">
          <el-option label="全部状态" value="" />
          <el-option label="待面试" value="pending" />
          <el-option label="已完成" value="completed" />
        </el-select>
        <el-select v-model="filters.result" style="width: 180px" @change="fetchInterviews">
          <el-option label="全部结果" value="" />
          <el-option label="待反馈" value="pending" />
          <el-option label="已通过" value="passed" />
          <el-option label="未通过" value="failed" />
        </el-select>
        <el-button @click="fetchInterviews">刷新</el-button>
      </div>
    </div>

    <el-table :data="interviews" class="content-table" width="100%">
      <el-table-column label="候选人" min-width="120">
        <template #default="{ row }">
          {{ row.Resume?.name || '-' }}
        </template>
      </el-table-column>
      <el-table-column label="岗位" min-width="180">
        <template #default="{ row }">
          {{ row.Resume?.Job?.title || '-' }}
        </template>
      </el-table-column>
      <el-table-column label="轮次" min-width="150">
        <template #default="{ row }">
          {{ row.round_name || `第${row.round_index}轮` }}
        </template>
      </el-table-column>
      <el-table-column prop="interviewer" label="面试官" min-width="140" />
      <el-table-column label="面试方式" min-width="120">
        <template #default="{ row }">
          {{ interviewModeLabelMap[row.interview_mode || ''] || '-' }}
        </template>
      </el-table-column>
      <el-table-column prop="scheduled_time" label="计划时间" min-width="180" :formatter="formatDateCell" />
      <el-table-column label="建议" min-width="140">
        <template #default="{ row }">
          {{ recommendationLabelMap[row.recommendation || ''] || '-' }}
        </template>
      </el-table-column>
      <el-table-column label="结果" min-width="120">
        <template #default="{ row }">
          <span class="status-pill">{{ toLabel(row.result || row.status, row.result ? resultLabelMap : statusLabelMap) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" min-width="120" fixed="right">
        <template #default="{ row }">
          <el-button type="primary" :disabled="row.result !== 'pending' || !canSubmitFeedback" @click="openFeedback(row)">反馈</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" :width="dialogFullscreen ? '100%' : '620px'" :fullscreen="dialogFullscreen" class="smart-dialog">
      <template #header>
        <DialogHeaderBar title="提交面试反馈" :fullscreen="dialogFullscreen" @toggle="toggleDialogFullscreen" />
      </template>
      <el-form :model="feedbackForm" label-width="96px">
        <el-form-item label="候选人">
          <el-input :model-value="activeInterview?.Resume?.name || ''" disabled />
        </el-form-item>
        <el-form-item label="轮次">
          <el-input :model-value="activeInterview?.round_name || ''" disabled />
        </el-form-item>
        <el-form-item label="面试官">
          <el-input :model-value="activeInterview?.interviewer || ''" disabled />
        </el-form-item>
        <el-form-item label="面试方式">
          <el-input :model-value="interviewModeLabelMap[activeInterview?.interview_mode || ''] || '-'" disabled />
        </el-form-item>
        <el-form-item label="面试结果">
          <el-radio-group v-model="feedbackForm.result">
            <el-radio label="passed">通过</el-radio>
            <el-radio label="failed">不通过</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="技术能力">
          <el-rate v-model="feedbackForm.technical_score" :max="5" show-score />
        </el-form-item>
        <el-form-item label="沟通表达">
          <el-rate v-model="feedbackForm.communication_score" :max="5" show-score />
        </el-form-item>
        <el-form-item label="文化匹配">
          <el-rate v-model="feedbackForm.culture_score" :max="5" show-score />
        </el-form-item>
        <el-form-item label="录用建议">
          <el-select v-model="feedbackForm.recommendation" placeholder="选择建议" style="width: 100%">
            <el-option
              v-for="item in recommendationOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="评价">
          <el-input v-model="feedbackForm.evaluation" type="textarea" :rows="4" placeholder="填写面试综合评价" />
        </el-form-item>
        <el-form-item label="不通过原因">
          <el-input v-model="feedbackForm.reason" type="textarea" :rows="3" placeholder="通过时可留空" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitFeedback">提交反馈</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { ElMessage } from 'element-plus';
import { onMounted, reactive, ref } from 'vue';
import http from '../api/http';
import { formatDateCell } from '../utils/time';
import { resultLabelMap, statusLabelMap, toLabel } from '../utils/labels';
import DialogHeaderBar from '../components/DialogHeaderBar.vue';
import { useDialogFullscreen } from '../composables/useDialogFullscreen';

interface Job {
  id: string;
  title: string;
}

interface Resume {
  id: string;
  name: string;
  Job?: Job;
}

interface Interview {
  id: string;
  interviewer: string;
  interview_mode?: string;
  scheduled_time: string;
  result: string;
  status: string;
  round_index: number;
  round_name: string;
  recommendation?: string;
  Resume?: Resume;
}

interface SessionUser {
  id: string;
  Role?: { code: string };
}

const recommendationOptions = [
  { label: '强烈推荐', value: 'strong_hire' },
  { label: '推荐录用', value: 'hire' },
  { label: '建议保留', value: 'hold' },
  { label: '不推荐', value: 'no_hire' }
];
const interviewModeLabelMap: Record<string, string> = {
  offline: '线下',
  online: '线上'
};
const recommendationLabelMap = Object.fromEntries(recommendationOptions.map((item) => [item.value, item.label]));
const interviews = ref<Interview[]>([]);
const jobs = ref<Job[]>([]);
const activeInterview = ref<Interview | null>(null);
const { fullscreen: dialogFullscreen, toggleFullscreen: toggleDialogFullscreen } = useDialogFullscreen();
const dialogVisible = ref(false);
const submitting = ref(false);
const canSubmitFeedback = ref(false);
const filters = reactive({
  keyword: '',
  job_id: '',
  status: 'pending',
  result: ''
});

const feedbackForm = reactive({
  result: 'passed',
  technical_score: 4,
  communication_score: 4,
  culture_score: 4,
  recommendation: 'hire',
  evaluation: '',
  reason: ''
});

const resetForm = () => {
  feedbackForm.result = 'passed';
  feedbackForm.technical_score = 4;
  feedbackForm.communication_score = 4;
  feedbackForm.culture_score = 4;
  feedbackForm.recommendation = 'hire';
  feedbackForm.evaluation = '';
  feedbackForm.reason = '';
};

const fetchJobs = async () => {
  const { data } = await http.get<Job[]>('/api/jobs');
  jobs.value = data;
};

const fetchSession = async () => {
  const { data } = await http.get<SessionUser>('/api/session');
  canSubmitFeedback.value = ['interviewer', 'super_admin', 'hr_manager'].includes(data.Role?.code || '');
};

const fetchInterviews = async () => {
  try {
    const { data } = await http.get<Interview[]>('/api/interviews', {
      params: {
        status: filters.status || undefined,
        result: filters.result || undefined,
        keyword: filters.keyword || undefined,
        job_id: filters.job_id || undefined
      }
    });
    interviews.value = data;
  } catch (error) {
    ElMessage.error('获取面试列表失败');
  }
};

const openFeedback = (interview: Interview) => {
  activeInterview.value = interview;
  dialogVisible.value = true;
  resetForm();
};

const submitFeedback = async () => {
  if (!activeInterview.value) {
    return;
  }

  if (feedbackForm.result === 'failed' && !feedbackForm.reason) {
    ElMessage.warning('请填写不通过原因');
    return;
  }

  submitting.value = true;
  try {
    await http.post(`/api/interviews/${activeInterview.value.id}/feedback`, feedbackForm);
    ElMessage.success('反馈提交成功');
    dialogVisible.value = false;
    await fetchInterviews();
  } catch (error) {
    ElMessage.error('提交反馈失败');
  } finally {
    submitting.value = false;
  }
};

onMounted(async () => {
  await Promise.all([fetchSession(), fetchJobs(), fetchInterviews()]);
});
</script>

<style scoped>
.page {
  padding: 28px;
}

:deep(.el-rate) {
  line-height: 1;
}
</style>
