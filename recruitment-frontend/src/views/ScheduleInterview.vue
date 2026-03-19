<template>
  <section class="page-card page">
    <div class="page-header">
      <div>
        <h2 class="page-title">安排面试</h2>
        <p class="page-subtitle">由 HR 经理为待安排候选人分配当前轮次的面试官和时间。</p>
      </div>
      <div class="toolbar">
        <el-button @click="goBack">返回</el-button>
      </div>
    </div>

    <el-skeleton :loading="loading" animated>
      <template #template>
        <el-skeleton-item variant="rect" style="width: 100%; height: 280px" />
      </template>

      <div v-if="progress.resume" class="schedule-grid">
        <el-card shadow="never">
          <template #header>候选人信息</template>
          <div class="info-list">
            <div><strong>姓名：</strong>{{ progress.resume.name }}</div>
            <div><strong>电话：</strong>{{ progress.resume.phone }}</div>
            <div><strong>邮箱：</strong>{{ progress.resume.email }}</div>
            <div><strong>岗位：</strong>{{ progress.job?.title || '-' }}</div>
            <div><strong>当前轮次：</strong>{{ progress.current_round }}/{{ progress.total_rounds }}</div>
            <div><strong>轮次名称：</strong>{{ currentRoundName }}</div>
            <div><strong>当前状态：</strong>{{ progress.resume.status }}</div>
          </div>
        </el-card>

        <el-card shadow="never">
          <template #header>面试安排</template>
          <el-form :model="form" label-width="96px">
            <el-form-item label="轮次名称">
              <el-input :model-value="currentRoundName" disabled />
            </el-form-item>
            <el-form-item label="面试官">
              <el-select v-model="form.interviewer_id" placeholder="选择面试官" style="width: 100%">
                <el-option
                  v-for="item in progress.available_interviewers || []"
                  :key="item.id"
                  :label="item.assigned_to_job ? item.name : `${item.name}（未绑定岗位）`"
                  :value="item.id"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="面试方式">
              <el-radio-group v-model="form.interview_mode">
                <el-radio label="offline">线下</el-radio>
                <el-radio label="online">线上</el-radio>
              </el-radio-group>
            </el-form-item>
            <el-form-item label="面试时间">
              <el-date-picker
                v-model="form.scheduled_time"
                type="datetime"
                placeholder="选择面试时间"
                style="width: 100%"
              />
            </el-form-item>
            <div v-if="progress.interviewer_fallback_used" class="helper-text">
              当前岗位未分配专属面试官，已回退显示所有启用中的面试官账号。建议到“人员权限”模块补充分配岗位。
            </div>
            <el-form-item>
              <el-button type="primary" :loading="submitting" @click="submitSchedule">提交安排</el-button>
            </el-form-item>
          </el-form>
        </el-card>
      </div>
    </el-skeleton>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import http from '../api/http';

interface Job {
  id: string;
  title: string;
  round_names?: string[];
}

interface UserItem {
  id: string;
  name: string;
  assigned_to_job?: boolean;
}

interface Resume {
  id: string;
  name: string;
  phone: string;
  email: string;
  status: string;
}

interface ProgressResponse {
  resume: Resume;
  job?: Job;
  current_round: number;
  total_rounds: number;
  available_interviewers: UserItem[];
  interviewer_fallback_used?: boolean;
}

const route = useRoute();
const router = useRouter();
const loading = ref(true);
const submitting = ref(false);
const progress = reactive<Partial<ProgressResponse>>({});
const form = reactive({
  interviewer_id: '',
  scheduled_time: '',
  interview_mode: 'offline'
});

const currentRoundName = computed(() => {
  const currentRound = progress.current_round || 1;
  const names = progress.job?.round_names || [];
  return names[currentRound - 1] || `第${currentRound}轮面试`;
});

const fetchProgress = async () => {
  loading.value = true;
  try {
    const { data } = await http.get<ProgressResponse>(`/api/resumes/${route.params.resumeId}/interview-progress`);
    Object.assign(progress, data);

    if (!['schedule_pending', 'interviewing'].includes(data.resume.status)) {
      ElMessage.warning('该候选人当前不在待安排面试阶段');
      await router.replace('/interviews/scheduling');
    }
  } catch (error) {
    ElMessage.error('获取候选人进度失败');
  } finally {
    loading.value = false;
  }
};

const submitSchedule = async () => {
  if (!form.interviewer_id || !form.scheduled_time) {
    ElMessage.warning('请选择面试官和时间');
    return;
  }

  submitting.value = true;
  try {
    await http.post('/api/interviews/schedule', {
      resume_id: route.params.resumeId,
      interviewer_id: form.interviewer_id,
      scheduled_time: form.scheduled_time,
      interview_mode: form.interview_mode,
      round_index: progress.current_round
    });
    ElMessage.success('面试安排成功');
    await router.push('/interviews/scheduling');
  } catch (error) {
    ElMessage.error('面试安排失败');
  } finally {
    submitting.value = false;
  }
};

const goBack = () => router.back();

onMounted(fetchProgress);
</script>

<style scoped>
.page {
  padding: 28px;
}

.schedule-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.info-list {
  display: grid;
  gap: 14px;
  color: var(--text-main);
}

.helper-text {
  margin: 0 0 14px 96px;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.6;
}

@media (max-width: 960px) {
  .schedule-grid {
    grid-template-columns: 1fr;
  }
}
</style>
