<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import {
  Eye,
  EyeOff,
  History,
  KeyRound,
  LoaderCircle,
  Pencil,
  Plus,
  Search,
  Trash2,
} from '@lucide/vue'
import {
  createPersonalSecret,
  deletePersonalSecret,
  listPersonalSecretHistory,
  listPersonalSecrets,
  revealPersonalSecretHistory,
  updatePersonalSecret,
  type PersonalSecret,
  type PersonalSecretHistory,
} from '@/api/personal-secret'
import { formatDateTime } from '@/utils/format'
import { notify } from '@/utils/notify'

type FormMode = 'create' | 'edit'

const listLoading = ref(false)
const items = ref<PersonalSecret[]>([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(10)
const keywordDraft = ref('')
const keyword = ref('')
const visibleSecretIDs = ref<Set<string>>(new Set())

const formDialogVisible = ref(false)
const formMode = ref<FormMode>('create')
const formRef = ref<FormInstance>()
const formSubmitting = ref(false)
const form = reactive({
  id: '',
  version: 0,
  name: '',
  account: '',
  loginUrl: '',
  value: '',
  remark: '',
  commitMsg: '',
})

const deletingID = ref('')
const historyDialogVisible = ref(false)
const historyTarget = ref<PersonalSecret>()
const historyLoading = ref(false)
const historyItems = ref<PersonalSecretHistory[]>([])
const visibleHistoryIDs = ref<Set<string>>(new Set())
const historyPasswordValues = ref<Record<string, string>>({})
const historyPasswordLoadingIDs = ref<Set<string>>(new Set())
const allHistoryPasswordsLoading = ref(false)
const historyTotal = ref(0)
const historyPageNum = ref(1)
const historyPageSize = ref(10)
const historyRevealRequests = new Map<string, Promise<boolean>>()
let historyPasswordScope = 0

const formTitle = computed(() => (formMode.value === 'create' ? '新增个人密钥' : '编辑个人密钥'))
const allPasswordsVisible = computed(
  () => items.value.length > 0 && items.value.every((item) => visibleSecretIDs.value.has(item.id)),
)
const allHistoryPasswordsVisible = computed(
  () =>
    historyItems.value.length > 0 &&
    historyItems.value.every((item) => visibleHistoryIDs.value.has(item.id)),
)
const formRules: FormRules = {
  name: [{ required: true, message: '请输入名称', trigger: 'blur' }],
  account: [{ required: true, message: '请输入登录用户名', trigger: 'blur' }],
  value: [
    {
      validator: (_rule, value: string, callback) => {
        if (formMode.value === 'create' && !value) callback(new Error('请输入密码'))
        else callback()
      },
      trigger: 'blur',
    },
  ],
  commitMsg: [
    {
      validator: (_rule, value: string, callback) => {
        if (formMode.value === 'edit' && !value.trim()) callback(new Error('请输入变更说明'))
        else callback()
      },
      trigger: 'blur',
    },
  ],
}

function asPersonalSecret(row: unknown): PersonalSecret {
  return row as PersonalSecret
}

function asPersonalSecretHistory(row: unknown): PersonalSecretHistory {
  return row as PersonalSecretHistory
}

async function loadList(): Promise<void> {
  if (listLoading.value) return
  listLoading.value = true
  let reloadPreviousPage = false
  try {
    const result = await listPersonalSecrets({
      keyword: keyword.value || undefined,
      pageNum: pageNum.value,
      pageSize: pageSize.value,
    })
    items.value = result.list
    total.value = result.total
    visibleSecretIDs.value = new Set()
    if (items.value.length === 0 && pageNum.value > 1 && total.value > 0) {
      pageNum.value -= 1
      reloadPreviousPage = true
    }
  } finally {
    listLoading.value = false
  }
  if (reloadPreviousPage) await loadList()
}

function search(): void {
  keyword.value = keywordDraft.value.trim()
  pageNum.value = 1
  void loadList()
}

function clearSearch(): void {
  if (keywordDraft.value !== '') return
  keyword.value = ''
  pageNum.value = 1
  void loadList()
}

function changePageSize(size: number): void {
  pageSize.value = size
  pageNum.value = 1
  void loadList()
}

function resetForm(): void {
  form.id = ''
  form.version = 0
  form.name = ''
  form.account = ''
  form.loginUrl = ''
  form.value = ''
  form.remark = ''
  form.commitMsg = ''
  formRef.value?.clearValidate()
}

function openCreate(): void {
  formMode.value = 'create'
  resetForm()
  formDialogVisible.value = true
}

function openEdit(item: PersonalSecret): void {
  formMode.value = 'edit'
  resetForm()
  form.id = item.id
  form.version = item.version
  form.name = item.name
  form.account = item.account
  form.loginUrl = item.loginUrl
  form.remark = item.remark
  formDialogVisible.value = true
}

async function submitForm(): Promise<void> {
  if (formSubmitting.value || !(await formRef.value?.validate().catch(() => false))) return
  formSubmitting.value = true
  try {
    if (formMode.value === 'create') {
      await createPersonalSecret({
        name: form.name,
        credentialType: 'password',
        account: form.account,
        loginUrl: form.loginUrl,
        value: form.value,
        remark: form.remark,
        commitMsg: form.commitMsg,
      })
      notify.success('个人密钥已创建')
    } else {
      await updatePersonalSecret({
        id: form.id,
        version: form.version,
        name: form.name,
        credentialType: 'password',
        account: form.account,
        loginUrl: form.loginUrl,
        value: form.value,
        remark: form.remark,
        commitMsg: form.commitMsg,
      })
      notify.success('个人密钥已更新')
    }
    form.value = ''
    formDialogVisible.value = false
    await loadList()
  } finally {
    formSubmitting.value = false
  }
}

async function remove(item: PersonalSecret): Promise<void> {
  if (deletingID.value) return
  try {
    await ElMessageBox.confirm(`确认删除“${item.name}”吗？历史版本仍会保留。`, '删除个人密钥', {
      customClass: 'vault-confirm-message-box',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
      confirmButtonClass: 'vault-delete-confirm-button',
    })
  } catch {
    return
  }
  deletingID.value = item.id
  try {
    await deletePersonalSecret({ id: item.id, version: item.version })
    notify.success('个人密钥已删除')
    await loadList()
  } finally {
    deletingID.value = ''
  }
}

function isPasswordVisible(id: string): boolean {
  return visibleSecretIDs.value.has(id)
}

function togglePassword(id: string): void {
  const next = new Set(visibleSecretIDs.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  visibleSecretIDs.value = next
}

function toggleAllPasswords(): void {
  visibleSecretIDs.value = allPasswordsVisible.value
    ? new Set()
    : new Set(items.value.map((item) => item.id))
}

function isHistoryPasswordVisible(id: string): boolean {
  return visibleHistoryIDs.value.has(id)
}

function isHistoryPasswordLoading(id: string): boolean {
  return historyPasswordLoadingIDs.value.has(id)
}

function hasHistoryPassword(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(historyPasswordValues.value, id)
}

function getHistoryPassword(id: string): string {
  return historyPasswordValues.value[id] ?? ''
}

function resetHistoryPasswordState(): void {
  historyPasswordScope += 1
  visibleHistoryIDs.value = new Set()
  historyPasswordValues.value = {}
  historyPasswordLoadingIDs.value = new Set()
  allHistoryPasswordsLoading.value = false
  historyRevealRequests.clear()
}

async function ensureHistoryPassword(row: PersonalSecretHistory): Promise<boolean> {
  if (hasHistoryPassword(row.id)) return true

  const pending = historyRevealRequests.get(row.id)
  if (pending) return pending

  const targetID = historyTarget.value?.id
  const scope = historyPasswordScope
  if (!targetID) return false

  const request = (async () => {
    const loadingIDs = new Set(historyPasswordLoadingIDs.value)
    loadingIDs.add(row.id)
    historyPasswordLoadingIDs.value = loadingIDs

    try {
      const result = await revealPersonalSecretHistory({
        personalSecretId: targetID,
        historyId: row.id,
      })
      if (
        scope !== historyPasswordScope ||
        !historyDialogVisible.value ||
        historyTarget.value?.id !== targetID
      ) {
        return false
      }
      historyPasswordValues.value = {
        ...historyPasswordValues.value,
        [row.id]: result.value,
      }
      return true
    } catch {
      return false
    } finally {
      if (scope === historyPasswordScope) {
        const nextLoadingIDs = new Set(historyPasswordLoadingIDs.value)
        nextLoadingIDs.delete(row.id)
        historyPasswordLoadingIDs.value = nextLoadingIDs
      }
    }
  })()

  historyRevealRequests.set(row.id, request)
  try {
    return await request
  } finally {
    if (historyRevealRequests.get(row.id) === request) historyRevealRequests.delete(row.id)
  }
}

async function toggleHistoryPassword(row: PersonalSecretHistory): Promise<void> {
  if (visibleHistoryIDs.value.has(row.id)) {
    const next = new Set(visibleHistoryIDs.value)
    next.delete(row.id)
    visibleHistoryIDs.value = next
    return
  }

  if (!(await ensureHistoryPassword(row))) return
  const next = new Set(visibleHistoryIDs.value)
  next.add(row.id)
  visibleHistoryIDs.value = next
}

async function toggleAllHistoryPasswords(): Promise<void> {
  if (allHistoryPasswordsLoading.value) return
  if (allHistoryPasswordsVisible.value) {
    visibleHistoryIDs.value = new Set()
    return
  }

  const rows = [...historyItems.value]
  const scope = historyPasswordScope
  allHistoryPasswordsLoading.value = true
  try {
    const results = await Promise.all(rows.map((row) => ensureHistoryPassword(row)))
    if (scope !== historyPasswordScope) return

    const next = new Set(visibleHistoryIDs.value)
    rows.forEach((row, index) => {
      if (results[index]) next.add(row.id)
    })
    visibleHistoryIDs.value = next
  } finally {
    if (scope === historyPasswordScope) allHistoryPasswordsLoading.value = false
  }
}

async function loadHistory(): Promise<void> {
  const target = historyTarget.value
  if (!target || historyLoading.value) return
  historyLoading.value = true
  resetHistoryPasswordState()
  try {
    const result = await listPersonalSecretHistory({
      personalSecretId: target.id,
      pageNum: historyPageNum.value,
      pageSize: historyPageSize.value,
    })
    historyItems.value = result.list
    historyTotal.value = result.total
  } finally {
    historyLoading.value = false
  }
}

function openHistory(item: PersonalSecret): void {
  historyTarget.value = item
  historyItems.value = []
  resetHistoryPasswordState()
  historyTotal.value = 0
  historyPageNum.value = 1
  historyDialogVisible.value = true
  void loadHistory()
}

function closeHistory(): void {
  historyTarget.value = undefined
  historyItems.value = []
  resetHistoryPasswordState()
  historyTotal.value = 0
}

function changeHistoryPageSize(size: number): void {
  historyPageSize.value = size
  historyPageNum.value = 1
  void loadHistory()
}

onMounted(() => void loadList())
onBeforeUnmount(() => {
  visibleSecretIDs.value = new Set()
  resetForm()
  closeHistory()
})
</script>

<template>
  <section class="personal-secrets">
    <header class="personal-secrets__header">
      <div>
        <h2>我的密钥</h2>
        <span>{{ total }} 条记录</span>
      </div>
      <div class="personal-secrets__actions">
        <el-input
          v-model="keywordDraft"
          clearable
          class="personal-secrets__search"
          placeholder="搜索名称、账号或地址"
          aria-label="搜索个人密钥"
          @keyup.enter="search"
          @clear="clearSearch"
        />
        <el-tooltip content="查询" placement="bottom">
          <button
            type="button"
            class="personal-secrets__round-action"
            aria-label="查询"
            @click="search"
          >
            <Search :size="16" :stroke-width="1.8" />
          </button>
        </el-tooltip>
        <el-tooltip content="新增" placement="bottom">
          <button
            type="button"
            class="personal-secrets__round-action personal-secrets__round-action--primary"
            aria-label="新增个人密钥"
            @click="openCreate"
          >
            <Plus :size="16" :stroke-width="1.8" />
          </button>
        </el-tooltip>
      </div>
    </header>

    <div v-loading="listLoading" class="personal-secrets__table-wrap">
      <el-table v-if="items.length" :data="items" row-key="id" table-layout="fixed">
        <el-table-column label="名称" min-width="180">
          <template #default="{ row }">
            <div class="personal-secret-name">
              <span><KeyRound :size="16" :stroke-width="1.8" /></span>
              <div>
                <strong :title="row.name">{{ row.name }}</strong>
                <small>密码 · v{{ row.version }}</small>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="account" label="登录用户名" min-width="150" show-overflow-tooltip>
          <template #default="{ row }">{{ row.account || '—' }}</template>
        </el-table-column>
        <el-table-column prop="loginUrl" label="登录地址" min-width="190" show-overflow-tooltip>
          <template #default="{ row }">{{ row.loginUrl || '—' }}</template>
        </el-table-column>
        <el-table-column min-width="260">
          <template #header>
            <div class="personal-secret-password personal-secret-password--header">
              <span>密码</span>
              <button
                type="button"
                class="personal-secret-password__toggle"
                :aria-label="allPasswordsVisible ? '隐藏全部密码' : '查看全部密码'"
                :aria-pressed="allPasswordsVisible"
                @click="toggleAllPasswords"
              >
                <EyeOff v-if="allPasswordsVisible" :size="15" :stroke-width="1.8" />
                <Eye v-else :size="15" :stroke-width="1.8" />
              </button>
            </div>
          </template>
          <template #default="{ row }">
            <div class="personal-secret-password">
              <code :title="isPasswordVisible(row.id) ? row.value : ''">
                {{ isPasswordVisible(row.id) ? row.value || '—' : '••••••••' }}
              </code>
              <button
                type="button"
                class="personal-secret-password__toggle"
                :aria-label="isPasswordVisible(row.id) ? '隐藏密码' : '查看密码'"
                :aria-pressed="isPasswordVisible(row.id)"
                @click="togglePassword(row.id)"
              >
                <EyeOff v-if="isPasswordVisible(row.id)" :size="15" :stroke-width="1.8" />
                <Eye v-else :size="15" :stroke-width="1.8" />
              </button>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="更新时间" min-width="165">
          <template #default="{ row }">
            <div class="personal-secret-time">
              <span>{{ formatDateTime(row.updateAt) }}</span>
              <small>{{ row.updateByName || row.updateBy || '—' }}</small>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="126" fixed="right" align="right">
          <template #default="{ row }">
            <div class="personal-secret-operations">
              <el-button text circle aria-label="编辑" @click="openEdit(asPersonalSecret(row))">
                <Pencil :size="16" :stroke-width="1.8" />
              </el-button>
              <el-button
                text
                circle
                aria-label="历史版本"
                @click="openHistory(asPersonalSecret(row))"
              >
                <History :size="16" :stroke-width="1.8" />
              </el-button>
              <el-button
                text
                circle
                class="is-danger"
                :loading="deletingID === row.id"
                :disabled="Boolean(deletingID)"
                aria-label="删除"
                @click="remove(asPersonalSecret(row))"
              >
                <Trash2 v-if="deletingID !== row.id" :size="16" :stroke-width="1.8" />
              </el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>

      <div v-else-if="!listLoading" class="personal-secrets__empty">
        <span><KeyRound :size="25" :stroke-width="1.6" /></span>
        <strong>{{ keyword ? '没有匹配的个人密钥' : '暂无个人密钥' }}</strong>
        <el-tooltip v-if="!keyword" content="新增" placement="bottom">
          <button
            type="button"
            class="personal-secrets__round-action personal-secrets__round-action--primary"
            aria-label="新增个人密钥"
            @click="openCreate"
          >
            <Plus :size="16" :stroke-width="1.8" />
          </button>
        </el-tooltip>
      </div>
    </div>

    <footer v-if="total > pageSize" class="personal-secrets__pagination">
      <el-pagination
        v-model:current-page="pageNum"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next"
        @current-change="loadList"
        @size-change="changePageSize"
      />
    </footer>

    <el-dialog
      v-model="formDialogVisible"
      width="560px"
      class="personal-secret-dialog"
      :close-on-click-modal="false"
      :close-on-press-escape="!formSubmitting"
      :show-close="!formSubmitting"
      @closed="resetForm"
    >
      <template #header>
        <div class="personal-secret-dialog__title">
          <KeyRound :size="18" :stroke-width="1.8" />
          <span>{{ formTitle }}</span>
        </div>
      </template>
      <el-form
        ref="formRef"
        :model="form"
        :rules="formRules"
        label-position="top"
        class="personal-secret-form"
      >
        <el-form-item label="名称" prop="name">
          <el-input v-model="form.name" maxlength="200" show-word-limit />
        </el-form-item>
        <el-form-item label="登录用户名" prop="account">
          <el-input v-model="form.account" autocomplete="username" />
        </el-form-item>
        <el-form-item :label="formMode === 'create' ? '密码' : '新密码'" prop="value">
          <el-input
            v-model="form.value"
            type="password"
            show-password
            autocomplete="new-password"
            :placeholder="formMode === 'edit' ? '留空表示保持当前密码' : ''"
          />
        </el-form-item>
        <el-form-item label="登录地址（可选）" prop="loginUrl">
          <el-input v-model="form.loginUrl" autocomplete="url" />
        </el-form-item>
        <el-form-item label="备注（可选）" prop="remark">
          <el-input
            v-model="form.remark"
            type="textarea"
            :rows="3"
            maxlength="2000"
            show-word-limit
          />
        </el-form-item>
        <el-form-item v-if="formMode === 'edit'" label="变更说明" prop="commitMsg">
          <el-input v-model="form.commitMsg" maxlength="500" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button :disabled="formSubmitting" @click="formDialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          class="vault-dialog-confirm-button"
          :loading="formSubmitting"
          @click="submitForm"
        >
          确认
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="historyDialogVisible"
      width="1240px"
      class="personal-secret-dialog personal-secret-history-dialog"
      @closed="closeHistory"
    >
      <template #header>
        <div class="personal-secret-dialog__title">
          <History :size="18" :stroke-width="1.8" />
          <span>{{ historyTarget?.name }} · 历史版本</span>
        </div>
      </template>
      <div v-loading="historyLoading" class="personal-secret-history">
        <el-table v-if="historyItems.length" :data="historyItems" row-key="id" table-layout="fixed">
          <el-table-column label="版本" width="76">
            <template #default="{ row }"
              ><strong>v{{ row.version }}</strong></template
            >
          </el-table-column>
          <el-table-column prop="commitMsg" label="变更说明" min-width="260" show-overflow-tooltip>
            <template #default="{ row }">{{ row.commitMsg || '—' }}</template>
          </el-table-column>
          <el-table-column prop="account" label="登录用户名" min-width="180" show-overflow-tooltip>
            <template #default="{ row }">{{ row.account || '—' }}</template>
          </el-table-column>
          <el-table-column min-width="260">
            <template #header>
              <div class="personal-secret-password personal-secret-password--header">
                <span>密码</span>
                <button
                  type="button"
                  class="personal-secret-password__toggle"
                  :disabled="allHistoryPasswordsLoading || historyLoading"
                  :aria-label="allHistoryPasswordsVisible ? '隐藏全部密码' : '查看全部密码'"
                  :aria-pressed="allHistoryPasswordsVisible"
                  @click="toggleAllHistoryPasswords"
                >
                  <LoaderCircle
                    v-if="allHistoryPasswordsLoading"
                    class="personal-secret-password__spinner"
                    :size="15"
                    :stroke-width="1.8"
                  />
                  <EyeOff v-else-if="allHistoryPasswordsVisible" :size="15" :stroke-width="1.8" />
                  <Eye v-else :size="15" :stroke-width="1.8" />
                </button>
              </div>
            </template>
            <template #default="{ row }">
              <div class="personal-secret-password">
                <code :title="isHistoryPasswordVisible(row.id) ? getHistoryPassword(row.id) : ''">
                  {{
                    isHistoryPasswordVisible(row.id)
                      ? getHistoryPassword(row.id) || '—'
                      : '••••••••'
                  }}
                </code>
                <button
                  type="button"
                  class="personal-secret-password__toggle"
                  :disabled="isHistoryPasswordLoading(row.id)"
                  :aria-label="
                    isHistoryPasswordLoading(row.id)
                      ? '正在读取密码'
                      : isHistoryPasswordVisible(row.id)
                        ? '隐藏密码'
                        : '查看密码'
                  "
                  :aria-pressed="isHistoryPasswordVisible(row.id)"
                  @click="toggleHistoryPassword(asPersonalSecretHistory(row))"
                >
                  <LoaderCircle
                    v-if="isHistoryPasswordLoading(row.id)"
                    class="personal-secret-password__spinner"
                    :size="15"
                    :stroke-width="1.8"
                  />
                  <EyeOff
                    v-else-if="isHistoryPasswordVisible(row.id)"
                    :size="15"
                    :stroke-width="1.8"
                  />
                  <Eye v-else :size="15" :stroke-width="1.8" />
                </button>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="提交人" min-width="140" show-overflow-tooltip>
            <template #default="{ row }">{{ row.createByName || row.createBy || '—' }}</template>
          </el-table-column>
          <el-table-column label="提交时间" width="166">
            <template #default="{ row }">{{ formatDateTime(row.createAt) }}</template>
          </el-table-column>
        </el-table>
        <div v-else-if="!historyLoading" class="personal-secret-history__empty">暂无历史版本</div>
        <el-pagination
          v-if="historyTotal > historyPageSize"
          v-model:current-page="historyPageNum"
          v-model:page-size="historyPageSize"
          :total="historyTotal"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          @current-change="loadHistory"
          @size-change="changeHistoryPageSize"
        />
      </div>
      <template #footer>
        <el-button type="primary" @click="historyDialogVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<style scoped lang="scss">
.personal-secrets {
  min-height: 420px;
  border: 1px solid var(--v-surface-border);
  border-radius: var(--v-radius-md);
  background: var(--v-surface-bg);
  box-shadow: var(--v-shadow-sm);

  &__header {
    min-height: 72px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    padding: 14px 18px;
    border-bottom: 1px solid var(--v-divider);

    > div:first-child {
      min-width: 0;
      display: flex;
      align-items: baseline;
      gap: 10px;
    }

    h2 {
      margin: 0;
      color: var(--v-text-primary);
      font-size: var(--v-font-lg);
      font-weight: 600;
      letter-spacing: 0;
    }

    span {
      color: var(--v-text-tertiary);
      font-size: var(--v-font-xs);
    }
  }

  &__actions {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  &__search {
    width: 240px;

    :deep(.el-input__wrapper) {
      min-height: 34px;
      border-radius: 999px !important;
      background: var(--v-surface-bg-subtle);
      box-shadow: none;
    }
  }

  &__round-action {
    width: 32px;
    height: 32px;
    flex: 0 0 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 1px solid var(--v-surface-border);
    border-radius: 50%;
    background: var(--v-surface-bg);
    color: var(--v-text-secondary);
    cursor: pointer;

    &:disabled {
      cursor: wait;
      opacity: 0.72;
    }
    transition:
      border-color 0.18s ease,
      color 0.18s ease,
      background-color 0.18s ease;

    &:hover,
    &:focus-visible {
      border-color: var(--el-color-primary);
      color: var(--el-color-primary);
      outline: none;
    }

    &--primary {
      border-color: rgb(23, 93, 251);
      background: rgb(23, 93, 251);
      color: #fff;

      &:hover,
      &:focus-visible {
        border-color: rgb(18, 76, 214);
        background: rgb(18, 76, 214);
        color: #fff;
      }
    }
  }

  &__table-wrap {
    min-height: 340px;
    overflow-x: auto;

    :deep(.el-table) {
      min-width: 1060px;
    }
  }

  &__empty {
    min-height: 340px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    color: var(--v-text-secondary);

    > span {
      width: 48px;
      height: 48px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      background: var(--v-surface-bg-subtle);
      color: var(--v-text-tertiary);
    }

    strong {
      font-size: var(--v-font-md);
      font-weight: 600;
    }
  }

  &__pagination {
    display: flex;
    justify-content: flex-end;
    padding: 12px 16px;
    border-top: 1px solid var(--v-divider);
  }
}

.personal-secret-name {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;

  > span {
    width: 32px;
    height: 32px;
    flex: 0 0 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--v-radius-sm);
    background: var(--el-color-primary-light-9);
    color: var(--el-color-primary);
  }

  > div,
  strong,
  small {
    min-width: 0;
  }

  > div {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  strong,
  small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong {
    color: var(--v-text-primary);
    font-size: var(--v-font-sm);
    font-weight: 600;
  }

  small {
    color: var(--v-text-tertiary);
    font-size: var(--v-font-xs);
  }
}

.personal-secret-time {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;

  span,
  small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  span {
    color: var(--v-text-secondary);
    font-size: var(--v-font-xs);
  }

  small {
    color: var(--v-text-tertiary);
    font-size: var(--v-font-xs);
  }
}

.personal-secret-password {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--v-space-2);

  code {
    min-width: 0;
    max-width: calc(100% - 34px);
    flex: 0 1 auto;
    overflow: hidden;
    color: var(--v-text-primary);
    font-family: var(--el-font-family-monospace, ui-monospace, SFMono-Regular, Consolas, monospace);
    font-size: var(--v-font-sm);
    letter-spacing: 0;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &--header {
    justify-content: flex-start;
    color: var(--v-text-secondary);

    span {
      flex: 0 0 auto;
    }
  }

  &__toggle {
    width: 26px;
    height: 26px;
    flex: 0 0 26px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--v-text-secondary);
    cursor: pointer;

    &:hover,
    &:focus-visible,
    &[aria-pressed='true'] {
      background: var(--el-color-primary-light-9);
      color: var(--el-color-primary);
      outline: none;
    }
  }

  &__spinner {
    animation: personal-secret-spin 0.8s linear infinite;
  }
}

@keyframes personal-secret-spin {
  to {
    transform: rotate(360deg);
  }
}

.personal-secret-operations {
  display: inline-flex;
  align-items: center;
  gap: 2px;

  .el-button {
    width: 28px;
    height: 28px;
    margin: 0;
    color: var(--v-text-secondary);

    &:hover,
    &:focus-visible {
      color: var(--el-color-primary);
    }

    &.is-danger {
      color: var(--v-color-danger);
    }
  }
}

.personal-secret-dialog__title {
  display: flex;
  align-items: center;
  gap: 9px;
  color: var(--v-text-primary);
  font-size: var(--v-font-lg);
  font-weight: 600;
}

.personal-secret-form {
  :deep(.el-form-item) {
    margin-bottom: 18px;
  }

  :deep(.el-form-item:last-child) {
    margin-bottom: 0;
  }

  :deep(.el-form-item__label) {
    padding-bottom: 7px;
    color: var(--v-text-primary);
    font-size: var(--v-font-sm);
    font-weight: 600;
  }

  :deep(.el-input__wrapper) {
    min-height: 38px;
  }
}

.personal-secret-history {
  min-height: 320px;
  overflow-x: auto;

  :deep(.el-table) {
    min-width: 1080px;
  }

  &__empty {
    min-height: 270px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--v-text-tertiary);
    font-size: var(--v-font-sm);
  }

  > .el-pagination {
    margin-top: 14px;
  }
}

:global(.personal-secret-dialog.el-dialog) {
  --el-dialog-border-radius: var(--v-radius-dialog);
  --el-dialog-padding-primary: 0;
  max-width: calc(100vw - 32px);
  overflow: hidden;
  border: 1px solid var(--v-surface-border);
  border-radius: var(--v-radius-dialog);
  background: var(--v-surface-bg);
  box-shadow: var(--v-shadow-lg);
}

:global(.personal-secret-dialog.el-dialog .el-dialog__header) {
  min-height: 58px;
  display: flex;
  align-items: center;
  margin: 0;
  padding: 0 22px;
  border-bottom: 1px solid var(--v-divider);
}

:global(.personal-secret-dialog.el-dialog .el-dialog__body) {
  padding: 20px 22px 22px;
}

:global(.personal-secret-dialog.el-dialog .el-dialog__footer) {
  padding: 14px 22px;
  border-top: 1px solid var(--v-divider);
}

:global(.personal-secret-dialog.el-dialog .el-dialog__footer .el-button) {
  min-width: 58px;
  height: 32px;
  margin-left: 10px;
  padding: 0 16px;
  border-radius: var(--v-radius-dialog-action);
}

@media (max-width: 700px) {
  .personal-secrets {
    &__header {
      align-items: stretch;
      flex-direction: column;
      gap: 12px;
    }

    &__actions {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto auto;

      .personal-secrets__search {
        width: 100%;
      }
    }
  }
}
</style>
