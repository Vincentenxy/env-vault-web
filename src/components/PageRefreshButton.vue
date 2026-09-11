<script setup lang="ts">
import { computed, ref } from 'vue'
import { RefreshCw } from '@lucide/vue'

const props = defineProps<{
  action: () => Promise<unknown>
  loading?: boolean
  disabled?: boolean
}>()
const refreshing = ref(false)
const busy = computed(() => refreshing.value || props.loading)

// 按当前页面的数据范围刷新，整条请求链完成前禁止重复点击
async function refresh(): Promise<void> {
  if (busy.value || props.disabled) return
  refreshing.value = true
  try {
    await props.action()
  } finally {
    refreshing.value = false
  }
}
</script>

<template>
  <button
    type="button"
    class="page-refresh-button"
    aria-label="刷新当前页面"
    :aria-busy="Boolean(busy)"
    :disabled="busy || disabled"
    @click="refresh"
  >
    <RefreshCw :size="16" :stroke-width="1.8" :class="{ 'is-spinning': busy }" />
  </button>
</template>

<style scoped lang="scss">
.page-refresh-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  flex: 0 0 32px;
  padding: 0;
  border: 1px solid var(--v-surface-border);
  border-radius: 50%;
  background: var(--v-surface-bg);
  color: var(--v-text-secondary);
  cursor: pointer;

  &:hover:not(:disabled) {
    border-color: var(--el-color-primary);
    color: var(--el-color-primary);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.48;
  }

  .is-spinning {
    animation: page-refresh 1s linear infinite;
  }
}

@keyframes page-refresh {
  to {
    transform: rotate(360deg);
  }
}
</style>
