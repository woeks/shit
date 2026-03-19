<template>
  <div class="dialog-header-bar">
    <span class="dialog-header-title">{{ title }}</span>
    <el-button text type="primary" class="dialog-header-action" @click="$emit('toggle')">
      {{ fullscreen ? '退出全屏' : '全屏填写' }}
    </el-button>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title: string;
  fullscreen: boolean;
}>();

defineEmits<{
  toggle: [];
}>();
</script>

<style scoped>
.dialog-header-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  width: 100%;
}

.dialog-header-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-main);
}

.dialog-header-action {
  padding: 0;
}
</style>
