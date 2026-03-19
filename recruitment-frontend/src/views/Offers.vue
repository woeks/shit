<template>
  <section class="page-card page">
    <div class="page-header">
      <div>
        <h2 class="page-title">录用管理</h2>
        <p class="page-subtitle">统一处理终面通过候选人的录用发放、接受和拒绝。</p>
      </div>
      <div class="toolbar">
        <el-input v-model="filters.keyword" placeholder="搜索候选人" style="width: 220px" @keyup.enter="fetchOffers" />
        <el-select v-model="filters.job_id" clearable placeholder="岗位" style="width: 200px" @change="fetchOffers">
          <el-option v-for="job in jobs" :key="job.id" :label="job.title" :value="job.id" />
        </el-select>
        <el-select v-model="filters.status" style="width: 180px" @change="fetchOffers">
          <el-option label="全部状态" value="all" />
          <el-option label="待发放" value="offer_pending" />
          <el-option label="已发送" value="offer_sent" />
          <el-option label="已接受" value="offer_accepted" />
          <el-option label="已拒绝" value="offer_declined" />
        </el-select>
        <el-button @click="fetchOffers">刷新</el-button>
      </div>
    </div>

    <el-table :data="offers" class="content-table" width="100%">
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
      <el-table-column prop="salary" label="薪资" min-width="120" />
      <el-table-column prop="level" label="职级" min-width="120" />
      <el-table-column prop="join_date" label="入职日期" min-width="180" />
      <el-table-column label="状态" min-width="140">
        <template #default="{ row }">
          {{ toLabel(row.status, statusLabelMap) }}
        </template>
      </el-table-column>
      <el-table-column label="操作" min-width="220" fixed="right">
        <template #default="{ row }">
          <div class="actions">
            <el-button type="primary" link @click="openEditor(row)">发放/更新</el-button>
            <el-button type="success" link :disabled="row.status !== 'offer_sent'" @click="submitDecision(row, 'accept')">
              接受
            </el-button>
            <el-button type="danger" link :disabled="row.status !== 'offer_sent'" @click="submitDecision(row, 'decline')">
              拒绝
            </el-button>
          </div>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" :width="dialogFullscreen ? '100%' : '560px'" :fullscreen="dialogFullscreen" class="smart-dialog">
      <template #header>
        <DialogHeaderBar title="发放录用" :fullscreen="dialogFullscreen" @toggle="toggleDialogFullscreen" />
      </template>
      <el-form :model="form" label-width="96px">
        <el-form-item label="候选人">
          <el-input :model-value="activeOffer?.Resume?.name || activeResume?.name || ''" disabled />
        </el-form-item>
        <el-form-item label="薪资">
          <el-input v-model="form.salary" placeholder="例如 25k*15" />
        </el-form-item>
        <el-form-item label="职级">
          <el-input v-model="form.level" placeholder="例如 P6 / 高级工程师" />
        </el-form-item>
        <el-form-item label="入职日期">
          <el-date-picker v-model="form.join_date" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.notes" type="textarea" :rows="4" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitOffer">保存并发放</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus';
import { onMounted, reactive, ref } from 'vue';
import http from '../api/http';
import { statusLabelMap, toLabel } from '../utils/labels';
import DialogHeaderBar from '../components/DialogHeaderBar.vue';
import { useDialogFullscreen } from '../composables/useDialogFullscreen';

interface Job {
  id: string;
  title: string;
}

interface Resume {
  id: string;
  name: string;
  status: string;
  Job?: Job;
}

interface OfferItem {
  id: string;
  salary?: string;
  level?: string;
  join_date?: string;
  status: string;
  notes?: string;
  Resume?: Resume;
}

const offers = ref<OfferItem[]>([]);
const jobs = ref<Job[]>([]);
const { fullscreen: dialogFullscreen, toggleFullscreen: toggleDialogFullscreen } = useDialogFullscreen();
const dialogVisible = ref(false);
const submitting = ref(false);
const activeOffer = ref<OfferItem | null>(null);
const activeResume = ref<Resume | null>(null);
const filters = reactive({
  status: 'all',
  keyword: '',
  job_id: ''
});
const form = reactive({
  salary: '',
  level: '',
  join_date: '',
  notes: ''
});

const resetForm = () => {
  form.salary = '';
  form.level = '';
  form.join_date = '';
  form.notes = '';
};

const fetchJobs = async () => {
  const { data } = await http.get<Job[]>('/api/jobs');
  jobs.value = data;
};

const fetchOffers = async () => {
  try {
    const [offersRes, resumesRes] = await Promise.all([
      http.get<OfferItem[]>('/api/offers', {
        params: {
          status: filters.status,
          keyword: filters.keyword || undefined,
          job_id: filters.job_id || undefined
        }
      }),
      http.get<{ rows: Resume[] }>('/api/resumes', {
        params: {
          page: 1,
          pageSize: 200,
          status: 'offer_pending',
          keyword: filters.keyword || undefined,
          job_id: filters.job_id || undefined
        }
      })
    ]);

    const pendingWithoutOffer = resumesRes.data.rows
      .filter((resume) => !offersRes.data.some((offer) => offer.Resume?.id === resume.id))
      .map((resume) => ({
        id: `pending-${resume.id}`,
        status: 'offer_pending',
        Resume: resume
      }));

    offers.value = filters.status === 'all' || filters.status === 'offer_pending'
      ? [...pendingWithoutOffer, ...offersRes.data]
      : offersRes.data;
  } catch (error) {
    ElMessage.error('获取录用列表失败');
  }
};

const openEditor = (item: OfferItem) => {
  activeOffer.value = item.id.startsWith('pending-') ? null : item;
  activeResume.value = item.Resume || null;
  resetForm();
  form.salary = item.salary || '';
  form.level = item.level || '';
  form.join_date = item.join_date ? item.join_date.slice(0, 10) : '';
  form.notes = item.notes || '';
  dialogVisible.value = true;
};

const submitOffer = async () => {
  const resumeId = activeOffer.value?.Resume?.id || activeResume.value?.id;

  if (!resumeId) {
    ElMessage.warning('缺少候选人信息');
    return;
  }

  submitting.value = true;

  try {
    await http.post('/api/offers', {
      resume_id: resumeId,
      salary: form.salary,
      level: form.level,
      join_date: form.join_date,
      notes: form.notes
    });
    dialogVisible.value = false;
    await fetchOffers();
    ElMessage.success('录用已发放');
  } catch (error) {
    ElMessage.error('保存录用失败');
  } finally {
    submitting.value = false;
  }
};

const submitDecision = async (item: OfferItem, action: 'accept' | 'decline') => {
  let reason = '';

  if (action === 'decline') {
    try {
      reason = await ElMessageBox.prompt('请输入拒绝原因', '录用拒绝', {
        inputPlaceholder: '例如 薪资不匹配 / 入职时间冲突'
      }).then((result) => result.value);
    } catch {
      return;
    }
  }

  try {
    await http.post(`/api/offers/${item.id}/decision`, { action, reason });
    ElMessage.success(action === 'accept' ? '候选人已接受录用' : '候选人已拒绝录用');
    await fetchOffers();
  } catch (error) {
    ElMessage.error('处理录用结果失败');
  }
};

onMounted(async () => {
  await Promise.all([fetchJobs(), fetchOffers()]);
});
</script>

<style scoped>
.page {
  padding: 28px;
}

.actions {
  display: flex;
  gap: 10px;
}
</style>
