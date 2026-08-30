<script setup lang="ts">
import { computed } from 'vue'
import { Operation } from '@element-plus/icons-vue'
import ResourceAuditPanel from '@/components/ResourceAuditPanel.vue'

const props = defineProps<{
  modelValue: boolean
  resourceType: string
  resourceId: string
  resourceName: string
}>()

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})
</script>

<template>
  <el-dialog
    v-model="visible"
    class="vault-card-edit-dialog vault-audit-log-dialog"
    :close-on-click-modal="false"
    destroy-on-close
    align-center
  >
    <template #header>
      <div class="resource-audit__title">
        <el-icon><Operation /></el-icon>
        <span>操作日志</span>
      </div>
    </template>

    <ResourceAuditPanel
      :active="visible"
      :resource-type="resourceType"
      :resource-id="resourceId"
      :resource-name="resourceName"
    />

    <template #footer>
      <el-button type="primary" @click="visible = false">关闭</el-button>
    </template>
  </el-dialog>
</template>
