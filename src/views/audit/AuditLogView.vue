<script setup lang="ts">
import { onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ChevronDown, FileText, ScrollText } from '@lucide/vue'
import { listGlobalAuditRecords, type ListGlobalAuditRequest } from '@/api/audit'
import PageRefreshButton from '@/components/PageRefreshButton.vue'
import { ApiError } from '@/types/api'
import type { AuditRecord, AuditResult } from '@/types/audit'
import { auditActionLabel, auditActor, auditResourceLabels } from '@/utils/audit'
import { formatDateTime } from '@/utils/format'
import {
  auditPageSizes,
  auditRouteQuery,
  isSameAuditQuery,
  readAuditRoute,
  recentAuditWeek,
} from '@/utils/audit-route'
import AuditRecordDialog from './components/AuditRecordDialog.vue'

defineOptions({ name: 'AuditLogView' })

const route = useRoute()
const router = useRouter()

const filters = reactive({
  resourceType: '',
  resourceId: '',
  actionCode: '',
  createBy: '',
  resultCode: '' as AuditResult | '',
  batchId: '',
  correlationId: '',
  traceId: '',
})
const timeRange = ref<[Date, Date] | null>(recentAuditWeek())
const advanced = ref(false)
const validationError = ref('')
const errorMessage = ref('')
const records = ref<AuditRecord[]>([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(20)
const loading = ref(false)
const selectedRecord = ref<AuditRecord>()
const detailVisible = ref(false)
const appliedFilters = ref<ListGlobalAuditRequest>({})
const routeInvalid = ref(false)
let requestSequence = 0
let controller: AbortController | undefined

function buildFilters(): ListGlobalAuditRequest | undefined {
  validationError.value = ''
  const batch = filters.batchId.trim()
  if (
    batch &&
    (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(batch) ||
      batch === '00000000-0000-0000-0000-000000000000')
  ) {
    validationError.value = '批次 ID 需要填写有效的 UUID'
    return
  }
  const [start, end] = timeRange.value || []
  if (
    start &&
    end &&
    (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end)
  ) {
    validationError.value = '请填写有效的起止时间，开始时间不能晚于结束时间'
    return
  }
  return {
    resourceType: filters.resourceType.trim() || undefined,
    resourceId: filters.resourceId.trim() || undefined,
    actionCode: filters.actionCode.trim() || undefined,
    createBy: filters.createBy.trim() || undefined,
    resultCode: filters.resultCode || undefined,
    batchId: batch || undefined,
    correlationId: filters.correlationId.trim() || undefined,
    traceId: filters.traceId.trim() || undefined,
    startAt: start?.toISOString(),
    endAt: end?.toISOString(),
  }
}

async function loadRecords(): Promise<void> {
  if (routeInvalid.value) return
  const sequence = ++requestSequence
  controller?.abort()
  controller = new AbortController()
  loading.value = true
  errorMessage.value = ''
  try {
    const result = await listGlobalAuditRecords(
      { ...appliedFilters.value, pageNum: pageNum.value, pageSize: pageSize.value },
      controller.signal,
    )
    if (sequence !== requestSequence) return
    records.value = result.list
    total.value = result.total
    const lastPage = Math.max(1, Math.ceil(result.total / pageSize.value))
    if (pageNum.value > lastPage) {
      await navigate(appliedFilters.value, lastPage, pageSize.value, true)
    }
  } catch (error) {
    if (sequence !== requestSequence) return
    records.value = []
    total.value = 0
    errorMessage.value =
      error instanceof ApiError && error.httpStatus === 403
        ? '没有查看审计日志的权限'
        : '日志加载失败，请稍后重试'
  } finally {
    if (sequence === requestSequence) loading.value = false
  }
}

async function search(): Promise<void> {
  const nextFilters = buildFilters()
  if (!nextFilters) return
  await navigate(nextFilters, 1, pageSize.value)
}

async function reset(): Promise<void> {
  Object.assign(filters, {
    resourceType: '',
    resourceId: '',
    actionCode: '',
    createBy: '',
    resultCode: '',
    batchId: '',
    correlationId: '',
    traceId: '',
  })
  timeRange.value = recentAuditWeek()
  await search()
}

function changePage(page: number, size: number): void {
  if (routeInvalid.value) return
  if (page === pageNum.value && size === pageSize.value) return
  void navigate(appliedFilters.value, size === pageSize.value ? page : 1, size)
}

async function navigate(
  request: ListGlobalAuditRequest,
  page: number,
  size: number,
  replace = false,
): Promise<void> {
  const query = auditRouteQuery({ ...request, pageNum: page, pageSize: size })
  if (isSameAuditQuery(route.query, query)) {
    restoreRoute()
    return
  }
  const location = { name: 'AuditLog', query }
  if (replace) await router.replace(location)
  else await router.push(location)
}

function restoreRoute(): void {
  if (route.name !== 'AuditLog') return
  requestSequence += 1
  controller?.abort()
  loading.value = false
  errorMessage.value = ''
  detailVisible.value = false
  const state = readAuditRoute(route.query)
  Object.assign(filters, state.filters)
  timeRange.value = state.timeRange
  pageNum.value = state.pageNum
  pageSize.value = state.pageSize
  if (filters.batchId || filters.correlationId || filters.traceId) advanced.value = true
  const request = buildFilters()
  routeInvalid.value = Boolean(state.error || !request)
  if (state.error) validationError.value = state.error
  if (routeInvalid.value || !request) {
    records.value = []
    total.value = 0
    return
  }
  appliedFilters.value = request
  const canonical = auditRouteQuery({
    ...request,
    pageNum: pageNum.value,
    pageSize: pageSize.value,
  })
  if (!isSameAuditQuery(route.query, canonical)) {
    void router.replace({ name: 'AuditLog', query: canonical })
    return
  }
  void loadRecords()
}

function asRecord(row: unknown): AuditRecord {
  return row as AuditRecord
}

function showDetails(record: AuditRecord): void {
  selectedRecord.value = record
  detailVisible.value = true
}

watch(() => route.query, restoreRoute, { immediate: true })
onBeforeUnmount(() => {
  requestSequence += 1
  controller?.abort()
})
</script>

<template>
  <section class="audit-page">
    <header class="audit-page__header">
      <div class="audit-page__title">
        <ScrollText :size="20" :stroke-width="1.8" />
        <h1>审计日志</h1>
      </div>
      <PageRefreshButton :action="loadRecords" :loading="loading" :disabled="routeInvalid" />
    </header>

    <form class="audit-filters" aria-label="审计日志筛选" @submit.prevent="search">
      <div class="audit-filters__grid">
        <label class="audit-filters__field"
          ><span>资源类型</span>
          <el-select
            v-model="filters.resourceType"
            filterable
            allow-create
            default-first-option
            clearable
            placeholder="全部资源"
            aria-label="资源类型"
          >
            <el-option
              v-for="(label, value) in auditResourceLabels"
              :key="value"
              :label="label"
              :value="value"
            />
          </el-select>
        </label>
        <label class="audit-filters__field"
          ><span>资源 ID</span
          ><el-input
            v-model="filters.resourceId"
            clearable
            maxlength="512"
            placeholder="包括已删除资源的原 ID"
            aria-label="资源 ID"
        /></label>
        <label class="audit-filters__field"
          ><span>操作动作</span
          ><el-input
            v-model="filters.actionCode"
            clearable
            maxlength="512"
            placeholder="如 secret.update"
            aria-label="操作动作"
        /></label>
        <label class="audit-filters__field"
          ><span>操作人</span
          ><el-input
            v-model="filters.createBy"
            clearable
            maxlength="512"
            placeholder="工号 / 用户 ID"
            aria-label="操作人"
        /></label>
        <label class="audit-filters__field"
          ><span>操作结果</span>
          <el-select
            v-model="filters.resultCode"
            clearable
            placeholder="全部结果"
            aria-label="操作结果"
            ><el-option label="成功" value="success" /><el-option label="失败" value="failure"
          /></el-select>
        </label>
        <div class="audit-filters__field audit-filters__time">
          <span>操作时间</span>
          <el-date-picker
            v-model="timeRange"
            type="datetimerange"
            start-placeholder="开始时间"
            end-placeholder="结束时间"
            range-separator="至"
            format="YYYY-MM-DD HH:mm"
            aria-label="操作时间范围"
          />
        </div>
        <div class="audit-filters__commands">
          <button
            type="button"
            class="audit-filters__advanced"
            :aria-expanded="advanced"
            aria-controls="audit-advanced-filters"
            @click="advanced = !advanced"
          >
            更多筛选<ChevronDown :size="14" :class="{ 'is-expanded': advanced }" />
          </button>
          <el-button @click="reset">重置</el-button>
          <el-button type="primary" native-type="submit" :loading="loading">查询</el-button>
        </div>
        <template v-if="advanced">
          <div id="audit-advanced-filters" class="audit-filters__extra">
            <label class="audit-filters__field"
              ><span>批次 ID</span
              ><el-input
                v-model="filters.batchId"
                clearable
                maxlength="36"
                placeholder="批量操作的 UUID"
                aria-label="批次 ID"
            /></label>
            <label class="audit-filters__field"
              ><span>请求关联 ID</span
              ><el-input
                v-model="filters.correlationId"
                clearable
                maxlength="512"
                placeholder="精确匹配请求关联 ID"
                aria-label="请求关联 ID"
            /></label>
            <label class="audit-filters__field"
              ><span>Trace ID</span
              ><el-input
                v-model="filters.traceId"
                clearable
                maxlength="512"
                placeholder="精确匹配 Trace ID"
                aria-label="Trace ID"
            /></label>
          </div>
        </template>
      </div>
      <p v-if="validationError" class="audit-filters__error" role="alert">{{ validationError }}</p>
    </form>

    <main class="audit-results">
      <div class="audit-results__caption">
        <span
          >操作记录 <strong>{{ total }}</strong></span
        ><span
          >{{ appliedFilters.startAt ? '所选时间范围' : '不限时间' }} · 支持查询已删除资源</span
        >
      </div>
      <div v-loading="loading" class="audit-results__body" :aria-busy="loading">
        <div v-if="errorMessage" class="audit-results__state" role="alert">
          <p>{{ errorMessage }}</p>
          <el-button :disabled="loading" @click="loadRecords">重新加载</el-button>
        </div>
        <el-table
          v-else
          :data="records"
          row-key="id"
          height="100%"
          table-layout="fixed"
          aria-label="审计日志列表"
          empty-text="没有符合筛选条件的日志"
        >
          <el-table-column label="操作时间" width="184"
            ><template #default="{ row }">{{
              formatDateTime(row.createAt)
            }}</template></el-table-column
          >
          <el-table-column label="资源" min-width="230">
            <template #default="{ row }"
              ><div class="audit-cell">
                <strong>{{
                  row.resourceName || auditResourceLabels[row.resourceType] || row.resourceType
                }}</strong
                ><small
                  >{{ auditResourceLabels[row.resourceType] || row.resourceType
                  }}<span v-if="row.resourceId"> · {{ row.resourceId }}</span></small
                >
              </div></template
            >
          </el-table-column>
          <el-table-column label="操作动作" min-width="176"
            ><template #default="{ row }"
              ><div class="audit-cell">
                <span>{{ auditActionLabel(row.actionCode) }}</span
                ><small v-if="auditActionLabel(row.actionCode) !== row.actionCode">{{
                  row.actionCode
                }}</small>
              </div></template
            ></el-table-column
          >
          <el-table-column label="操作人" min-width="148"
            ><template #default="{ row }"
              ><div class="audit-cell">
                <span>{{ auditActor(asRecord(row)) }}</span
                ><small v-if="row.createByName">{{ row.createBy }}</small>
              </div></template
            ></el-table-column
          >
          <el-table-column label="结果" width="86"
            ><template #default="{ row }"
              ><span
                class="audit-result"
                :class="row.resultCode === 'success' ? 'is-success' : 'is-failure'"
                >{{ row.resultCode === 'success' ? '成功' : '失败' }}</span
              ></template
            ></el-table-column
          >
          <el-table-column
            prop="correlationId"
            label="请求关联 ID"
            min-width="180"
            show-overflow-tooltip
            ><template #default="{ row }">{{ row.correlationId || '—' }}</template></el-table-column
          >
          <el-table-column label="详情" width="76" fixed="right"
            ><template #default="{ row }"
              ><button
                type="button"
                class="audit-detail-button"
                aria-label="查看日志详情"
                @click="showDetails(asRecord(row))"
              >
                <FileText :size="16" :stroke-width="1.8" /></button></template
          ></el-table-column>
        </el-table>
      </div>
      <footer class="audit-results__pagination">
        <el-pagination
          :current-page="pageNum"
          :page-size="pageSize"
          :page-sizes="auditPageSizes"
          :total="total"
          :disabled="loading || routeInvalid"
          layout="total, sizes, prev, pager, next"
          :pager-count="5"
          @update:current-page="changePage($event, pageSize)"
          @update:page-size="changePage(1, $event)"
        />
      </footer>
    </main>
    <AuditRecordDialog v-model="detailVisible" :record="selectedRecord" />
  </section>
</template>

<style scoped lang="scss">
.audit-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  min-width: 0;
  overflow: auto;
  color: var(--v-text-primary);
  &__header {
    min-height: 64px;
    padding: 16px 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    border-bottom: 1px solid var(--v-divider);
    background: var(--v-surface-bg);
  }
  &__title {
    display: flex;
    align-items: center;
    gap: 10px;
    svg {
      color: var(--v-text-secondary);
    }
    h1 {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
    }
  }
}
.audit-filters {
  padding: 18px 24px;
  border-bottom: 1px solid var(--v-divider);
  background: var(--v-surface-bg);
  &__grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 14px 18px;
  }
  &__field {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    > span {
      font-size: 12px;
      color: var(--v-text-secondary);
    }
  }
  &__time {
    grid-column: span 2;
    :deep(.el-date-editor) {
      width: 100%;
      min-width: 0;
      box-sizing: border-box;
    }
  }
  &__commands {
    display: flex;
    align-items: flex-end;
    justify-content: flex-end;
    gap: 10px;
    :deep(.el-button + .el-button) {
      margin: 0;
    }
  }
  &__advanced {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 0;
    height: 32px;
    background: none;
    border: 0;
    color: var(--v-text-secondary);
    cursor: pointer;
    font-size: 12px;
    white-space: nowrap;
    svg {
      transition: transform 0.15s;
    }
    .is-expanded {
      transform: rotate(180deg);
    }
  }
  &__extra {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 18px;
    padding-top: 14px;
    border-top: 1px solid var(--v-divider);
  }
  &__error {
    margin: 12px 0 0;
    color: var(--v-color-danger);
    font-size: 13px;
  }
  :deep(.el-input__wrapper),
  :deep(.el-select__wrapper) {
    border-radius: var(--v-radius-dialog-action);
  }
}
.audit-results {
  flex: 1;
  min-height: 260px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 0 24px;
  background: var(--v-surface-bg);
  &__caption {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 6px 16px;
    padding: 16px 0;
    font-size: 13px;
    color: var(--v-text-secondary);
    strong {
      margin-left: 6px;
      color: var(--v-text-primary);
      font-weight: 500;
    }
  }
  &__body {
    flex: 1;
    min-height: 160px;
    min-width: 0;
    overflow: hidden;
  }
  &__state {
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 12px;
    color: var(--v-text-secondary);
    font-size: 13px;
  }
  &__pagination {
    flex-shrink: 0;
    display: flex;
    justify-content: flex-end;
    padding: 16px 0;
    overflow-x: auto;
  }
  :deep(.el-table td.el-table__cell) {
    padding: 10px 8px;
  }
  :deep(.el-table th.el-table__cell) {
    padding: 0 8px;
  }
}
.audit-cell {
  display: flex;
  flex-direction: column;
  gap: 3px;
  line-height: 1.5;
  overflow: hidden;
  span,
  strong,
  small {
    white-space: nowrap;
    text-overflow: ellipsis;
    overflow: hidden;
  }
  strong {
    font-weight: 500;
  }
  small {
    color: var(--v-text-secondary);
    font-size: 12px;
  }
}
.audit-result {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  &::before {
    content: '';
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
  }
  &.is-success {
    color: var(--v-color-success);
  }
  &.is-failure {
    color: var(--v-color-danger);
  }
}
.audit-detail-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  width: 30px;
  height: 30px;
  background: var(--v-surface-bg);
  border: 1px solid var(--v-surface-border);
  border-radius: 50%;
  color: var(--v-text-secondary);
  cursor: pointer;
  &:hover {
    color: var(--el-color-primary);
    border-color: var(--el-color-primary);
  }
}
@media (max-width: 1100px) {
  .audit-filters__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .audit-filters__time {
    grid-column: auto;
  }
  .audit-filters__commands {
    grid-column: 1 / -1;
  }
}
@media (max-width: 600px) {
  .audit-page__header {
    padding: 12px 16px;
  }
  .audit-filters {
    padding: 14px 16px;
    &__grid {
      gap: 12px;
    }
    &__time {
      grid-column: 1 / -1;
      :deep(.el-range-input) {
        font-size: 12px;
      }
      :deep(.el-range-separator) {
        padding: 0 4px;
      }
    }
    &__extra {
      grid-template-columns: 1fr;
      gap: 12px;
    }
  }
  .audit-results {
    padding: 0 16px;
    &__caption {
      font-size: 12px;
    }
    &__pagination {
      justify-content: flex-start;
    }
  }
}
</style>
