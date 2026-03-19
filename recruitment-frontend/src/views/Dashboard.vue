<template>
  <section class="page-card dashboard">
    <div class="page-header">
      <div>
        <h2 class="page-title">招聘仪表盘</h2>
        <p class="page-subtitle">实时观察招聘漏斗、轮次分布和招聘周期。</p>
      </div>
      <el-button type="primary" plain @click="loadDashboard">刷新数据</el-button>
    </div>

    <div class="stats-grid">
      <el-card shadow="never">
        <el-statistic title="岗位总数" :value="stats.jobs" />
      </el-card>
      <el-card shadow="never">
        <el-statistic title="简历总数" :value="stats.resumes" />
      </el-card>
      <el-card shadow="never">
        <el-statistic title="待初筛" :value="stats.pendingScreening" />
      </el-card>
      <el-card shadow="never">
        <el-statistic title="待复筛" :value="stats.pendingReview" />
      </el-card>
      <el-card shadow="never">
        <el-statistic title="待发 Offer" :value="stats.pendingOffer" />
      </el-card>
      <el-card shadow="never">
        <el-statistic title="人才库人数" :value="stats.talentPool" />
      </el-card>
    </div>

    <div class="dashboard-grid">
      <div class="chart-card">
        <div class="chart-header">
          <h3>招聘漏斗</h3>
          <p>按流程节点观察待处理和转化分布。</p>
        </div>
        <div ref="statusChartRef" class="chart"></div>
      </div>

      <div class="chart-card">
        <div class="chart-header">
          <h3>面试轮次分布</h3>
          <p>按当前面试轮次观察候选人分布。</p>
        </div>
        <div ref="roundChartRef" class="chart"></div>
      </div>

      <div class="chart-card wide">
        <div class="chart-header">
          <h3>平均招聘周期</h3>
          <p>已完结候选人的平均用时，单位为天。</p>
        </div>
        <el-statistic :value="stats.averageCycleDays" suffix="天" />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import * as echarts from 'echarts';
import { ElMessage } from 'element-plus';
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import http from '../api/http';

interface Job {
  id: string;
}

interface Resume {
  id: string;
  status: string;
  current_round: number;
  received_at: string;
  source_received_at?: string | null;
  screened_at?: string | null;
  reviewed_at?: string | null;
  interviewed_at?: string | null;
}

interface ResumeListResponse {
  rows: Resume[];
}

interface TalentPoolEntry {
  id: string;
}

const statusChartRef = ref<HTMLDivElement | null>(null);
const roundChartRef = ref<HTMLDivElement | null>(null);
const stats = ref({
  jobs: 0,
  resumes: 0,
  pendingScreening: 0,
  pendingReview: 0,
  pendingOffer: 0,
  talentPool: 0,
  averageCycleDays: 0
});

let statusChart: echarts.ECharts | null = null;
let roundChart: echarts.ECharts | null = null;
const funnelStages = [
  { key: 'new', label: '待初筛' },
  { key: 'review_pending', label: '待复筛' },
  { key: 'schedule_pending', label: '待安排面试' },
  { key: 'interviewing', label: '面试中' },
  { key: 'offer_pending', label: '待发录用' },
  { key: 'offer_sent', label: '已发录用' },
  { key: 'hired', label: '已录用' },
  { key: 'rejected', label: '已淘汰' }
];

const renderStatusChart = (resumes: Resume[]) => {
  const buckets = resumes.reduce<Record<string, number>>((acc, resume) => {
    acc[resume.status] = (acc[resume.status] || 0) + 1;
    return acc;
  }, {});

  if (statusChartRef.value && !statusChart) {
    statusChart = echarts.init(statusChartRef.value);
  }

  statusChart?.setOption({
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c}'
    },
    color: ['#0f766e', '#d97706', '#2563eb', '#7c3aed', '#0ea5e9', '#14b8a6', '#16a34a', '#dc2626'],
    series: [
      {
        type: 'funnel',
        left: '8%',
        top: 20,
        bottom: 20,
        width: '84%',
        min: 0,
        sort: 'none',
        gap: 6,
        label: {
          show: true,
          position: 'inside',
          formatter: '{b}: {c}'
        },
        data: funnelStages.map((stage) => ({
          name: stage.label,
          value: buckets[stage.key] || 0
        }))
      }
    ]
  });
};

const renderRoundChart = (resumes: Resume[]) => {
  const buckets = resumes.reduce<Record<string, number>>((acc, resume) => {
    const round = resume.current_round > 0 ? `第${resume.current_round}轮` : '未进入面试';
    acc[round] = (acc[round] || 0) + 1;
    return acc;
  }, {});

  if (roundChartRef.value && !roundChart) {
    roundChart = echarts.init(roundChartRef.value);
  }

  roundChart?.setOption({
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: Object.keys(buckets)
    },
    yAxis: {
      type: 'value'
    },
    series: [
      {
        type: 'bar',
        data: Object.values(buckets),
        itemStyle: { color: '#0f766e' },
        borderRadius: [10, 10, 0, 0]
      }
    ]
  });
};

const calculateAverageCycleDays = (resumes: Resume[]) => {
  const completed = resumes.filter((item) => ['hired', 'rejected'].includes(item.status));

  if (!completed.length) {
    return 0;
  }

  const totalDays = completed.reduce((acc, item) => {
    const start = new Date(item.source_received_at || item.received_at).getTime();
    const end = new Date(item.interviewed_at || item.reviewed_at || item.screened_at || item.source_received_at || item.received_at).getTime();
    return acc + (end - start) / (1000 * 60 * 60 * 24);
  }, 0);

  return Number((totalDays / completed.length).toFixed(1));
};

const loadDashboard = async () => {
  try {
    const [jobsRes, resumesRes, talentRes] = await Promise.all([
      http.get<Job[]>('/api/jobs'),
      http.get<ResumeListResponse>('/api/resumes', { params: { page: 1, pageSize: 500 } }),
      http.get<TalentPoolEntry[]>('/api/talent-pool')
    ]);

    const resumes = resumesRes.data.rows;

    stats.value = {
      jobs: jobsRes.data.length,
      resumes: resumes.length,
      pendingScreening: resumes.filter((item) => item.status === 'new').length,
      pendingReview: resumes.filter((item) => item.status === 'review_pending').length,
      pendingOffer: resumes.filter((item) => ['offer_pending', 'offer_sent'].includes(item.status)).length,
      talentPool: talentRes.data.length,
      averageCycleDays: calculateAverageCycleDays(resumes)
    };

    await nextTick();
    renderStatusChart(resumes);
    renderRoundChart(resumes);
  } catch (error) {
    ElMessage.error('加载仪表盘数据失败');
  }
};

const handleResize = () => {
  statusChart?.resize();
  roundChart?.resize();
};

onMounted(async () => {
  await loadDashboard();
  window.addEventListener('resize', handleResize);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize);
  statusChart?.dispose();
  roundChart?.dispose();
});
</script>

<style scoped>
.dashboard {
  padding: 28px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 16px;
}

.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
  margin-top: 22px;
}

.chart-card {
  padding: 24px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid var(--line-soft);
}

.chart-card.wide {
  grid-column: span 2;
}

.chart-header h3 {
  margin: 0;
  font-size: 22px;
}

.chart-header p {
  margin: 8px 0 0;
  color: var(--text-sub);
}

.chart {
  height: 320px;
}

@media (max-width: 960px) {
  .stats-grid,
  .dashboard-grid {
    grid-template-columns: 1fr;
  }

  .chart-card.wide {
    grid-column: span 1;
  }
}
</style>
