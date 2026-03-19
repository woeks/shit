<template>
  <section class="page-card page">
    <div class="page-header">
      <div>
        <h2 class="page-title">登录审计</h2>
        <p class="page-subtitle">查看登录成功和失败记录，定位异常账号尝试和口令问题。</p>
      </div>
      <el-button @click="fetchAudits">刷新</el-button>
    </div>

    <div class="toolbar">
      <el-select v-model="filters.status" placeholder="状态" clearable style="width: 180px" @change="fetchAudits">
        <el-option label="成功" value="success" />
        <el-option label="失败" value="failed" />
      </el-select>
      <el-input v-model="filters.username" placeholder="账号关键词" style="width: 220px" @keyup.enter="fetchAudits" />
      <el-button type="primary" @click="fetchAudits">查询</el-button>
    </div>

    <el-table :data="audits" class="content-table" width="100%">
      <el-table-column prop="username" label="账号" min-width="140" />
      <el-table-column label="人员" min-width="140">
        <template #default="{ row }">
          {{ row.User?.name || '-' }}
        </template>
      </el-table-column>
      <el-table-column label="角色" min-width="140">
        <template #default="{ row }">
          {{ row.User?.Role?.name || '-' }}
        </template>
      </el-table-column>
      <el-table-column label="结果" min-width="100">
        <template #default="{ row }">
          {{ toLabel(row.status, statusLabelMap) }}
        </template>
      </el-table-column>
      <el-table-column prop="ip_address" label="IP" min-width="140" />
      <el-table-column prop="failure_reason" label="失败原因" min-width="220" />
      <el-table-column prop="created_at" label="时间" min-width="180" :formatter="formatDateCell" />
    </el-table>
  </section>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import http from '../api/http';
import { formatDateCell } from '../utils/time';
import { statusLabelMap, toLabel } from '../utils/labels';

interface AuditItem {
  id: string;
  username: string;
  status: string;
  ip_address?: string;
  failure_reason?: string;
  created_at: string;
  User?: {
    name?: string;
    Role?: {
      name?: string;
    };
  };
}

const audits = ref<AuditItem[]>([]);
const filters = reactive({
  status: '',
  username: ''
});

const fetchAudits = async () => {
  try {
    const { data } = await http.get<AuditItem[]>('/api/auth/audit', {
      params: {
        status: filters.status || undefined,
        username: filters.username || undefined
      }
    });
    audits.value = data;
  } catch (error) {
    ElMessage.error('获取登录审计失败');
  }
};

onMounted(fetchAudits);
</script>

<style scoped>
.page {
  padding: 28px;
}
</style>
