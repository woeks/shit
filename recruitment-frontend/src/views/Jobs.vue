<template>
  <section class="page-card page">
    <div class="page-header">
      <div>
        <h2 class="page-title">岗位管理</h2>
        <p class="page-subtitle">配置岗位基础信息及多轮面试模板，驱动后续招聘流程。</p>
      </div>
      <div class="toolbar">
        <el-button type="primary" @click="openCreate">新增岗位</el-button>
        <el-button @click="fetchJobs">刷新</el-button>
      </div>
    </div>

    <div class="toolbar search-bar">
      <el-input v-model="filters.keyword" placeholder="搜索岗位名称、部门、描述" style="width: 260px" @keyup.enter="fetchJobs" />
      <el-select v-model="filters.status" clearable placeholder="岗位状态" style="width: 180px" @change="fetchJobs">
        <el-option label="草稿" value="draft" />
        <el-option label="已发布" value="published" />
        <el-option label="已关闭" value="closed" />
      </el-select>
      <el-button type="primary" @click="fetchJobs">查询</el-button>
      <el-button @click="resetFilters">重置</el-button>
    </div>

    <el-table :data="jobs" class="content-table" width="100%">
      <el-table-column prop="title" label="岗位名称" min-width="180" />
      <el-table-column prop="department" label="部门" min-width="140" />
      <el-table-column prop="interview_rounds" label="轮次数" min-width="100" />
      <el-table-column label="轮次配置" min-width="260">
        <template #default="{ row }">
          {{ row.round_names?.join(' / ') || '-' }}
        </template>
      </el-table-column>
      <el-table-column label="岗位别名" min-width="220" show-overflow-tooltip>
        <template #default="{ row }">
          {{ row.aliases?.join('，') || '-' }}
        </template>
      </el-table-column>
      <el-table-column label="状态" min-width="120">
        <template #default="{ row }">
          <span class="status-pill">{{ toLabel(row.status, statusLabelMap) }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="created_at" label="创建时间" min-width="180" :formatter="formatDateCell" />
      <el-table-column label="操作" min-width="160" fixed="right">
        <template #default="{ row }">
          <el-button type="primary" link @click="openEdit(row)">编辑</el-button>
          <el-button type="danger" link @click="confirmDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" :width="dialogFullscreen ? '100%' : '640px'" :fullscreen="dialogFullscreen" class="smart-dialog">
      <template #header>
        <DialogHeaderBar :title="editingJob ? '编辑岗位' : '新增岗位'" :fullscreen="dialogFullscreen" @toggle="toggleDialogFullscreen" />
      </template>
      <el-form :model="form" label-width="96px">
        <el-form-item label="岗位标题">
          <el-input v-model="form.title" placeholder="例如：后端开发工程师" />
        </el-form-item>
        <el-form-item label="所属部门">
          <el-input v-model="form.department" placeholder="例如：技术中心" />
        </el-form-item>
        <el-form-item label="岗位描述">
          <el-input v-model="form.description" type="textarea" :rows="4" />
        </el-form-item>
        <el-form-item label="岗位状态">
          <el-select v-model="form.status" style="width: 100%">
            <el-option label="草稿" value="draft" />
            <el-option label="已发布" value="published" />
            <el-option label="已关闭" value="closed" />
          </el-select>
        </el-form-item>
        <el-form-item label="岗位别名">
          <el-input v-model="form.aliases_text" placeholder="多个别名用逗号分隔，例如：前端,Web,Vue" />
        </el-form-item>
        <el-form-item label="面试轮次">
          <el-input-number v-model="form.interview_rounds" :min="1" :max="6" @change="syncRoundNames" />
        </el-form-item>
        <el-form-item label="轮次名称">
          <div class="round-list">
            <div v-for="(roundName, index) in form.round_names" :key="index" class="round-item">
              <span class="round-index">第 {{ index + 1 }} 轮</span>
              <el-input v-model="form.round_names[index]" placeholder="例如：技术一面" />
            </div>
          </div>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitJob">{{ editingJob ? '保存' : '提交' }}</el-button>
      </template>
    </el-dialog>

  </section>
</template>

<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus';
import { onMounted, reactive, ref } from 'vue';
import http from '../api/http';
import { statusLabelMap, toLabel } from '../utils/labels';
import { formatDateCell } from '../utils/time';
import DialogHeaderBar from '../components/DialogHeaderBar.vue';
import { useDialogFullscreen } from '../composables/useDialogFullscreen';

interface Job {
  id: string;
  title: string;
  department: string;
  description: string;
  status: string;
  interview_rounds: number;
  round_names: string[];
  aliases?: string[];
  created_at: string;
}

const defaultRoundNames = ['技术一面', '技术二面', 'HR终面', '业务终面', '总监面', '总裁面'];
const jobs = ref<Job[]>([]);
const { fullscreen: dialogFullscreen, toggleFullscreen: toggleDialogFullscreen } = useDialogFullscreen();
const dialogVisible = ref(false);
const submitting = ref(false);
const editingJob = ref<Job | null>(null);
const filters = reactive({
  keyword: '',
  status: ''
});
const form = reactive({
  title: '',
  description: '',
  department: '',
  status: 'draft',
  aliases_text: '',
  interview_rounds: 3,
  round_names: ['技术一面', '技术二面', 'HR终面']
});

const syncRoundNames = () => {
  const roundCount = form.interview_rounds;
  form.round_names = Array.from({ length: roundCount }, (_, index) => {
    return form.round_names[index] || defaultRoundNames[index] || `第${index + 1}轮面试`;
  });
};

const resetForm = () => {
  form.title = '';
  form.description = '';
  form.department = '';
  form.status = 'draft';
  form.aliases_text = '';
  form.interview_rounds = 3;
  form.round_names = ['技术一面', '技术二面', 'HR终面'];
};

const openCreate = () => {
  editingJob.value = null;
  resetForm();
  dialogVisible.value = true;
};

const openEdit = (job: Job) => {
  editingJob.value = job;
  form.title = job.title;
  form.description = job.description || '';
  form.department = job.department || '';
  form.status = job.status || 'draft';
  form.aliases_text = Array.isArray(job.aliases) ? job.aliases.join('，') : '';
  form.interview_rounds = job.interview_rounds || 3;
  form.round_names = Array.isArray(job.round_names) ? [...job.round_names] : ['技术一面', '技术二面', 'HR终面'];
  dialogVisible.value = true;
};

const fetchJobs = async () => {
  try {
    const { data } = await http.get<Job[]>('/api/jobs', {
      params: {
        keyword: filters.keyword || undefined,
        status: filters.status || undefined
      }
    });
    jobs.value = data;
  } catch (error) {
    ElMessage.error('获取岗位列表失败');
  }
};

const resetFilters = async () => {
  filters.keyword = '';
  filters.status = '';
  await fetchJobs();
};


const submitJob = async () => {
  if (!form.title || !form.department) {
    ElMessage.warning('请填写岗位标题和部门');
    return;
  }

  if (form.round_names.some((item) => !item.trim())) {
    ElMessage.warning('请填写完整轮次名称');
    return;
  }

  submitting.value = true;
  try {
    const payload = {
      ...form,
      aliases: form.aliases_text
        ? form.aliases_text.split(/[,，;；/|、]/g).map((item) => item.trim()).filter(Boolean)
        : [],
      round_names: form.round_names.map((item) => item.trim())
    };

    if (editingJob.value) {
      await http.put(`/api/jobs/${editingJob.value.id}`, payload);
      ElMessage.success('岗位更新成功');
    } else {
      await http.post('/api/jobs', payload);
      ElMessage.success('岗位创建成功');
    }
    dialogVisible.value = false;
    editingJob.value = null;
    resetForm();
    await fetchJobs();
  } catch (error) {
    ElMessage.error(editingJob.value ? '岗位更新失败' : '岗位创建失败');
  } finally {
    submitting.value = false;
  }
};

const confirmDelete = async (job: Job) => {
  try {
    await ElMessageBox.confirm(`确认删除岗位“${job.title}”吗？`, '删除岗位', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消'
    });
  } catch {
    return;
  }

  try {
    await http.delete(`/api/jobs/${job.id}`);
    ElMessage.success('岗位已删除');
    await fetchJobs();
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '删除岗位失败');
  }
};

onMounted(async () => {
  await fetchJobs();
});
</script>

<style scoped>
.page {
  padding: 28px;
}

.round-list {
  display: grid;
  width: 100%;
  gap: 12px;
}

.round-item {
  display: grid;
  grid-template-columns: 88px 1fr;
  gap: 10px;
  align-items: center;
}

.round-index {
  color: var(--text-sub);
  font-size: 13px;
}

.search-bar {
  margin-bottom: 16px;
}
</style>
