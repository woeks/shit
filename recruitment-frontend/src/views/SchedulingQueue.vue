<template>
  <section class="page-card page">
    <div class="page-header">
      <div>
        <h2 class="page-title">待安排面试</h2>
        <p class="page-subtitle">由 HR 经理统一查看复筛通过的候选人，并为当前轮次安排面试。</p>
      </div>
      <el-button @click="fetchQueue">刷新队列</el-button>
    </div>

    <div class="toolbar search-bar">
      <el-input v-model="filters.keyword" placeholder="搜索姓名、电话、邮箱" style="width: 240px" @keyup.enter="fetchQueue" />
      <el-select v-model="filters.job_id" clearable placeholder="岗位" style="width: 220px" @change="fetchQueue">
        <el-option v-for="job in jobs" :key="job.id" :label="job.title" :value="job.id" />
      </el-select>
      <el-button type="primary" @click="fetchQueue">查询</el-button>
      <el-button @click="resetFilters">重置</el-button>
    </div>

    <el-table :data="resumes" class="content-table" width="100%">
      <el-table-column prop="name" label="姓名" min-width="120" />
      <el-table-column prop="phone" label="电话" min-width="140" />
      <el-table-column prop="email" label="邮箱" min-width="220" />
      <el-table-column label="岗位" min-width="180">
        <template #default="{ row }">
          {{ row.Job?.title || '-' }}
        </template>
      </el-table-column>
      <el-table-column label="当前轮次" min-width="120">
        <template #default="{ row }">
          {{ row.current_round }}/{{ row.total_rounds }}
        </template>
      </el-table-column>
      <el-table-column prop="reviewer" label="复筛面试官" min-width="140" />
      <el-table-column prop="reviewed_at" label="复筛时间" min-width="180" :formatter="formatDateCell" />
      <el-table-column label="操作" min-width="140" fixed="right">
        <template #default="{ row }">
          <el-button type="primary" @click="openSchedule(row)">安排面试</el-button>
        </template>
      </el-table-column>
    </el-table>
  </section>
</template>

<script setup lang="ts">
import { ElMessage } from 'element-plus';
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import http from '../api/http';
import { formatDateCell } from '../utils/time';

interface Job {
  id: string;
  title: string;
}

interface Resume {
  id: string;
  name: string;
  phone: string;
  email: string;
  reviewer?: string;
  reviewed_at?: string;
  current_round: number;
  total_rounds: number;
  Job?: Job;
}

const router = useRouter();
const resumes = ref<Resume[]>([]);
const jobs = ref<Job[]>([]);
const filters = ref({
  keyword: '',
  job_id: ''
});

const fetchJobs = async () => {
  const { data } = await http.get<Job[]>('/api/jobs');
  jobs.value = data;
};

const fetchQueue = async () => {
  try {
    const { data } = await http.get<Resume[]>('/api/resumes/scheduling', {
      params: {
        keyword: filters.value.keyword || undefined,
        job_id: filters.value.job_id || undefined
      }
    });
    resumes.value = data;
  } catch (error) {
    ElMessage.error('获取待安排面试队列失败');
  }
};

const resetFilters = async () => {
  filters.value.keyword = '';
  filters.value.job_id = '';
  await fetchQueue();
};

const openSchedule = async (resume: Resume) => {
  await router.push(`/interviews/schedule/${resume.id}`);
};

onMounted(async () => {
  await Promise.all([fetchJobs(), fetchQueue()]);
});
</script>

<style scoped>
.page {
  padding: 28px;
}

.search-bar {
  margin-bottom: 16px;
}
</style>
