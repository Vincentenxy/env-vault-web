<script setup lang="ts">
import { ref, watch } from 'vue'
import { Eye, EyeOff } from '@lucide/vue'
import { ElMessage } from 'element-plus'
import { copyToClipboard } from '@/utils/copy'

const props = withDefaults(defineProps<{ value: string; masked?: boolean; expanded?: boolean }>(), {
  masked: false,
  expanded: false,
})
const visible = ref(!props.masked)
watch(
  () => [props.value, props.masked],
  () => {
    visible.value = !props.masked
  },
)
async function copy(): Promise<void> {
  if (!visible.value) return
  const copied = await copyToClipboard(props.value)
  if (copied) ElMessage.success('已复制')
  else ElMessage.error('复制失败')
}
</script>
<template>
  <div class="secret-value-preview" :class="{ 'is-expanded': expanded }">
    <button
      type="button"
      class="secret-value-preview__value"
      :disabled="!visible || !value"
      aria-label="复制环境值"
      @click="copy"
    >
      <code v-if="!value" class="secret-value-preview__empty">空值</code>
      <code v-else>{{ visible ? value : '••••••••' }}</code>
    </button>
    <button
      v-if="value"
      type="button"
      class="secret-value-preview__toggle"
      :aria-label="visible ? '隐藏环境值' : '显示环境值'"
      :aria-pressed="visible"
      @click="visible = !visible"
    >
      <Eye v-if="visible" :size="14" /><EyeOff v-else :size="14" />
    </button>
  </div>
</template>
<style scoped lang="scss">
.secret-value-preview {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  width: 100%;
  button {
    border: 0;
    padding: 0;
    background: transparent;
    font: inherit;
  }
  &__value {
    min-width: 0;
    flex: 1;
    text-align: left;
    cursor: pointer;
    color: var(--v-text-primary);
    overflow: hidden;
  }
  code {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
  }
  &__value:disabled {
    cursor: default;
  }
  &__empty {
    color: var(--v-text-tertiary);
    font-family: inherit;
  }
  &__toggle {
    flex: 0 0 28px;
    width: 28px;
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--v-brand-primary);
    cursor: pointer;
  }
  &.is-expanded {
    align-items: flex-start;
    code {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      line-height: 1.7;
    }
  }
}
</style>
