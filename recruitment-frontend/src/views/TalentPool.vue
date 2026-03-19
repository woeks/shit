<template>
  <section class="page-card page">
    <div class="page-header">
      <div>
        <h2 class="page-title">人才库</h2>
        <p class="page-subtitle">集中管理淘汰候选人，支持按淘汰阶段筛选复盘。</p>
      </div>
      <div class="toolbar">
        <el-input
          v-model="filters.keyword"
          placeholder="搜索姓名 / 手机 / 学校 / 公司 / 岗位"
          style="width: 280px"
          @keyup.enter="fetchTalentPool"
        />
        <el-select v-model="filters.job_id" clearable placeholder="岗位" style="width: 200px" @change="fetchTalentPool">
          <el-option v-for="job in jobs" :key="job.id" :label="job.title" :value="job.id" />
        </el-select>
        <el-select v-model="filters.rejection_stage" style="width: 220px" @change="fetchTalentPool">
          <el-option label="全部阶段" value="all" />
          <el-option label="初筛淘汰" value="rejected_screening" />
          <el-option label="复筛淘汰" value="rejected_review" />
          <el-option label="面试淘汰" value="rejected_interview" />
          <el-option label="录用拒绝" value="rejected_offer" />
        </el-select>
        <el-button @click="fetchTalentPool">刷新</el-button>
      </div>
    </div>

    <el-table :data="talentPool" class="content-table" width="100%">
      <el-table-column label="姓名" min-width="120">
        <template #default="{ row }">
          {{ row.Resume?.name || '-' }}
        </template>
      </el-table-column>
      <el-table-column label="性别" min-width="90">
        <template #default="{ row }">
          {{ row.Resume?.gender || '-' }}
        </template>
      </el-table-column>
      <el-table-column label="年龄" min-width="90">
        <template #default="{ row }">
          {{ row.Resume?.age ?? '-' }}
        </template>
      </el-table-column>
      <el-table-column label="学历" min-width="110">
        <template #default="{ row }">
          {{ row.Resume?.education || '-' }}
        </template>
      </el-table-column>
      <el-table-column label="工作年限" min-width="110">
        <template #default="{ row }">
          {{ row.Resume?.work_years ? `${row.Resume.work_years}年` : '-' }}
        </template>
      </el-table-column>
      <el-table-column label="学校及专业" min-width="220">
        <template #default="{ row }">
          {{ row.Resume?.school_major || '-' }}
        </template>
      </el-table-column>
      <el-table-column label="所在公司" min-width="180">
        <template #default="{ row }">
          {{ row.Resume?.current_company || row.Resume?.ResumeExperiences?.[0]?.company_name || '-' }}
        </template>
      </el-table-column>
      <el-table-column label="所在岗位" min-width="180">
        <template #default="{ row }">
          {{ row.Resume?.current_position || row.Resume?.ResumeExperiences?.[0]?.position_name || '-' }}
        </template>
      </el-table-column>
      <el-table-column label="手机号" min-width="140">
        <template #default="{ row }">
          {{ row.Resume?.phone || '-' }}
        </template>
      </el-table-column>
      <el-table-column label="岗位" min-width="180">
        <template #default="{ row }">
          {{ row.Resume?.Job?.title || '-' }}
        </template>
      </el-table-column>
      <el-table-column label="淘汰阶段" min-width="160">
        <template #default="{ row }">
          {{ toLabel(row.rejection_stage, rejectionStageLabelMap) }}
        </template>
      </el-table-column>
      <el-table-column prop="rejection_reason" label="淘汰原因" min-width="260" />
      <el-table-column prop="created_at" label="进入人才库时间" min-width="180" :formatter="formatDateCell" />
      <el-table-column label="操作" min-width="120" fixed="right">
        <template #default="{ row }">
          <el-button type="primary" link @click="openEdit(row)">编辑</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="editVisible" :width="dialogFullscreen ? '100%' : '560px'" :fullscreen="dialogFullscreen" class="smart-dialog">
      <template #header>
        <DialogHeaderBar title="编辑候选人" :fullscreen="dialogFullscreen" @toggle="toggleDialogFullscreen" />
      </template>
      <el-form :model="editForm" label-width="96px">
        <el-form-item label="姓名"><el-input v-model="editForm.name" /></el-form-item>
        <el-form-item label="性别">
          <el-select v-model="editForm.gender" clearable style="width: 100%">
            <el-option label="男" value="男" />
            <el-option label="女" value="女" />
          </el-select>
        </el-form-item>
        <el-form-item label="年龄"><el-input-number v-model="editForm.age" :min="16" :max="80" style="width: 100%" /></el-form-item>
        <el-form-item label="学历"><el-input v-model="editForm.education" /></el-form-item>
        <el-form-item label="工作年限"><el-input-number v-model="editForm.work_years" :min="0" :max="50" style="width: 100%" /></el-form-item>
        <el-form-item label="学校及专业"><el-input v-model="editForm.school_major" /></el-form-item>
        <el-form-item label="所在公司"><el-input v-model="editForm.current_company" /></el-form-item>
        <el-form-item label="所在岗位"><el-input v-model="editForm.current_position" /></el-form-item>
        <el-form-item label="手机号"><el-input v-model="editForm.phone" /></el-form-item>
        <el-form-item label="邮箱"><el-input v-model="editForm.email" /></el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveEdit">保存</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import http from '../api/http';
import { formatDateCell } from '../utils/time';
import { rejectionStageLabelMap, toLabel } from '../utils/labels';
import DialogHeaderBar from '../components/DialogHeaderBar.vue';
import { useDialogFullscreen } from '../composables/useDialogFullscreen';

interface Job {
  id: string;
  title: string;
}

interface Resume {
  id: string;
  name: string;
  gender?: string | null;
  age?: number | null;
  education?: string | null;
  work_years?: number | null;
  school_major?: string | null;
  current_company?: string | null;
  current_position?: string | null;
  phone?: string | null;
  email?: string | null;
  ResumeExperiences?: Array<{
    id: string;
    company_name: string;
    position_name: string;
  }>;
  Job?: Job;
}

interface TalentPoolEntry {
  id: string;
  rejection_stage: string;
  rejection_reason: string;
  created_at: string;
  Resume?: Resume;
}

const filters = reactive({
  rejection_stage: 'all',
  keyword: '',
  job_id: ''
});
const talentPool = ref<TalentPoolEntry[]>([]);
const jobs = ref<Job[]>([]);
const { fullscreen: dialogFullscreen, toggleFullscreen: toggleDialogFullscreen } = useDialogFullscreen();
const editVisible = ref(false);
const saving = ref(false);
const activeResumeId = ref('');
const editForm = reactive({
  name: '',
  gender: '',
  age: null as number | null,
  education: '',
  work_years: null as number | null,
  school_major: '',
  current_company: '',
  current_position: '',
  phone: '',
  email: ''
});

const openEdit = (entry: TalentPoolEntry) => {
  const resume = entry.Resume;

  if (!resume) {
    return;
  }

  activeResumeId.value = resume.id;
  editForm.name = resume.name || '';
  editForm.gender = resume.gender || '';
  editForm.age = resume.age ?? null;
  editForm.education = resume.education || '';
  editForm.work_years = resume.work_years ?? null;
  editForm.school_major = resume.school_major || '';
  editForm.current_company = resume.current_company || resume.ResumeExperiences?.[0]?.company_name || '';
  editForm.current_position = resume.current_position || resume.ResumeExperiences?.[0]?.position_name || '';
  editForm.phone = resume.phone || '';
  editForm.email = resume.email || '';
  editVisible.value = true;
};

const saveEdit = async () => {
  if (!activeResumeId.value) {
    return;
  }

  saving.value = true;

  try {
    await http.put(`/api/resumes/${activeResumeId.value}`, editForm);
    ElMessage.success('候选人信息已更新');
    editVisible.value = false;
    await fetchTalentPool();
  } catch (error) {
    ElMessage.error('更新候选人信息失败');
  } finally {
    saving.value = false;
  }
};

const fetchJobs = async () => {
  const { data } = await http.get<Job[]>('/api/jobs');
  jobs.value = data;
};

const fetchTalentPool = async () => {
  try {
    const { data } = await http.get<TalentPoolEntry[]>('/api/talent-pool', {
      params: {
        rejection_stage: filters.rejection_stage,
        keyword: filters.keyword || undefined,
        job_id: filters.job_id || undefined
      }
    });
    talentPool.value = data;
  } catch (error) {
    ElMessage.error('获取人才库失败');
  }
};

onMounted(async () => {
  await Promise.all([fetchJobs(), fetchTalentPool()]);
});
</script>

<style scoped>
.page {
  padding: 28px;
}
</style>
