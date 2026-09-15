<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { getSecretTags, type SecretTag } from '@/api/secret'
import { getTag, type Tag } from '@/api/tag'
import { formatDateTime } from '@/utils/format'

const props = defineProps<{
  modelValue: boolean
  groupId: string
  secretKey: string
  tag: SecretTag
}>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})
const loading = ref(false)
const failed = ref(false)
const detail = ref<Tag | null>(null)
let requestSequence = 0

function displayTime(value?: string): string {
  return value ? formatDateTime(value) : '—'
}

// 标签详情接口需要 tenantId，先通过密钥标签关系获取租户范围
async function load(): Promise<void> {
  const request = ++requestSequence
  loading.value = true
  failed.value = false
  detail.value = null
  try {
    const groupTags = await getSecretTags(props.groupId)
    if (request !== requestSequence || !visible.value) return
    const result = await getTag({ tenantId: groupTags.tenantId, id: props.tag.id })
    if (request !== requestSequence || !visible.value) return
    detail.value = result
  } catch {
    if (request === requestSequence) failed.value = true
  } finally {
    if (request === requestSequence) loading.value = false
  }
}

watch(
  () => [props.modelValue, props.groupId, props.tag.id] as const,
  ([open, groupId, tagId]) => {
    if (open && groupId && tagId) void load()
    else requestSequence += 1
  },
  { immediate: true },
)
</script>

<template>
  <el-dialog
    v-model="visible"
    title="标签详情"
    width="600px"
    class="vault-card-edit-dialog"
    append-to-body
    align-center
    destroy-on-close
  >
    <div v-loading="loading" class="secret-tag-detail__body">
      <div v-if="failed" class="secret-tag-detail__error">
        <span>标签详情加载失败</span>
        <el-button link type="primary" @click="load">重新加载</el-button>
      </div>
      <el-descriptions v-else :column="1" border label-width="112px">
        <el-descriptions-item label="密钥">
          <code class="secret-tag-detail__secret-key">{{ secretKey }}</code>
        </el-descriptions-item>
        <el-descriptions-item label="标签名称">{{ detail?.name ?? tag.name }}</el-descriptions-item>
        <el-descriptions-item label="Code">
          <code>{{ detail?.code ?? tag.code }}</code>
        </el-descriptions-item>
        <el-descriptions-item label="值检索">
          <el-tag :type="(detail?.allowValueSearch ?? tag.allowValueSearch) ? 'success' : 'danger'">
            {{ (detail?.allowValueSearch ?? tag.allowValueSearch) ? '允许' : '禁止' }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="备注">
          <span class="secret-tag-detail__remark">{{ detail?.remark || '—' }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="创建时间">{{
          displayTime(detail?.createAt)
        }}</el-descriptions-item>
        <el-descriptions-item label="更新时间">{{
          displayTime(detail?.updateAt)
        }}</el-descriptions-item>
      </el-descriptions>
    </div>
    <template #footer>
      <el-button @click="visible = false">关闭</el-button>
    </template>
  </el-dialog>
</template>

<style scoped lang="scss">
.secret-tag-detail {
  &__body {
    min-height: 280px;
  }

  &__error {
    display: flex;
    min-height: 220px;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: var(--v-text-secondary);
  }

  &__secret-key,
  &__remark {
    overflow-wrap: anywhere;
  }
}
</style>
