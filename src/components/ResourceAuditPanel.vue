<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ArrowRight, Document } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { listAuditRecords } from '@/api/audit'
import type { AuditRecord } from '@/types/audit'
import { ApiError } from '@/types/api'
import { formatDateTime } from '@/utils/format'

const props = withDefaults(
  defineProps<{
    resourceType: string
    resourceId: string
    resourceName: string
    active?: boolean
  }>(),
  { active: true },
)

const records = ref<AuditRecord[]>([])
const total = ref(0)
const pageNum = ref(1)
const loading = ref(false)
const loadingMore = ref(false)
const loadFailed = ref(false)
const pageSize = 20
let requestSequence = 0

const hasMore = computed(() => records.value.length < total.value)

const actionLabels: Record<string, string> = {
  'tenant.create': '创建租户',
  'tenant.update': '更新租户',
  'tenant.delete': '删除租户',
  'tenant.read': '查看租户详情',
  'tenant.list': '查询租户列表',
  'tenant.member.add': '添加租户成员',
  'tenant.member.remove': '移除租户成员',
  'organization.create': '创建组织',
  'organization.update': '更新组织',
  'organization.delete': '删除组织',
  'organization.read': '查看组织详情',
  'organization.list': '查询组织列表',
  'organization.member.add': '添加组织成员',
  'organization.member.remove': '移除组织成员',
  'project.create': '创建项目',
  'project.update': '更新项目',
  'project.delete': '删除项目',
  'project.read': '查看项目详情',
  'project.list': '查询项目列表',
  'project.member.add': '添加项目成员',
  'project.member.remove': '移除项目成员',
  'environment.create': '创建环境',
  'environment.update': '更新环境',
  'environment.delete': '删除环境',
  'environment.read': '查看环境详情',
  'environment.list': '查询环境列表',
  'folder.create': '创建配置集',
  'folder.update': '更新配置集',
  'folder.delete': '删除配置集',
  'folder.read': '查看配置集详情',
  'folder.list': '查询配置集列表',
}

const fieldLabels: Record<string, string> = {
  code: '编码',
  name: '名称',
  remark: '说明',
  manager: '管理员',
  type: '类型',
  keyPattern: '密钥名称规则',
  orderNo: '排序',
  isCheckPerm: '密钥值权限校验',
}

function actionLabel(actionCode: string): string {
  return actionLabels[actionCode] ?? actionCode
}

function fieldLabel(field: string): string {
  if (field.startsWith('member.')) return `成员 ${field.slice('member.'.length)}`
  return fieldLabels[field] ?? field
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null) return '未设置'
  if (value === '') return '空值'
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return '—'
  }
}

function actorName(record: AuditRecord): string {
  return (
    record.createByName || record.createBy || (record.actorType === 'system' ? '系统' : '未知用户')
  )
}

function entryLabel(record: AuditRecord): string {
  if (record.callerType === 'sdk') {
    return [record.callerName || 'SDK', record.callerVersion].filter(Boolean).join(' ')
  }
  return (
    (
      {
        http: 'Web / HTTP',
        grpc: '服务 / gRPC',
        sdk: '进程内 SDK',
        internal: '内部调用',
        job: '系统任务',
      } as Record<string, string>
    )[record.entryType] ?? record.entryType
  )
}

function reset(): void {
  requestSequence += 1
  records.value = []
  total.value = 0
  pageNum.value = 1
  loading.value = false
  loadingMore.value = false
  loadFailed.value = false
}

async function load(resetList = true): Promise<void> {
  if (
    !props.active ||
    !props.resourceType ||
    !props.resourceId ||
    loading.value ||
    loadingMore.value
  )
    return
  const targetType = props.resourceType
  const targetId = props.resourceId
  const nextPage = resetList ? 1 : pageNum.value + 1
  const sequence = ++requestSequence
  if (resetList) {
    loading.value = true
    loadFailed.value = false
  } else {
    loadingMore.value = true
  }
  try {
    const response = await listAuditRecords({
      resourceType: targetType,
      resourceId: targetId,
      pageNum: nextPage,
      pageSize,
    })
    if (
      sequence !== requestSequence ||
      targetType !== props.resourceType ||
      targetId !== props.resourceId
    )
      return
    const merged = resetList ? response.list : [...records.value, ...response.list]
    records.value = [...new Map(merged.map((record) => [record.id, record])).values()]
    total.value = Number(response.total) || 0
    pageNum.value = nextPage
  } catch (error) {
    if (sequence !== requestSequence) return
    if (resetList) loadFailed.value = true
    if (!(error instanceof ApiError)) ElMessage.error('操作日志加载失败')
  } finally {
    if (sequence === requestSequence) {
      loading.value = false
      loadingMore.value = false
    }
  }
}

watch(
  () => [props.active, props.resourceType, props.resourceId] as const,
  ([isActive]) => {
    reset()
    if (isActive) void load(true)
  },
  { immediate: true },
)
</script>

<template>
  <div class="resource-audit__body">
    <header class="resource-audit__summary">
      <span class="resource-audit__resource">
        <el-icon><Document /></el-icon>
        <strong :title="resourceName">{{ resourceName || resourceId }}</strong>
      </span>
      <span>{{ total }} 条记录</span>
    </header>

    <div
      v-loading="loading"
      element-loading-text="正在加载操作日志..."
      class="resource-audit__content"
    >
      <div v-if="loadFailed && !loading" class="resource-audit__state is-error">
        <strong>操作日志加载失败</strong>
        <el-button type="primary" link @click="load(true)">重新加载</el-button>
      </div>
      <div v-else-if="!loading && !records.length" class="resource-audit__state">暂无操作日志</div>
      <ol v-else class="resource-audit-list">
        <li v-for="record in records" :key="record.id" class="resource-audit-item">
          <span
            class="resource-audit-item__marker"
            :class="{ 'is-failure': record.resultCode === 'failure' }"
          />
          <div class="resource-audit-item__main">
            <header>
              <span class="resource-audit-item__action">
                <strong>{{ actionLabel(record.actionCode) }}</strong>
                <span
                  class="resource-audit-item__result"
                  :class="{ 'is-failure': record.resultCode === 'failure' }"
                >
                  {{ record.resultCode === 'success' ? '成功' : '失败' }}
                </span>
              </span>
              <time>{{ formatDateTime(record.createAt) || '—' }}</time>
            </header>
            <div class="resource-audit-item__meta">
              <span
                ><strong>{{ actorName(record) }}</strong> 执行</span
              >
              <span>{{ entryLabel(record) }}</span>
            </div>
            <ul v-if="record.changeDetail.length" class="resource-audit-changes">
              <li v-for="change in record.changeDetail" :key="change.field">
                <span class="resource-audit-changes__field">{{ fieldLabel(change.field) }}</span>
                <span v-if="change.redacted" class="resource-audit-changes__redacted">
                  已修改，内容已脱敏
                </span>
                <span v-else class="resource-audit-changes__values">
                  <code>{{ formatValue(change.before) }}</code>
                  <el-icon><ArrowRight /></el-icon>
                  <code>{{ formatValue(change.after) }}</code>
                </span>
              </li>
            </ul>
            <div v-else-if="record.resultCode === 'success'" class="resource-audit-item__empty">
              本次操作未产生字段变化
            </div>
            <div v-if="record.resultCode === 'failure'" class="resource-audit-item__failure">
              {{ record.failureReason || '操作失败' }}
            </div>
            <footer v-if="record.correlationId">请求 {{ record.correlationId }}</footer>
          </div>
        </li>
      </ol>
      <div v-if="hasMore && !loadFailed" class="resource-audit__more">
        <el-button :loading="loadingMore" :disabled="loading" @click="load(false)">
          加载更多
        </el-button>
      </div>
    </div>
  </div>
</template>

<style lang="scss">
.resource-audit {
  &__title,
  &__summary,
  &__resource,
  &__more {
    display: flex;
    align-items: center;
  }
  &__title {
    gap: 9px;
    color: var(--v-text-primary);
    font-size: var(--v-font-lg);
    font-weight: 700;
  }
  &__title .el-icon,
  &__resource .el-icon {
    color: #176dfb;
  }
  &__body {
    min-height: 500px;
    display: flex;
    flex-direction: column;
  }
  &__summary {
    min-height: 58px;
    justify-content: space-between;
    gap: 16px;
    padding: 0 22px;
    border-bottom: 1px solid var(--v-divider);
  }
  &__summary > span:last-child {
    color: var(--v-text-tertiary);
    font-size: var(--v-font-xs);
  }
  &__resource {
    min-width: 0;
    gap: 8px;
  }
  &__resource strong {
    overflow: hidden;
    color: var(--v-text-primary);
    font-size: var(--v-font-md);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  &__content {
    min-height: 442px;
    flex: 1;
    padding: 0 22px 18px;
    overflow-y: auto;
  }
  &__state {
    min-height: 380px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: var(--v-text-tertiary);
  }
  &__state.is-error strong {
    color: #ef4444;
  }
  &__more {
    justify-content: center;
    padding-top: 16px;
  }
  &__more .el-button {
    min-width: 96px;
    border-radius: var(--v-radius-dialog-action);
  }
}
.resource-audit-list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.resource-audit-item {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  gap: 12px;
  padding: 20px 0;
  border-bottom: 1px solid var(--v-divider);
  &__marker {
    width: 10px;
    height: 10px;
    margin-top: 5px;
    border: 2px solid var(--v-surface-bg);
    border-radius: 50%;
    background: #059669;
    box-shadow: 0 0 0 2px rgba(5, 150, 105, 0.2);
  }
  &__marker.is-failure {
    background: #ef4444;
    box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.18);
  }
  &__main {
    min-width: 0;
  }
  &__main > header,
  &__action,
  &__meta {
    display: flex;
    align-items: center;
  }
  &__main > header {
    justify-content: space-between;
    gap: 16px;
  }
  &__main time {
    flex: 0 0 auto;
    color: var(--v-text-tertiary);
    font-size: var(--v-font-xs);
  }
  &__action {
    min-width: 0;
    gap: 8px;
  }
  &__action strong {
    overflow: hidden;
    color: var(--v-text-primary);
    font-size: var(--v-font-md);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  &__result {
    padding: 3px 7px;
    border-radius: 4px;
    background: rgba(5, 150, 105, 0.1);
    color: #047857;
    font-size: var(--v-font-xs);
    font-weight: 600;
  }
  &__result.is-failure {
    background: rgba(239, 68, 68, 0.09);
    color: #dc2626;
  }
  &__meta {
    flex-wrap: wrap;
    gap: 8px 18px;
    margin-top: 7px;
    color: var(--v-text-secondary);
    font-size: var(--v-font-xs);
  }
  &__meta strong {
    color: var(--v-text-primary);
  }
  &__empty,
  &__failure {
    margin-top: 13px;
    color: var(--v-text-tertiary);
    font-size: var(--v-font-sm);
  }
  &__failure {
    padding: 8px 10px;
    border-left: 3px solid #ef4444;
    background: rgba(239, 68, 68, 0.05);
    color: #dc2626;
  }
  &__main > footer {
    margin-top: 12px;
    color: var(--v-text-tertiary);
    overflow-wrap: anywhere;
    font-family: ui-monospace, monospace;
    font-size: 10px;
  }
}
.resource-audit-changes {
  margin: 14px 0 0;
  padding: 0;
  border-top: 1px solid var(--v-divider);
  list-style: none;
  li {
    min-height: 40px;
    display: grid;
    grid-template-columns: minmax(120px, 180px) minmax(0, 1fr);
    align-items: center;
    gap: 12px;
    padding: 7px 0;
    border-bottom: 1px solid var(--v-divider);
    font-size: var(--v-font-xs);
  }
  &__field {
    color: var(--v-text-secondary);
    font-weight: 600;
  }
  &__redacted {
    color: #d97706;
  }
  &__values {
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 16px minmax(0, 1fr);
    align-items: center;
    gap: 7px;
  }
  &__values code {
    min-width: 0;
    overflow-wrap: anywhere;
    color: var(--v-text-primary);
    white-space: pre-wrap;
  }
  &__values .el-icon {
    color: var(--v-text-tertiary);
    font-size: 12px;
  }
}
@media (max-width: 720px) {
  .resource-audit__summary {
    align-items: flex-start;
    flex-direction: column;
    padding: 14px 18px;
  }
  .resource-audit__content {
    padding: 0 18px 16px;
  }
  .resource-audit-item__main > header {
    align-items: flex-start;
    flex-direction: column;
    gap: 6px;
  }
  .resource-audit-changes li {
    grid-template-columns: 1fr;
    gap: 4px;
  }
}
</style>
