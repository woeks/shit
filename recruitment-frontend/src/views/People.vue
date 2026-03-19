<template>
  <section class="page-card page">
    <div class="page-header">
      <div>
        <h2 class="page-title">人员权限</h2>
        <p class="page-subtitle">管理 HR、面试官账号，以及岗位级的复筛/面试数据范围。</p>
      </div>
      <div class="toolbar">
        <el-button @click="fetchUsers">刷新</el-button>
        <el-button type="primary" @click="openCreate">新增人员</el-button>
      </div>
    </div>

    <div class="toolbar search-bar">
      <el-input v-model="filters.keyword" placeholder="搜索账号、姓名、邮箱" style="width: 260px" @keyup.enter="fetchUsers" />
      <el-select v-model="filters.role_id" clearable placeholder="角色" style="width: 180px" @change="fetchUsers">
        <el-option v-for="item in roles" :key="item.id" :label="item.name" :value="item.id" />
      </el-select>
      <el-select v-model="filters.status" clearable placeholder="状态" style="width: 160px" @change="fetchUsers">
        <el-option label="启用" value="active" />
        <el-option label="停用" value="inactive" />
      </el-select>
      <el-button type="primary" @click="fetchUsers">查询</el-button>
      <el-button @click="resetFilters">重置</el-button>
    </div>

    <el-table :data="users" class="content-table" width="100%">
      <el-table-column prop="username" label="账号" min-width="140" />
      <el-table-column prop="name" label="姓名" min-width="120" />
      <el-table-column label="角色" min-width="140">
        <template #default="{ row }">
          {{ row.Role?.name || '-' }}
        </template>
      </el-table-column>
      <el-table-column prop="email" label="邮箱" min-width="220" />
      <el-table-column label="状态" min-width="120">
        <template #default="{ row }">
          {{ toLabel(row.status, statusLabelMap) }}
        </template>
      </el-table-column>
      <el-table-column label="岗位分配" min-width="320">
        <template #default="{ row }">
          {{ assignmentSummary(row.JobAssignments || []) }}
        </template>
      </el-table-column>
      <el-table-column label="操作" min-width="120" fixed="right">
        <template #default="{ row }">
          <el-button type="primary" link @click="openEdit(row)">编辑</el-button>
          <el-button type="danger" link @click="confirmDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" :width="dialogFullscreen ? '100%' : '640px'" :fullscreen="dialogFullscreen" class="smart-dialog">
      <template #header>
        <DialogHeaderBar :title="editingUser ? '编辑人员' : '新增人员'" :fullscreen="dialogFullscreen" @toggle="toggleDialogFullscreen" />
      </template>
      <el-form :model="form" label-width="108px">
        <el-form-item label="账号">
          <el-input v-model="form.username" />
        </el-form-item>
        <el-form-item label="姓名">
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item label="邮箱">
          <el-input v-model="form.email" />
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="form.role_id" style="width: 100%">
            <el-option v-for="item in roles" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item :label="editingUser ? '重置密码' : '登录密码'">
          <el-input
            v-model="form.password"
            type="password"
            show-password
            :placeholder="editingUser ? '留空则不修改密码' : '请输入初始密码'"
          />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="form.status" style="width: 100%">
            <el-option label="启用" value="active" />
            <el-option label="停用" value="inactive" />
          </el-select>
        </el-form-item>
        <el-form-item label="模块权限">
          <el-select v-model="form.module_permissions" multiple style="width: 100%" placeholder="选择可访问模块">
            <el-option v-for="item in moduleOptions" :key="item.code" :label="item.label" :value="item.code" />
          </el-select>
        </el-form-item>
        <el-form-item label="复筛岗位">
          <el-select v-model="form.reviewer_job_ids" multiple style="width: 100%">
            <el-option v-for="job in jobs" :key="job.id" :label="job.title" :value="job.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="面试岗位">
          <el-select v-model="form.interviewer_job_ids" multiple style="width: 100%">
            <el-option v-for="job in jobs" :key="job.id" :label="job.title" :value="job.id" />
          </el-select>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitUser">保存</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus';
import { onMounted, reactive, ref } from 'vue';
import http from '../api/http';
import { assignmentTypeLabelMap, statusLabelMap, toLabel } from '../utils/labels';
import { MODULE_OPTIONS } from '../utils/modules';
import { getStoredUser, getToken, setAuthSession } from '../utils/auth';
import DialogHeaderBar from '../components/DialogHeaderBar.vue';
import { useDialogFullscreen } from '../composables/useDialogFullscreen';

interface Role {
  id: string;
  name: string;
  code: string;
}

interface Job {
  id: string;
  title: string;
}

interface Assignment {
  id: string;
  assignment_type: string;
  Job?: Job;
}

interface UserItem {
  id: string;
  username: string;
  name: string;
  email?: string;
  status: string;
  Role?: Role;
  JobAssignments?: Assignment[];
  module_permissions?: string[];
}

const users = ref<UserItem[]>([]);
const roles = ref<Role[]>([]);
const jobs = ref<Job[]>([]);
const { fullscreen: dialogFullscreen, toggleFullscreen: toggleDialogFullscreen } = useDialogFullscreen();
const dialogVisible = ref(false);
const submitting = ref(false);
const editingUser = ref<UserItem | null>(null);
const filters = reactive({
  keyword: '',
  role_id: '',
  status: ''
});
const form = reactive({
  username: '',
  name: '',
  email: '',
  role_id: '',
  password: '',
  status: 'active',
  module_permissions: [] as string[],
  reviewer_job_ids: [] as string[],
  interviewer_job_ids: [] as string[]
});
const moduleOptions = MODULE_OPTIONS;

const assignmentSummary = (items: Assignment[]) =>
  items.length
    ? items.map((item) => `${item.Job?.title || '-'}（${toLabel(item.assignment_type, assignmentTypeLabelMap)}）`).join('，')
    : '-';

const fetchUsers = async () => {
  try {
    const { data } = await http.get<UserItem[]>('/api/users', {
      params: {
        keyword: filters.keyword || undefined,
        role_id: filters.role_id || undefined,
        status: filters.status || undefined
      }
    });
    users.value = data;
  } catch (error) {
    ElMessage.error('获取人员列表失败');
  }
};

const resetFilters = async () => {
  filters.keyword = '';
  filters.role_id = '';
  filters.status = '';
  await fetchUsers();
};

const fetchMeta = async () => {
  const [rolesRes, jobsRes] = await Promise.all([http.get<Role[]>('/api/users/roles'), http.get<Job[]>('/api/jobs')]);
  roles.value = rolesRes.data;
  jobs.value = jobsRes.data;
};

const resetForm = () => {
  form.username = '';
  form.name = '';
  form.email = '';
  form.role_id = '';
  form.password = '';
  form.status = 'active';
  form.module_permissions = [];
  form.reviewer_job_ids = [];
  form.interviewer_job_ids = [];
};

const toAssignments = () => {
  const map = new Map<string, 'reviewer' | 'interviewer' | 'both'>();

  form.reviewer_job_ids.forEach((jobId) => map.set(jobId, 'reviewer'));
  form.interviewer_job_ids.forEach((jobId) => {
    map.set(jobId, map.get(jobId) === 'reviewer' ? 'both' : 'interviewer');
  });

  return Array.from(map.entries()).map(([job_id, assignment_type]) => ({ job_id, assignment_type }));
};

const openCreate = () => {
  editingUser.value = null;
  resetForm();
  dialogVisible.value = true;
};

const openEdit = (user: UserItem) => {
  editingUser.value = user;
  form.username = user.username;
  form.name = user.name;
  form.email = user.email || '';
  form.role_id = user.Role?.id || '';
  form.password = '';
  form.status = user.status;
  form.module_permissions = Array.isArray(user.module_permissions) ? user.module_permissions : [];
  form.reviewer_job_ids = (user.JobAssignments || [])
    .filter((item) => ['reviewer', 'both'].includes(item.assignment_type))
    .map((item) => item.Job?.id || '')
    .filter(Boolean);
  form.interviewer_job_ids = (user.JobAssignments || [])
    .filter((item) => ['interviewer', 'both'].includes(item.assignment_type))
    .map((item) => item.Job?.id || '')
    .filter(Boolean);
  dialogVisible.value = true;
};

const confirmDelete = async (user: UserItem) => {
  try {
    await ElMessageBox.confirm(`确认删除人员“${user.name}”吗？岗位分配会一并解除。`, '删除确认', {
      type: 'warning',
      confirmButtonText: '确认删除',
      cancelButtonText: '取消'
    });
    await http.delete(`/api/users/${user.id}`);
    ElMessage.success('人员删除成功');
    await fetchUsers();
  } catch (error: any) {
    if (error === 'cancel' || error === 'close' || error?.action === 'cancel' || error?.action === 'close') {
      return;
    }
    ElMessage.error(error?.response?.data?.message || '删除人员失败');
  }
};

const submitUser = async () => {
  if (!form.username || !form.name || !form.role_id || (!editingUser.value && !form.password)) {
    ElMessage.warning('请补全账号、姓名、角色和登录密码');
    return;
  }

  submitting.value = true;
  try {
    const payload = {
      username: form.username,
      name: form.name,
      email: form.email,
      role_id: form.role_id,
      password: form.password || undefined,
      status: form.status,
      module_permissions: form.module_permissions,
      assignments: toAssignments()
    };

    if (editingUser.value) {
      const { data } = await http.put<UserItem>(`/api/users/${editingUser.value.id}`, payload);
      ElMessage.success('人员更新成功');
      const currentUser = getStoredUser<UserItem>();
      if (currentUser?.id && currentUser.id === data.id) {
        setAuthSession(getToken(), data);
        window.dispatchEvent(new CustomEvent('session-updated'));
      }
    } else {
      await http.post('/api/users', payload);
      ElMessage.success('人员创建成功');
    }

    dialogVisible.value = false;
    await fetchUsers();
  } catch (error) {
    ElMessage.error('保存人员失败');
  } finally {
    submitting.value = false;
  }
};

onMounted(async () => {
  await Promise.all([fetchUsers(), fetchMeta()]);
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
