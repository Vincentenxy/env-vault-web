<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { ArrowLeft, Delete, Plus } from '@element-plus/icons-vue'
import { createTag, type TagForm } from '@/api/tag'
import { useAuthStore } from '@/stores/auth'
import { ApiError } from '@/types/api'

interface DraftRow extends TagForm {
  rowId: string
}

const props = defineProps<{ tenantId: string }>()
const emit = defineEmits<{
  back: []
  created: []
  busy: [value: boolean]
  restored: [hasDrafts: boolean]
}>()
const auth = useAuthStore()
const rows = ref<DraftRow[]>([])
const errors = ref<Record<string, string>>({})
const submitting = ref(false)
const pendingId = ref('')
const storageFailed = ref(false)
const tableWrap = ref<HTMLElement>()
const progress = ref(0)
const submitTotal = ref(0)
const storageKey = computed(() => {
  const userId = auth.currentUser?.userId
  return userId && props.tenantId
    ? `env-vault:tag-drafts:v1:${encodeURIComponent(userId)}:${encodeURIComponent(props.tenantId)}`
    : ''
})
let loadedKey = ''
let restoring = false
let disposed = false

function draftId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

// 只恢复标签表单字段，损坏的本地数据不会影响标签列表和已有标签
function readDrafts(key: string): DraftRow[] {
  const value: unknown = JSON.parse(localStorage.getItem(key) ?? '[]')
  if (!Array.isArray(value)) return []
  return value.flatMap((row: unknown) => {
    if (!row || typeof row !== 'object') return []
    const item = row as Record<string, unknown>
    if (
      typeof item.code !== 'string' ||
      typeof item.name !== 'string' ||
      typeof item.remark !== 'string'
    )
      return []
    return [
      {
        rowId: typeof item.rowId === 'string' ? item.rowId : draftId(),
        code: item.code,
        name: item.name,
        remark: item.remark,
        allowValueSearch: typeof item.allowValueSearch === 'boolean' ? item.allowValueSearch : true,
      },
    ]
  })
}

function writeDrafts(key: string, drafts: DraftRow[]): void {
  if (drafts.length) localStorage.setItem(key, JSON.stringify(drafts))
  else localStorage.removeItem(key)
}

function persist(): void {
  if (restoring || !loadedKey) return
  try {
    writeDrafts(loadedKey, rows.value)
    storageFailed.value = false
  } catch {
    storageFailed.value = true
  }
}

watch(
  storageKey,
  (key) => {
    restoring = true
    loadedKey = key
    errors.value = {}
    storageFailed.value = false
    try {
      rows.value = key ? readDrafts(key) : []
    } catch {
      rows.value = []
      storageFailed.value = true
    } finally {
      restoring = false
    }
    emit('restored', rows.value.length > 0)
  },
  { immediate: true, flush: 'sync' },
)
// 同步保存每次输入，关闭弹框或直接刷新也不会遗漏最后一次编辑
watch(rows, persist, { deep: true, flush: 'sync' })
watch(submitting, (value) => emit('busy', value), { flush: 'sync' })

async function add(): Promise<void> {
  if (submitting.value || !storageKey.value) return
  rows.value.push({ rowId: draftId(), code: '', name: '', remark: '', allowValueSearch: true })
  await nextTick()
  const input = tableWrap.value?.querySelector<HTMLInputElement>('tbody tr:last-child input')
  input?.focus({ preventScroll: true })
  if (tableWrap.value) tableWrap.value.scrollTop = tableWrap.value.scrollHeight
}

function open(): void {
  if (!rows.value.length) void add()
}
defineExpose({ open })

function remove(rowId: string): void {
  if (submitting.value) return
  rows.value = rows.value.filter((row) => row.rowId !== rowId)
  delete errors.value[rowId]
}

function filled(row: TagForm): boolean {
  return !!(row.code.trim() || row.name.trim() || row.remark.trim())
}

function validate(drafts: DraftRow[]): boolean {
  errors.value = {}
  const counts = new Map<string, number>()
  for (const row of drafts) counts.set(row.code.trim(), (counts.get(row.code.trim()) ?? 0) + 1)
  for (const row of drafts) {
    const messages: string[] = []
    const code = row.code.trim()
    if (!/^[a-z][a-z0-9_-]{0,63}$/.test(code))
      messages.push('Code 须以小写字母开头，仅支持小写字母、数字、中横线和下划线，最多 64 字符')
    if (!row.name.trim()) messages.push('请输入名称')
    else if ([...row.name.trim()].length > 64) messages.push('名称不能超过 64 个字符')
    if ([...row.remark.trim()].length > 1024) messages.push('备注不能超过 1024 个字符')
    if ((counts.get(code) ?? 0) > 1) messages.push('草稿中的 Code 重复')
    if (messages.length) errors.value[row.rowId] = messages.join('；')
  }
  return !Object.keys(errors.value).length
}

// 每个成功响应立即移除对应草稿，部分失败时只保留尚未创建的行
function created(key: string, rowId: string): void {
  if (key === loadedKey && !disposed) removeCreatedRow(rowId)
  else {
    try {
      writeDrafts(
        key,
        readDrafts(key).filter((row) => row.rowId !== rowId),
      )
    } catch {
      // 账号切换后不再修改新账号界面，原草稿可在下次打开时核对
    }
  }
}

function removeCreatedRow(rowId: string): void {
  rows.value = rows.value.filter((row) => row.rowId !== rowId)
  delete errors.value[rowId]
}

async function submit(): Promise<void> {
  if (submitting.value || !storageKey.value) return
  const drafts = rows.value.filter(filled)
  if (!drafts.length) {
    ElMessage.warning('请至少填写一个 Tag')
    return
  }
  if (!validate(drafts)) return
  const key = storageKey.value
  const tenantId = props.tenantId
  const token = auth.token
  const sameContext = () => !disposed && key === storageKey.value && token === auth.token
  submitting.value = true
  progress.value = 0
  submitTotal.value = drafts.length
  let success = 0
  try {
    for (const row of drafts) {
      if (!sameContext()) break
      pendingId.value = row.rowId
      try {
        await createTag(
          {
            tenantId,
            code: row.code.trim(),
            name: row.name.trim(),
            remark: row.remark.trim(),
            allowValueSearch: row.allowValueSearch,
          },
          { silent: true },
        )
        created(key, row.rowId)
        success += 1
      } catch (error) {
        if (sameContext())
          errors.value[row.rowId] = error instanceof ApiError ? error.message : '创建失败，请重试'
        // 认证、启动状态或网络异常时停止后续请求，剩余行继续保留
        if (
          !(error instanceof ApiError) ||
          error.code === -2 ||
          error.httpStatus === 401 ||
          error.httpStatus === 403 ||
          error.httpStatus >= 500
        )
          break
      } finally {
        progress.value += 1
      }
    }
    if (!sameContext()) return
    if (success) {
      emit('created')
      if (success === drafts.length) {
        rows.value = rows.value.filter(filled)
        ElMessage.success(`已创建 ${success} 个 Tag`)
        emit('back')
      } else ElMessage.warning(`已创建 ${success} 个 Tag，其余草稿已保留`)
    }
  } finally {
    pendingId.value = ''
    submitting.value = false
  }
}

onBeforeUnmount(() => {
  disposed = true
})
</script>

<template>
  <section class="tag-create-panel" aria-label="批量新建 Tag">
    <header class="resource-members__toolbar">
      <div class="resource-members__heading">
        <el-button
          circle
          size="small"
          :icon="ArrowLeft"
          aria-label="返回 Tag 列表"
          :disabled="submitting"
          @click="emit('back')"
        />
        <strong>新建 Tag</strong><span>{{ rows.length }} 项</span>
      </div>
      <button
        type="button"
        class="resource-members__add"
        aria-label="添加 Tag 行"
        :disabled="submitting || !storageKey"
        @click="add"
      >
        <el-icon><Plus /></el-icon>
      </button>
    </header>
    <div ref="tableWrap" class="resource-members__table-wrap tag-create-panel__table-wrap">
      <table class="tag-create-panel__table">
        <colgroup>
          <col style="width: 42px" />
          <col style="width: 168px" />
          <col style="width: 142px" />
          <col />
          <col style="width: 108px" />
          <col style="width: 60px" />
        </colgroup>
        <thead>
          <tr>
            <th>#</th>
            <th>Code</th>
            <th>名称</th>
            <th>备注</th>
            <th>允许值检索</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="(row, index) in rows" :key="row.rowId">
            <tr :class="{ 'is-invalid': errors[row.rowId] }">
              <td>{{ index + 1 }}</td>
              <td>
                <el-input
                  v-model="row.code"
                  :aria-label="`第 ${index + 1} 行 Code`"
                  maxlength="64"
                  placeholder="Code"
                  :disabled="submitting"
                  @input="delete errors[row.rowId]"
                />
              </td>
              <td>
                <el-input
                  v-model="row.name"
                  :aria-label="`第 ${index + 1} 行名称`"
                  maxlength="64"
                  placeholder="名称"
                  :disabled="submitting"
                  @input="delete errors[row.rowId]"
                />
              </td>
              <td>
                <el-input
                  v-model="row.remark"
                  :aria-label="`第 ${index + 1} 行备注`"
                  maxlength="1024"
                  placeholder="备注"
                  :disabled="submitting"
                  @input="delete errors[row.rowId]"
                />
              </td>
              <td>
                <el-switch
                  v-model="row.allowValueSearch"
                  :aria-label="`第 ${index + 1} 行允许值检索`"
                  :disabled="submitting"
                />
              </td>
              <td>
                <el-button
                  circle
                  size="small"
                  type="danger"
                  plain
                  :icon="Delete"
                  :aria-label="`移除第 ${index + 1} 行`"
                  :loading="pendingId === row.rowId"
                  :disabled="submitting"
                  @click="remove(row.rowId)"
                />
              </td>
            </tr>
            <tr v-if="errors[row.rowId]" class="tag-create-panel__error">
              <td colspan="6" role="alert">第 {{ index + 1 }} 行：{{ errors[row.rowId] }}</td>
            </tr>
          </template>
        </tbody>
      </table>
      <div v-if="!rows.length" class="resource-members__empty">暂无待创建的 Tag</div>
    </div>
    <footer class="tag-create-panel__footer">
      <span role="status" :class="{ 'tag-create-panel__warning': storageFailed }">{{
        storageFailed ? '草稿保存失败，刷新后可能丢失' : rows.length ? '草稿已保存' : ''
      }}</span>
      <el-button
        class="vault-dialog-confirm-button"
        type="primary"
        :loading="submitting"
        :disabled="!rows.length || !storageKey"
        @click="submit"
        >{{
          submitting ? `提交中 ${progress}/${submitTotal}` : `创建 ${rows.filter(filled).length} 项`
        }}</el-button
      >
    </footer>
  </section>
</template>

<style scoped lang="scss">
.tag-create-panel {
  min-width: 0;
  > .resource-members__toolbar {
    flex-direction: row;
    align-items: center;
    gap: 8px;
  }
  &__table-wrap {
    overflow: auto;
  }
  &__table {
    width: 100%;
    min-width: 752px;
    border-collapse: collapse;
    table-layout: fixed;
    th,
    td {
      padding: 8px 6px;
      text-align: left;
      border-bottom: 1px solid var(--v-divider);
    }
    th {
      position: sticky;
      top: 0;
      z-index: 2;
      background: var(--v-surface-bg-subtle);
      height: 38px;
      font-weight: 500;
      font-size: var(--v-font-xs);
      color: var(--v-text-secondary);
    }
    td {
      height: 50px;
    }
    .is-invalid td {
      border-bottom-color: var(--el-color-danger-light-5);
    }
  }
  &__error td {
    height: auto;
    color: var(--el-color-danger);
    font-size: var(--v-font-xs);
    overflow-wrap: anywhere;
  }
  &__footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    margin-top: 16px;
    min-height: 32px;
  }
  &__footer > span {
    font-size: var(--v-font-xs);
    color: var(--v-text-tertiary);
  }
  &__footer > .el-button {
    flex: 0 0 152px;
    width: 152px;
    height: 32px;
    padding: 0 16px;
    border-radius: var(--v-radius-dialog-action);
  }
  &__footer > .tag-create-panel__warning {
    color: var(--el-color-danger);
  }
}
</style>
