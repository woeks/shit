<template>
  <el-container class="layout-shell">
    <el-aside class="sidebar" width="240px">
      <div class="brand">
        <BrandLogo size="sm" />
        <div>
          <div class="brand-title">HR管理系统</div>
          <div class="brand-subtitle">人力资源与招聘协同平台</div>
        </div>
      </div>

      <el-menu :default-active="route.path" router class="menu">
        <el-menu-item v-for="item in visibleMenus" :key="item.path" :index="item.path">
          <el-icon><component :is="item.icon" /></el-icon>
          <span>{{ item.label }}</span>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <el-container>
      <el-header class="topbar">
        <div>
          <h1>HR管理系统</h1>
          <p>支持招聘流程协同、录用管理、权限控制与数据分析。</p>
        </div>
        <div class="topbar-actions">
          <div class="user-switch" v-if="sessionUser">
            <div>
              <div class="user-name">{{ sessionUser.name }}</div>
              <span class="user-role">{{ sessionUser.Role?.name || '' }}</span>
            </div>
            <el-button @click="passwordDialogVisible = true">修改密码</el-button>
            <el-button @click="handleLogout">退出登录</el-button>
          </div>
          <div class="topbar-badge">Vue 3 + Express + PostgreSQL</div>
        </div>
      </el-header>

      <el-main class="main-content">
        <router-view />
      </el-main>
    </el-container>
  </el-container>

  <el-dialog v-model="passwordDialogVisible" :width="passwordDialogFullscreen ? '100%' : '420px'" :fullscreen="passwordDialogFullscreen" class="smart-dialog">
    <template #header>
      <DialogHeaderBar title="修改密码" :fullscreen="passwordDialogFullscreen" @toggle="togglePasswordDialogFullscreen" />
    </template>
    <el-form :model="passwordForm" label-width="96px">
      <el-form-item label="当前密码">
        <el-input v-model="passwordForm.current_password" type="password" show-password />
      </el-form-item>
      <el-form-item label="新密码">
        <el-input v-model="passwordForm.new_password" type="password" show-password />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="passwordDialogVisible = false">取消</el-button>
      <el-button type="primary" :loading="passwordSubmitting" @click="submitPasswordChange">提交</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import {
  ChatDotRound,
  Checked,
  DataAnalysis,
  Document,
  FolderOpened,
  Histogram,
  Suitcase,
  User,
  UserFilled,
  Connection
} from '@element-plus/icons-vue';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import http from '../api/http';
import BrandLogo from '../components/BrandLogo.vue';
import DialogHeaderBar from '../components/DialogHeaderBar.vue';
import { useDialogFullscreen } from '../composables/useDialogFullscreen';
import { clearAuthSession, getStoredModules, getStoredRole, getStoredUser, getToken, setAuthSession } from '../utils/auth';

const route = useRoute();
const router = useRouter();

interface Role {
  code: string;
  name: string;
}

interface UserItem {
  id: string;
  name: string;
  Role?: Role;
  module_permissions?: string[];
}

const sessionUser = ref<UserItem | null>(null);
const currentRole = ref('');
const modulePermissions = ref<string[]>([]);
const { fullscreen: passwordDialogFullscreen, toggleFullscreen: togglePasswordDialogFullscreen } = useDialogFullscreen();

const menus = [
  { path: '/dashboard', label: '仪表盘', icon: DataAnalysis, roles: ['super_admin', 'hr_manager'], module: 'dashboard' },
  { path: '/jobs', label: '岗位管理', icon: Suitcase, roles: ['super_admin', 'hr_manager'], module: 'jobs' },
  { path: '/resumes', label: '简历库', icon: Document, roles: ['super_admin', 'hr_manager'], module: 'resumes' },
  { path: '/resumes/screening', label: '初筛', icon: Checked, roles: ['super_admin', 'hr_manager'], module: 'screening' },
  { path: '/resumes/review', label: '复筛', icon: User, roles: ['super_admin', 'hr_manager', 'interviewer'], module: 'review' },
  { path: '/interviews/scheduling', label: '待安排面试', icon: Connection, roles: ['super_admin', 'hr_manager'], module: 'scheduling' },
  { path: '/interviews', label: '面试管理', icon: ChatDotRound, roles: ['super_admin', 'hr_manager', 'interviewer'], module: 'interviews' },
  { path: '/offers', label: '录用管理', icon: Document, roles: ['super_admin', 'hr_manager'], module: 'offers' },
  { path: '/talent-pool', label: '人才库', icon: FolderOpened, roles: ['super_admin', 'hr_manager'], module: 'talent_pool' },
  { path: '/reports', label: '报表中心', icon: Histogram, roles: ['super_admin', 'hr_manager'], module: 'reports' },
  { path: '/auth/audit', label: '登录审计', icon: Document, roles: ['super_admin', 'hr_manager'], module: 'auth_audit' },
  { path: '/platforms', label: '邮箱同步', icon: Connection, roles: ['super_admin', 'hr_manager'], module: 'platforms' },
  { path: '/people', label: '人员权限', icon: UserFilled, roles: ['super_admin', 'hr_manager'], module: 'people' }
];

const visibleMenus = computed(() =>
  menus.filter((item) => {
    if (!item.roles.includes(currentRole.value)) {
      return false;
    }
    if (!modulePermissions.value.length) {
      return true;
    }
    return modulePermissions.value.includes(item.module);
  })
);
const passwordDialogVisible = ref(false);
const passwordSubmitting = ref(false);
const passwordForm = ref({
  current_password: '',
  new_password: ''
});

const fetchSession = async () => {
  const { data } = await http.get<UserItem>('/api/session');
  sessionUser.value = data;
  currentRole.value = data.Role?.code || '';
  modulePermissions.value = Array.isArray(data.module_permissions) ? data.module_permissions : [];
  setAuthSession(getToken(), data);
};

const handleSessionUpdated = () => {
  currentRole.value = getStoredRole();
  modulePermissions.value = getStoredModules();
  const storedUser = getStoredUser<UserItem>();
  if (storedUser) {
    sessionUser.value = storedUser;
  }
};

const handleLogout = async () => {
  clearAuthSession();
  await router.replace('/login');
};

const submitPasswordChange = async () => {
  if (!passwordForm.value.current_password || !passwordForm.value.new_password) {
    ElMessage.warning('请输入当前密码和新密码');
    return;
  }

  passwordSubmitting.value = true;

  try {
    await http.post('/api/auth/change-password', passwordForm.value);
    ElMessage.success('密码修改成功，请重新登录');
    passwordDialogVisible.value = false;
    passwordForm.value.current_password = '';
    passwordForm.value.new_password = '';
    await handleLogout();
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '修改密码失败');
  } finally {
    passwordSubmitting.value = false;
  }
};

onMounted(async () => {
  currentRole.value = getStoredRole();
  modulePermissions.value = getStoredModules();
  await fetchSession();
  window.addEventListener('session-updated', handleSessionUpdated);
});

onBeforeUnmount(() => {
  window.removeEventListener('session-updated', handleSessionUpdated);
});
</script>

<style scoped>
.layout-shell {
  min-height: 100vh;
  background:
    radial-gradient(circle at top left, rgba(15, 118, 110, 0.16), transparent 26%),
    radial-gradient(circle at bottom right, rgba(180, 83, 9, 0.12), transparent 24%);
}

.sidebar {
  display: flex;
  flex-direction: column;
  padding: 24px 18px;
  background: rgba(28, 40, 52, 0.92);
  color: #f8fafc;
  border-right: 1px solid rgba(255, 255, 255, 0.08);
}

.brand {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 28px;
  padding: 12px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.06);
}

.brand-title {
  font-size: 18px;
  font-weight: 700;
}

.brand-subtitle {
  font-size: 12px;
  color: rgba(248, 250, 252, 0.72);
}

.menu {
  border-right: none;
  background: transparent;
}

.menu :deep(.el-menu-item) {
  margin-bottom: 8px;
  border-radius: 14px;
  color: rgba(248, 250, 252, 0.82);
}

.menu :deep(.el-menu-item:hover),
.menu :deep(.el-menu-item.is-active) {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  height: auto;
  padding: 22px 20px 0;
}

.topbar h1 {
  margin: 0;
  font-size: 30px;
}

.topbar p {
  margin: 8px 0 0;
  color: var(--text-sub);
}

.topbar-actions {
  display: flex;
  align-items: center;
  gap: 14px;
}

.user-switch {
  display: flex;
  align-items: center;
  gap: 10px;
}

.user-role {
  font-size: 13px;
  font-weight: 700;
  color: var(--accent);
}

.user-name {
  font-size: 15px;
  font-weight: 700;
}

.topbar-badge {
  padding: 10px 16px;
  border-radius: 999px;
  background: rgba(255, 253, 248, 0.9);
  border: 1px solid var(--line-soft);
  color: var(--accent);
  font-size: 13px;
  font-weight: 700;
}

.main-content {
  padding: 12px 20px 20px;
  min-height: calc(100vh - 92px);
}

@media (max-width: 960px) {
  .layout-shell {
    flex-direction: column;
  }

  .sidebar {
    width: 100% !important;
  }

  .topbar {
    flex-direction: column;
    align-items: flex-start;
  }

  .topbar-actions,
  .user-switch {
    width: 100%;
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
