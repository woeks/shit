<template>
  <section class="login-shell">
    <div class="login-panel">
      <div class="login-copy">
        <BrandLogo size="lg" class="login-logo" />
        <p class="eyebrow">HR管理系统</p>
        <h1>欢迎登录</h1>
        <p>请输入已分配的账号信息进入系统，统一处理招聘流程、面试协同和录用管理。</p>
      </div>

      <el-form class="login-form" :model="form" label-position="top" @submit.prevent="submitLogin">
        <el-form-item label="账号">
          <el-input v-model="form.username" placeholder="请输入账号" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="form.password" type="password" show-password placeholder="请输入密码" />
        </el-form-item>
        <el-button type="primary" class="submit-btn" :loading="submitting" @click="submitLogin">登录</el-button>

        <div class="login-tip">
          <div>账号说明：</div>
          <div>请使用管理员创建并分配的正式账号登录。</div>
          <div>如未获得账号或忘记密码，请联系系统管理员处理。</div>
        </div>
      </el-form>
    </div>
  </section>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import http from '../api/http';
import BrandLogo from '../components/BrandLogo.vue';
import { setAuthSession } from '../utils/auth';

interface LoginResponse {
  token: string;
  user: {
    id: string;
    Role?: {
      code?: string;
    };
  };
}

const router = useRouter();
const submitting = ref(false);
const form = reactive({
  username: '',
  password: ''
});

const submitLogin = async () => {
  if (!form.username || !form.password) {
    ElMessage.warning('请输入账号和密码');
    return;
  }

  submitting.value = true;

  try {
    const { data } = await http.post<LoginResponse>('/api/auth/login', form);
    setAuthSession(data.token, data.user);
    await router.replace(data.user.Role?.code === 'interviewer' ? '/resumes/review' : '/dashboard');
  } catch (error) {
    ElMessage.error('登录失败，请检查账号或密码');
  } finally {
    submitting.value = false;
  }
};
</script>

<style scoped>
.login-shell {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
  background:
    radial-gradient(circle at top left, rgba(15, 118, 110, 0.18), transparent 24%),
    radial-gradient(circle at bottom right, rgba(180, 83, 9, 0.16), transparent 26%),
    linear-gradient(135deg, #f5efe6, #eef6f5);
}

.login-panel {
  width: min(920px, 100%);
  display: grid;
  grid-template-columns: 1.1fr 0.9fr;
  overflow: hidden;
  border-radius: 28px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.12);
}

.login-copy {
  padding: 56px;
  background: linear-gradient(145deg, rgba(28, 40, 52, 0.96), rgba(15, 118, 110, 0.88));
  color: #f8fafc;
}

.login-logo {
  margin-bottom: 24px;
}

.eyebrow {
  margin: 0 0 16px;
  font-size: 12px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(248, 250, 252, 0.72);
}

.login-copy h1 {
  margin: 0 0 16px;
  font-size: 40px;
  line-height: 1.1;
}

.login-copy p:last-child {
  margin: 0;
  font-size: 16px;
  line-height: 1.8;
  color: rgba(248, 250, 252, 0.78);
}

.login-form {
  padding: 56px 44px;
}

.submit-btn {
  width: 100%;
  margin-top: 8px;
}

.login-tip {
  margin-top: 18px;
  padding: 16px;
  border-radius: 18px;
  background: #f8fafc;
  color: #475569;
  font-size: 13px;
  line-height: 1.8;
}

@media (max-width: 860px) {
  .login-panel {
    grid-template-columns: 1fr;
  }

  .login-copy,
  .login-form {
    padding: 28px;
  }

  .login-copy h1 {
    font-size: 30px;
  }
}
</style>
