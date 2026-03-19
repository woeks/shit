<template>
  <section class="page-card page">
    <div class="page-header">
      <div>
        <h2 class="page-title">报表中心</h2>
        <p class="page-subtitle">支持按岗位、状态、来源和时间筛选统计 HR 与面试官绩效，并导出核心数据。</p>
      </div>
      <el-button @click="loadAllReports">刷新</el-button>
    </div>

    <div class="toolbar report-toolbar">
      <el-select v-model="filters.job_id" placeholder="岗位" clearable style="width: 180px">
        <el-option v-for="job in jobs" :key="job.id" :label="job.title" :value="job.id" />
      </el-select>
      <el-select v-model="filters.status" placeholder="状态" style="width: 180px">
        <el-option label="全部状态" value="all" />
        <el-option label="待初筛" value="new" />
        <el-option label="待复筛" value="review_pending" />
        <el-option label="待安排面试" value="schedule_pending" />
        <el-option label="面试中" value="interviewing" />
        <el-option label="待发录用" value="offer_pending" />
        <el-option label="已发录用" value="offer_sent" />
        <el-option label="已录用" value="hired" />
        <el-option label="已淘汰" value="rejected" />
      </el-select>
      <el-select v-model="filters.source" placeholder="来源" clearable style="width: 160px">
        <el-option label="手动录入" value="manual" />
        <el-option label="BOSS直聘" value="boss" />
        <el-option label="拉勾招聘" value="lagou" />
        <el-option label="邮箱投递" value="email" />
      </el-select>
      <el-date-picker
        v-model="filters.dateRange"
        type="daterange"
        value-format="YYYY-MM-DD"
        range-separator="至"
        start-placeholder="开始日期"
        end-placeholder="结束日期"
      />
      <el-select v-model="filters.granularity" placeholder="统计粒度" style="width: 140px">
        <el-option label="按天" value="day" />
        <el-option label="按周" value="week" />
        <el-option label="按月" value="month" />
      </el-select>
      <el-button type="primary" @click="loadAllReports">查询</el-button>
    </div>

    <div class="stats-grid">
      <el-card shadow="never"><el-statistic title="简历总数" :value="overview.resumes" /></el-card>
      <el-card shadow="never"><el-statistic title="待初筛" :value="overview.pendingScreening" /></el-card>
      <el-card shadow="never"><el-statistic title="待复筛" :value="overview.pendingReview" /></el-card>
      <el-card shadow="never"><el-statistic title="待安排面试" :value="overview.pendingScheduling" /></el-card>
      <el-card shadow="never"><el-statistic title="面试记录" :value="overview.interviews" /></el-card>
      <el-card shadow="never"><el-statistic title="人才库" :value="overview.talentPool" /></el-card>
    </div>

    <div class="export-actions">
      <el-button @click="exportReport('resumes')">导出简历 CSV</el-button>
      <el-button @click="exportReport('interviews')">导出面试 CSV</el-button>
      <el-button @click="exportReport('talent_pool')">导出人才库 CSV</el-button>
      <el-button type="primary" plain @click="exportReport('hr_daily')">导出 HR 绩效 CSV</el-button>
      <el-button type="primary" plain @click="exportReport('interviewer_daily')">导出面试官绩效 CSV</el-button>
    </div>

    <div class="report-section">
      <div class="section-header">
        <div>
          <h3>HR 绩效统计</h3>
          <p>按 {{ granularityLabel }} 统计每位 HR 经理从首次初筛通过开始归属的全流程通过/淘汰与 Offer 处理情况。</p>
        </div>
        <el-select v-model="filters.hr_user_id" placeholder="HR经理" clearable style="width: 180px" @change="loadHrDailyReport">
          <el-option v-for="item in hrUsers" :key="item.id" :label="item.name" :value="item.id" />
        </el-select>
      </div>

      <el-table :data="hrDailyRows" class="content-table" width="100%">
        <el-table-column prop="period_label" :label="periodColumnLabel" min-width="120" />
        <el-table-column prop="hr_name" label="HR经理" min-width="140" />
        <el-table-column prop="screened_total" label="筛选总数" min-width="120" />
        <el-table-column prop="screened_passed" label="初筛通过" min-width="120" />
        <el-table-column prop="screened_rejected" label="初筛淘汰" min-width="120" />
        <el-table-column prop="review_passed" label="复筛通过" min-width="120" />
        <el-table-column prop="review_rejected" label="复筛淘汰" min-width="120" />
        <el-table-column prop="interview_passed" label="面试通过" min-width="120" />
        <el-table-column prop="interview_rejected" label="面试淘汰" min-width="120" />
        <el-table-column prop="offer_sent" label="录用发放" min-width="120" />
        <el-table-column prop="offer_accepted" label="录用接受" min-width="120" />
        <el-table-column prop="offer_declined" label="录用拒绝" min-width="120" />
      </el-table>
    </div>

    <div class="report-section">
      <div class="section-header">
        <div>
          <h3>面试官绩效统计</h3>
          <p>按 {{ granularityLabel }} 统计每位面试官的复筛量和面试通过/淘汰情况。</p>
        </div>
        <el-select
          v-model="filters.interviewer_user_id"
          placeholder="面试官"
          clearable
          style="width: 180px"
          @change="loadInterviewerDailyReport"
        >
          <el-option v-for="item in interviewerUsers" :key="item.id" :label="item.name" :value="item.id" />
        </el-select>
      </div>

      <el-table :data="interviewerDailyRows" class="content-table" width="100%">
        <el-table-column prop="period_label" :label="periodColumnLabel" min-width="120" />
        <el-table-column prop="interviewer_name" label="面试官" min-width="140" />
        <el-table-column prop="review_total" label="复筛总数" min-width="120" />
        <el-table-column prop="review_passed" label="复筛通过" min-width="120" />
        <el-table-column prop="review_rejected" label="复筛淘汰" min-width="120" />
        <el-table-column prop="interview_total" label="面试完成" min-width="120" />
        <el-table-column prop="interview_passed" label="面试通过" min-width="120" />
        <el-table-column prop="interview_rejected" label="面试淘汰" min-width="120" />
      </el-table>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ElMessage } from 'element-plus';
import { computed, onMounted, reactive, ref } from 'vue';
import http from '../api/http';

interface Job {
  id: string;
  title: string;
}

interface Overview {
  resumes: number;
  pendingScreening: number;
  pendingReview: number;
  pendingScheduling: number;
  pendingOffer?: number;
  interviews: number;
  talentPool: number;
}

interface UserOption {
  id: string;
  name: string;
}

interface HrDailyRow {
  period_key: string;
  period_label: string;
  stat_date: string;
  hr_user_id: string;
  hr_name: string;
  screened_total: number;
  screened_passed: number;
  screened_rejected: number;
  review_passed: number;
  review_rejected: number;
  interview_passed: number;
  interview_rejected: number;
  offer_sent: number;
  offer_accepted: number;
  offer_declined: number;
}

interface InterviewerDailyRow {
  period_key: string;
  period_label: string;
  stat_date: string;
  interviewer_user_id: string;
  interviewer_name: string;
  review_total: number;
  review_passed: number;
  review_rejected: number;
  interview_total: number;
  interview_passed: number;
  interview_rejected: number;
}

const jobs = ref<Job[]>([]);
const hrUsers = ref<UserOption[]>([]);
const interviewerUsers = ref<UserOption[]>([]);
const hrDailyRows = ref<HrDailyRow[]>([]);
const interviewerDailyRows = ref<InterviewerDailyRow[]>([]);
const overview = reactive<Overview>({
  resumes: 0,
  pendingScreening: 0,
  pendingReview: 0,
  pendingScheduling: 0,
  pendingOffer: 0,
  interviews: 0,
  talentPool: 0
});
const filters = reactive({
  job_id: '',
  hr_user_id: '',
  interviewer_user_id: '',
  status: 'all',
  source: '',
  granularity: 'day',
  dateRange: [] as string[]
});

const granularityLabel = computed(() => {
  if (filters.granularity === 'week') {
    return '周';
  }
  if (filters.granularity === 'month') {
    return '月';
  }
  return '日';
});

const periodColumnLabel = computed(() => {
  if (filters.granularity === 'week') {
    return '周';
  }
  if (filters.granularity === 'month') {
    return '月份';
  }
  return '日期';
});

const buildParams = () => ({
  job_id: filters.job_id || undefined,
  hr_user_id: filters.hr_user_id || undefined,
  interviewer_user_id: filters.interviewer_user_id || undefined,
  status: filters.status,
  source: filters.source || undefined,
  granularity: filters.granularity,
  date_from: filters.dateRange?.[0] || undefined,
  date_to: filters.dateRange?.[1] || undefined
});

const fetchJobs = async () => {
  const { data } = await http.get<Job[]>('/api/jobs');
  jobs.value = data;
};

const loadReport = async () => {
  try {
    const { data } = await http.get<Overview>('/api/reports/overview', {
      params: {
        job_id: filters.job_id || undefined,
        status: filters.status,
        source: filters.source || undefined,
        date_from: filters.dateRange?.[0] || undefined,
        date_to: filters.dateRange?.[1] || undefined
      }
    });
    Object.assign(overview, data);
  } catch (error) {
    ElMessage.error('加载报表失败');
  }
};

const loadHrDailyReport = async () => {
  try {
    const { data } = await http.get<{ hr_users: UserOption[]; rows: HrDailyRow[] }>('/api/reports/hr-daily', {
      params: buildParams()
    });
    hrUsers.value = data.hr_users;
    hrDailyRows.value = data.rows;
  } catch (error) {
    ElMessage.error('加载 HR 日报失败');
  }
};

const loadInterviewerDailyReport = async () => {
  try {
    const { data } = await http.get<{ interviewer_users: UserOption[]; rows: InterviewerDailyRow[] }>(
      '/api/reports/interviewer-daily',
      {
        params: buildParams()
      }
    );
    interviewerUsers.value = data.interviewer_users;
    interviewerDailyRows.value = data.rows;
  } catch (error) {
    ElMessage.error('加载面试官绩效失败');
  }
};

const loadAllReports = async () => {
  await Promise.all([loadReport(), loadHrDailyReport(), loadInterviewerDailyReport()]);
};

const exportFileNameMap = {
  resumes: '简历报表.csv',
  interviews: '面试报表.csv',
  talent_pool: '人才库报表.csv',
  hr_daily: 'HR绩效报表.csv',
  interviewer_daily: '面试官绩效报表.csv'
};

const exportReport = async (
  dataset: 'resumes' | 'interviews' | 'talent_pool' | 'hr_daily' | 'interviewer_daily'
) => {
  try {
    const response = await http.get('/api/reports/export', {
      params: { ...buildParams(), dataset },
      responseType: 'blob'
    });
    const blobUrl = window.URL.createObjectURL(new Blob([response.data], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = exportFileNameMap[dataset];
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(blobUrl);
  } catch (error) {
    ElMessage.error('导出报表失败');
  }
};

onMounted(async () => {
  await Promise.all([fetchJobs(), loadAllReports()]);
});
</script>

<style scoped>
.page {
  padding: 28px;
}

.report-toolbar {
  margin-bottom: 18px;
  flex-wrap: wrap;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 16px;
}

.export-actions {
  display: flex;
  gap: 12px;
  margin-top: 20px;
}

.report-section {
  margin-top: 24px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.section-header h3 {
  margin: 0;
  font-size: 18px;
}

.section-header p {
  margin: 6px 0 0;
  color: var(--text-sub);
}

@media (max-width: 960px) {
  .stats-grid {
    grid-template-columns: 1fr;
  }

  .export-actions {
    flex-direction: column;
  }
}
</style>
