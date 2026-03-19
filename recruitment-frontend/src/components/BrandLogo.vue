<template>
  <div class="brand-logo" :class="[`brand-logo--${size}`]" aria-hidden="true">
    <img class="brand-logo__image" src="/vite.svg" alt="" />
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    size?: 'sm' | 'md' | 'lg';
  }>(),
  {
    size: 'md'
  }
);
</script>

<style scoped>
.brand-logo {
  --logo-width: 56px;
  --logo-height: 56px;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--logo-width);
  height: var(--logo-height);
}

.brand-logo--sm {
  --logo-width: 44px;
  --logo-height: 44px;
}

.brand-logo--lg {
  --logo-width: 88px;
  --logo-height: 88px;
}

.brand-logo__image {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
</style>
