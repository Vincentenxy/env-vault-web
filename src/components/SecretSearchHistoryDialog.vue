<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ArrowLeft, History } from '@lucide/vue'
import type { SecretBatchDetailItem, SecretHistoryItem, SecretHistoryResponse } from '@/api/secret'
import { getSecretHistory, getSecretBatchDetail } from '@/api/secret'
import type { SecretSearchEnvironmentValue, SecretSearchGroup } from '@/types/secret-search'
import { formatDateTime } from '@/utils/format'
import SecretValuePreview from './SecretValuePreview.vue'

const props = defineProps<{
  modelValue: boolean
  secret: SecretSearchGroup
  history?: SecretHistoryResponse
  batches?: Record<string, SecretBatchDetailItem[]>
}>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})
const selected = ref<{ item: SecretHistoryItem; env: SecretSearchEnvironmentValue } | null>(null)
const activeTab = ref('version')
const liveHistory = ref<SecretHistoryResponse>({})
const liveBatches = ref<Record<string, SecretBatchDetailItem[]>>({})
const historyLoading = ref(false)
const batchLoading = ref(false)
const historyError = ref('')
const batchError = ref('')
const historyPage = ref(0)
const historyData = computed(() => props.history ?? liveHistory.value)
const hasMore = computed(
  () =>
    props.history === undefined &&
    Object.values(liveHistory.value).some((env) => env.list.length < env.total),
)
let requestSequence = 0
let batchSequence = 0
watch(
  () => [props.modelValue, props.secret.groupId],
  () => {
    requestSequence += 1
    batchSequence += 1
    selected.value = null
    activeTab.value = 'version'
    liveHistory.value = {}
    liveBatches.value = {}
    historyPage.value = 0
    historyError.value = ''
    batchError.value = ''
    historyLoading.value = false
    batchLoading.value = false
    if (props.modelValue && props.history === undefined) void loadHistory()
  },
  { immediate: true },
)

// 首次打开只查历史第一页，后续由加载更多追加，各环境分别保留 total
async function loadHistory(): Promise<void> {
  if (historyLoading.value) return
  const sequence = requestSequence
  historyLoading.value = true
  historyError.value = ''
  try {
    const page = historyPage.value + 1
    const response = await getSecretHistory({
      groupId: props.secret.groupId,
      envList: props.secret.values.map((env) => env.envCode),
      pageNum: page,
      pageSize: 20,
    })
    if (sequence !== requestSequence || !props.modelValue) return
    for (const [envId, history] of Object.entries(response)) {
      const previous = liveHistory.value[envId]?.list ?? []
      const unique = new Map([...previous, ...history.list].map((item) => [item.id, item]))
      liveHistory.value[envId] = { total: history.total, list: [...unique.values()] }
    }
    historyPage.value = page
  } catch (error) {
    if (sequence === requestSequence)
      historyError.value = error instanceof Error ? error.message : '历史加载失败'
  } finally {
    if (sequence === requestSequence) historyLoading.value = false
  }
}

async function loadBatch(): Promise<void> {
  const batchId = selected.value?.item.batchId
  if (!batchId || props.batches || liveBatches.value[batchId]) return
  const sequence = ++batchSequence
  batchLoading.value = true
  batchError.value = ''
  try {
    const data = await getSecretBatchDetail({
      batchId,
      envList: props.secret.values.map((env) => env.envCode),
    })
    if (sequence === batchSequence && props.modelValue) liveBatches.value[batchId] = data
  } catch (error) {
    if (sequence === batchSequence)
      batchError.value = error instanceof Error ? error.message : '批次加载失败'
  } finally {
    if (sequence === batchSequence) batchLoading.value = false
  }
}

watch([activeTab, () => selected.value?.item.batchId], () => {
  batchSequence += 1
  batchLoading.value = false
  batchError.value = ''
  if (activeTab.value === 'batch') void loadBatch()
})

// 与秘钥管理页相同，先按提交批次汇总，再按五分钟时间窗口展示各环境版本
const rows = computed(() => {
  const batches = new Map<
    string,
    { id: string; timestamp: number; versions: Record<string, SecretHistoryItem> }
  >()
  const allowed = new Set(props.secret.values.map((env) => env.envCode))
  for (const history of Object.values(historyData.value)) {
    for (const item of history.list) {
      if (!allowed.has(item.envCode)) continue
      const batch = batches.get(item.batchId) ?? { id: item.batchId, timestamp: 0, versions: {} }
      batch.timestamp = Math.max(batch.timestamp, Date.parse(item.createAt))
      batch.versions[item.envCode] = item
      batches.set(item.batchId, batch)
    }
  }
  let previousWindow = -1
  return [...batches.values()]
    .sort((a, b) => b.timestamp - a.timestamp)
    .map((batch) => {
      const windowStart = Math.floor(batch.timestamp / 300_000) * 300_000
      const windowLabel =
        windowStart === previousWindow
          ? ''
          : `${formatDateTime(new Date(windowStart).toISOString()).slice(0, 16)} ~ ${formatDateTime(new Date(windowStart + 299_999).toISOString()).slice(11, 16)}`
      previousWindow = windowStart
      return { ...batch, windowLabel }
    })
})
const batchDetails = computed(() =>
  selected.value ? ((props.batches ?? liveBatches.value)[selected.value.item.batchId] ?? []) : [],
)

function openVersion(item: SecretHistoryItem, env: SecretSearchEnvironmentValue): void {
  selected.value = { item, env }
  activeTab.value = 'version'
}

function batchEntries(detail: SecretBatchDetailItem) {
  return props.secret.values.flatMap((env) => {
    const item = detail.versions[env.envId]
    return item ? [{ env, item }] : []
  })
}
</script>
<template>
  <el-dialog
    v-model="visible"
    width="980px"
    class="vault-card-edit-dialog secret-search-history-dialog"
    :close-on-click-modal="false"
    append-to-body
    align-center
    destroy-on-close
  >
    <template #header>
      <div class="search-history__heading">
        <button
          v-if="selected"
          type="button"
          class="search-history__back"
          aria-label="返回历史列表"
          @click="selected = null"
        >
          <ArrowLeft :size="17" />
        </button>
        <span>历史版本</span><code>{{ secret.key }}</code>
      </div>
    </template>
    <div class="search-history">
      <template v-if="!selected">
        <div class="search-history__context">
          <span
            >{{ secret.scope.project.name }} /
            {{ secret.scope.folders.map((folder) => folder.name).join(' / ') }}</span
          ><el-tag v-if="history !== undefined" size="small" type="info" effect="plain"
            >模拟数据</el-tag
          >
        </div>
        <el-alert v-if="historyError" :title="historyError" type="error" :closable="false">
          <el-button link type="danger" @click="loadHistory">重试</el-button>
        </el-alert>
        <div v-loading="historyLoading" class="search-history__list">
          <el-table :data="rows" height="100%">
            <el-table-column label="修改时间" width="205"
              ><template #default="{ row }"
                ><time>{{ row.windowLabel }}</time></template
              ></el-table-column
            >
            <el-table-column
              v-for="env in secret.values"
              :key="env.envId"
              :label="`${env.envCode.toUpperCase()} ${env.envName}`"
              min-width="175"
            >
              <template #default="{ row }"
                ><button
                  v-if="row.versions[env.envCode]"
                  type="button"
                  class="search-history__record"
                  :aria-label="`查看${env.envName}环境 v${row.versions[env.envCode].version}版本详情`"
                  @click="openVersion(row.versions[env.envCode], env)"
                >
                  <span class="search-history__version-tag" :class="`is-${env.envCode}`"
                    >v{{ row.versions[env.envCode].version }}</span
                  ><code>{{
                    !row.versions[env.envCode].value
                      ? '空值'
                      : env.masked
                        ? '••••••••'
                        : row.versions[env.envCode].value
                  }}</code></button
                ><span v-else class="search-history__muted">—</span></template
              >
            </el-table-column>
          </el-table>
        </div>
        <div v-if="hasMore" class="search-history__more">
          <el-button link type="primary" :loading="historyLoading" @click="loadHistory"
            >加载更多</el-button
          >
        </div>
      </template>
      <el-tabs v-else v-model="activeTab" class="search-history__tabs">
        <el-tab-pane label="版本详情" name="version">
          <section class="search-history__detail">
            <div class="search-history__summary">
              <History :size="19" /><strong>{{ secret.key }}</strong
              ><span class="search-history__version-tag" :class="`is-${selected.env.envCode}`"
                >v{{ selected.item.version }}</span
              ><span class="search-history__environment"
                >{{ selected.env.envCode.toUpperCase() }} {{ selected.env.envName }}</span
              >
            </div>
            <div class="search-history__value">
              <header>环境值</header>
              <SecretValuePreview
                :key="selected.item.id"
                :value="selected.item.value"
                :masked="selected.env.masked"
                expanded
              />
            </div>
            <dl class="search-history__metadata">
              <div>
                <dt>说明</dt>
                <dd>{{ secret.remark || '—' }}</dd>
              </div>
              <div>
                <dt>版本修改信息</dt>
                <dd>{{ selected.item.commitMsg || '—' }}</dd>
              </div>
              <div>
                <dt>修改人</dt>
                <dd>{{ selected.item.createByName || selected.item.createBy }}</dd>
              </div>
              <div>
                <dt>修改时间</dt>
                <dd>{{ formatDateTime(selected.item.createAt) }}</dd>
              </div>
              <div>
                <dt>批次 ID</dt>
                <dd>
                  <code>{{ selected.item.batchId }}</code>
                </dd>
              </div>
              <div>
                <dt>版本 ID</dt>
                <dd>
                  <code>{{ selected.item.id }}</code>
                </dd>
              </div>
            </dl>
          </section>
        </el-tab-pane>
        <el-tab-pane label="批次详情" name="batch">
          <div v-loading="batchLoading" class="search-history__batch">
            <el-alert v-if="batchError" :title="batchError" type="error" :closable="false">
              <el-button link type="danger" @click="loadBatch">重试</el-button>
            </el-alert>
            <section v-for="detail in batchDetails" :key="detail.groupId">
              <header>
                <code>{{ detail.key }}</code
                ><span>{{ detail.remark }}</span>
              </header>
              <el-table :data="batchEntries(detail)">
                <el-table-column label="环境" width="100"
                  ><template #default="{ row }"
                    >{{ row.env.envCode.toUpperCase() }} {{ row.env.envName }}</template
                  ></el-table-column
                >
                <el-table-column label="版本" width="70"
                  ><template #default="{ row }"
                    ><span class="search-history__version-tag" :class="`is-${row.env.envCode}`"
                      >v{{ row.item.version }}</span
                    ></template
                  ></el-table-column
                >
                <el-table-column label="环境值" min-width="215"
                  ><template #default="{ row }"
                    ><SecretValuePreview
                      :key="row.item.id"
                      :value="row.item.value"
                      :masked="row.env.masked" /></template
                ></el-table-column>
                <el-table-column label="版本修改信息" prop="item.commitMsg" min-width="150" />
                <el-table-column label="修改人" prop="item.createByName" width="100" />
                <el-table-column label="修改时间" width="180"
                  ><template #default="{ row }">{{
                    formatDateTime(row.item.createAt)
                  }}</template></el-table-column
                >
              </el-table>
            </section>
            <el-empty
              v-if="!batchLoading && !batchError && !batchDetails.length"
              description="暂无批次记录"
            />
          </div>
        </el-tab-pane>
      </el-tabs>
    </div>
    <template #footer><el-button type="primary" @click="visible = false">关闭</el-button></template>
  </el-dialog>
</template>
<style lang="scss">
.secret-search-history-dialog.el-dialog {
  width: 980px !important;
  --el-color-primary: var(--v-brand-primary);
  .el-dialog__body {
    padding: 0;
    overflow: hidden;
  }
}
</style>
<style scoped lang="scss">
.search-history {
  display: flex;
  flex-direction: column;
  height: 520px;
  max-height: calc(90vh - 118px);
  min-height: 0;
  &__more {
    padding: 8px 20px;
    text-align: center;
    border-top: 1px solid var(--v-divider);
  }
  &__heading {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
    padding-right: 24px;
    font-size: 14px;
    code {
      font-size: 12px;
      color: var(--v-text-secondary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
  &__back {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--v-surface-border);
    border-radius: 50%;
    width: 30px;
    height: 30px;
    background: transparent;
    color: var(--v-text-primary);
    cursor: pointer;
    flex-shrink: 0;
  }
  &__context {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding: 16px 22px;
    font-size: 12px;
    color: var(--v-text-secondary);
    overflow-wrap: anywhere;
  }
  &__list {
    min-height: 0;
    flex: 1;
  }
  :deep(.el-table td.el-table__cell),
  :deep(.el-table th.el-table__cell) {
    padding: 6px;
    font-size: 12px;
  }
  &__record {
    display: flex;
    align-items: center;
    width: 100%;
    gap: 8px;
    min-height: 34px;
    border: 0;
    background: transparent;
    padding: 0;
    color: var(--v-text-primary);
    cursor: pointer;
    code {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 12px;
    }
  }
  &__version-tag {
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
    min-height: 22px;
    padding: 0 7px;
    font-size: 11px;
    font-weight: 600;
    border: 1px solid var(--v-surface-border);
    border-radius: 5px;
    background: var(--v-surface-bg-subtle);
    color: var(--v-brand-primary);
    &.is-dev {
      color: #0891b2;
      background: #ecfeff;
      border-color: #a5f3fc;
    }
    &.is-test {
      color: #d97706;
      background: #fffbeb;
      border-color: #fde68a;
    }
    &.is-sim {
      color: #7c3aed;
      background: #f5f3ff;
      border-color: #ddd6fe;
    }
    &.is-prod {
      color: #ef4444;
      background: #fff1f2;
      border-color: #fecdd3;
    }
  }
  &__muted,
  time {
    color: var(--v-text-tertiary);
    font-size: 11px;
  }
  &__tabs {
    display: flex;
    flex-direction: column;
    min-height: 0;
    height: 100%;
    :deep(.el-tabs__header) {
      margin: 0;
      padding: 0 22px;
      background: var(--v-surface-bg-subtle);
    }
    :deep(.el-tabs__item) {
      font-size: 12px;
      height: 44px;
    }
    :deep(.el-tabs__content) {
      flex: 1;
      min-height: 0;
      overflow: auto;
    }
  }
  &__detail {
    padding: 20px 22px;
  }
  &__summary {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    strong {
      font-size: 14px;
      overflow-wrap: anywhere;
    }
    svg {
      color: #d97706;
    }
  }
  &__environment {
    margin-left: auto;
    color: var(--v-text-secondary);
    font-size: 12px;
  }
  &__value {
    margin-top: 16px;
    border: 1px solid var(--v-surface-border);
    border-radius: 8px;
    background: var(--v-surface-bg-subtle);
    header {
      padding: 10px 14px;
      border-bottom: 1px solid var(--v-divider);
      font-size: 12px;
      color: var(--v-text-secondary);
    }
    > div {
      padding: 14px;
      min-height: 96px;
    }
  }
  &__metadata {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0 28px;
    margin-top: 18px;
    > div {
      display: grid;
      grid-template-columns: 100px minmax(0, 1fr);
      gap: 10px;
      padding: 11px 0;
      border-bottom: 1px solid var(--v-divider);
    }
    dt,
    dd {
      margin: 0;
      font-size: 12px;
      line-height: 1.6;
      overflow-wrap: anywhere;
    }
    dt {
      color: var(--v-text-tertiary);
    }
    dd {
      color: var(--v-text-primary);
    }
    code {
      font-size: 11px;
    }
  }
  &__batch {
    padding: 8px 22px 20px;
    > section {
      padding: 16px 0;
      border-bottom: 1px solid var(--v-divider);
    }
    header {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px;
      margin-bottom: 12px;
      code {
        font-size: 13px;
        font-weight: 600;
      }
      span {
        color: var(--v-text-tertiary);
        font-size: 12px;
      }
    }
  }
}
@media (max-width: 650px) {
  .search-history__metadata {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
