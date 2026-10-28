<script setup lang="ts">
import type { AuditRecord } from '@/types/audit'
import { auditActionLabel, auditActor, auditResourceLabels, auditValue } from '@/utils/audit'
import { formatDateTime } from '@/utils/format'

defineProps<{ record?: AuditRecord }>()
const visible = defineModel<boolean>({ default: false })
</script>

<template>
  <el-dialog
    v-model="visible"
    title="审计日志详情"
    width="860px"
    class="vault-card-edit-dialog audit-record-dialog"
    align-center
    append-to-body
    destroy-on-close
  >
    <div v-if="record" class="audit-detail">
      <section aria-label="事件信息">
        <h2>事件信息</h2>
        <dl class="audit-detail__fields">
          <dt>操作时间</dt>
          <dd>{{ formatDateTime(record.createAt) }}</dd>
          <dt>操作结果</dt>
          <dd :class="record.resultCode === 'success' ? 'is-success' : 'is-failure'">
            {{ record.resultCode === 'success' ? '成功' : '失败' }}
          </dd>
          <dt>操作人</dt>
          <dd>
            {{ auditActor(record)
            }}<span v-if="record.createBy" class="audit-detail__secondary">{{
              record.createBy
            }}</span>
          </dd>
          <dt>操作动作</dt>
          <dd>
            {{ auditActionLabel(record.actionCode)
            }}<span class="audit-detail__secondary">{{ record.actionCode }}</span>
          </dd>
          <dt>资源类型</dt>
          <dd>{{ auditResourceLabels[record.resourceType] || record.resourceType }}</dd>
          <dt>资源名称</dt>
          <dd>{{ record.resourceName || '—' }}</dd>
          <dt>资源 ID</dt>
          <dd class="audit-detail__mono">{{ record.resourceId || '—' }}</dd>
          <dt>归属范围</dt>
          <dd>
            {{ record.scopeType || '—'
            }}<span class="audit-detail__secondary">{{ record.scopeId }}</span>
          </dd>
        </dl>
      </section>

      <section v-if="record.resultCode === 'failure'" aria-label="失败信息">
        <h2>失败信息</h2>
        <dl class="audit-detail__fields">
          <dt>失败代码</dt>
          <dd>{{ record.failureCode || '—' }}</dd>
          <dt>失败原因</dt>
          <dd>{{ record.failureReason || '未提供失败原因' }}</dd>
        </dl>
      </section>

      <section aria-label="字段变更">
        <h2>字段变更</h2>
        <p v-if="!record.changeDetail.length" class="audit-detail__secondary">无字段变更记录</p>
        <div v-else class="audit-detail__changes">
          <div class="audit-detail__change audit-detail__change--heading">
            <span>字段</span><span>变更前</span><span>变更后</span>
          </div>
          <div
            v-for="(change, index) in record.changeDetail"
            :key="`${change.field}-${index}`"
            class="audit-detail__change"
          >
            <code>{{ change.field }}</code>
            <span v-if="change.redacted" class="audit-detail__redacted"
              >内容已脱敏，仅记录变更</span
            >
            <template v-else>
              <pre>{{ auditValue(change.before) }}</pre>
              <pre>{{ auditValue(change.after) }}</pre>
            </template>
          </div>
        </div>
      </section>

      <section v-if="Object.keys(record.eventDetail).length" aria-label="事件摘要">
        <h2>事件摘要</h2>
        <pre class="audit-detail__json">{{ auditValue(record.eventDetail) }}</pre>
      </section>

      <section aria-label="调用与关联信息">
        <h2>调用与关联信息</h2>
        <dl class="audit-detail__fields">
          <dt>事件 ID</dt>
          <dd class="audit-detail__mono">{{ record.id }}</dd>
          <dt>事件来源</dt>
          <dd>{{ record.eventSource || '—' }}</dd>
          <dt>调用入口</dt>
          <dd>{{ record.entryType || '—' }} / {{ record.callerType || '—' }}</dd>
          <dt>调用方</dt>
          <dd>{{ [record.callerName, record.callerVersion].filter(Boolean).join(' ') || '—' }}</dd>
          <dt>调用方法</dt>
          <dd>{{ record.operationName || '—' }}</dd>
          <dt>协议状态</dt>
          <dd>{{ record.protocolStatus || '—' }}</dd>
          <dt>批次 ID</dt>
          <dd class="audit-detail__mono">{{ record.batchId || '—' }}</dd>
          <dt>请求关联 ID</dt>
          <dd class="audit-detail__mono">{{ record.correlationId || '—' }}</dd>
          <dt>Trace ID</dt>
          <dd class="audit-detail__mono">{{ record.traceId || '—' }}</dd>
        </dl>
      </section>
    </div>
    <template #footer><el-button @click="visible = false">关闭</el-button></template>
  </el-dialog>
</template>

<style scoped lang="scss">
:global(.audit-record-dialog.vault-card-edit-dialog.el-dialog > .el-dialog__body) {
  box-sizing: border-box;
  max-height: calc(90vh - 120px);
  padding: 20px 22px;
  overflow: auto;
}
.audit-detail {
  display: grid;
  gap: 24px;
  color: var(--v-text-primary);

  h2 {
    margin: 0 0 14px;
    font-size: 14px;
    font-weight: 600;
  }
  p {
    margin: 0;
  }
  &__fields {
    display: grid;
    grid-template-columns: 100px minmax(0, 1fr);
    gap: 12px 16px;
    margin: 0;
    font-size: 13px;
  }
  dt {
    color: var(--v-text-secondary);
  }
  dd {
    margin: 0;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  &__secondary {
    display: block;
    color: var(--v-text-secondary);
    font-size: 12px;
  }
  &__mono,
  code,
  pre {
    font-family: var(--el-font-family-monospace, monospace);
    font-size: 12px;
  }
  &__changes {
    border: 1px solid var(--v-divider);
    border-radius: var(--v-radius-md);
    overflow: hidden;
  }
  &__change {
    display: grid;
    grid-template-columns: minmax(80px, 1fr) repeat(2, minmax(0, 1.5fr));
    gap: 12px;
    padding: 12px;
    border-bottom: 1px solid var(--v-divider);
    font-size: 12px;
    overflow-wrap: anywhere;
  }
  &__change:last-child {
    border-bottom: 0;
  }
  &__change--heading {
    background: var(--v-surface-bg-subtle);
    color: var(--v-text-secondary);
  }
  pre {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    margin: 0;
    max-height: 200px;
    overflow: auto;
  }
  &__redacted {
    grid-column: 2 / 4;
    color: var(--v-text-secondary);
  }
  &__json {
    padding: 14px;
    background: var(--v-surface-bg-subtle);
    border-radius: var(--v-radius-md);
  }
  .is-success {
    color: var(--v-color-success);
  }
  .is-failure {
    color: var(--v-color-danger);
  }
}
</style>
