<script setup lang="ts">
import PageRefreshButton from '@/components/PageRefreshButton.vue'
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { Copy, Eye, EyeOff, KeySquare, Plus, Trash2 } from '@lucide/vue'
import {
  createUserAccessToken,
  deleteUserAccessToken,
  listUserAccessTokens,
  type UserAccessToken,
} from '@/api/user-access-token'
import { copyToClipboard } from '@/utils/copy'
import { formatDateTime } from '@/utils/format'
import { notify } from '@/utils/notify'

const MAX_ACTIVE_TOKENS = 10
const MASKED_TOKEN = '••••••••••••••••'

const listLoading = ref(false)
const loadFailed = ref(false)
const items = ref<UserAccessToken[]>([])
const visibleTokenIDs = ref<Set<string>>(new Set())
const deletingID = ref('')
const clockNow = ref(Date.now())
let clockTimer: ReturnType<typeof setInterval> | undefined

const dialogVisible = ref(false)
const formRef = ref<FormInstance>()
const formSubmitting = ref(false)
const form = reactive<{ name: string; expiresAt: Date | null }>({
  name: '',
  expiresAt: null,
})

const activeTokenCount = computed(
  () => items.value.filter((item) => new Date(item.expiresAt).getTime() > clockNow.value).length,
)
const createDisabled = computed(() => activeTokenCount.value >= MAX_ACTIVE_TOKENS)

const formRules: FormRules = {
  name: [
    { required: true, message: '请输入 Token 名称', trigger: 'blur' },
    { max: 64, message: 'Token 名称不能超过 64 个字符', trigger: 'blur' },
  ],
  expiresAt: [
    {
      validator: (_rule, value: Date | null, callback) => {
        if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
          callback(new Error('请选择到期时间'))
        } else if (value.getTime() <= Date.now()) {
          callback(new Error('到期时间必须晚于当前时间'))
        } else {
          callback()
        }
      },
      trigger: 'change',
    },
  ],
}

function asUserAccessToken(row: unknown): UserAccessToken {
  return row as UserAccessToken
}

function defaultExpiration(): Date {
  const value = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  value.setSeconds(0, 0)
  return value
}

function isExpired(item: UserAccessToken): boolean {
  return new Date(item.expiresAt).getTime() <= clockNow.value
}

function isTokenVisible(id: string): boolean {
  return visibleTokenIDs.value.has(id)
}

function toggleToken(id: string): void {
  const next = new Set(visibleTokenIDs.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  visibleTokenIDs.value = next
}

async function copyToken(item: UserAccessToken): Promise<void> {
  if (await copyToClipboard(item.token)) notify.success('已复制')
  else notify.error('复制失败')
}

function disablePastDate(date: Date): boolean {
  const endOfDay = new Date(date)
  endOfDay.setHours(23, 59, 59, 999)
  return endOfDay.getTime() < Date.now()
}

async function loadList(): Promise<void> {
  if (listLoading.value) return
  listLoading.value = true
  loadFailed.value = false
  try {
    items.value = await listUserAccessTokens()
    visibleTokenIDs.value = new Set()
  } catch {
    loadFailed.value = true
  } finally {
    listLoading.value = false
  }
}

function openCreate(): void {
  if (createDisabled.value) return
  form.name = ''
  form.expiresAt = defaultExpiration()
  formRef.value?.clearValidate()
  dialogVisible.value = true
}

function closeCreate(): void {
  form.name = ''
  form.expiresAt = null
  formRef.value?.clearValidate()
}

async function submitCreate(): Promise<void> {
  if (formSubmitting.value || !(await formRef.value?.validate().catch(() => false))) return
  if (!form.expiresAt) return

  formSubmitting.value = true
  try {
    await createUserAccessToken({
      name: form.name.trim(),
      expiresAt: form.expiresAt.toISOString(),
    })
    notify.success('个人 Token 已创建')
    dialogVisible.value = false
    await loadList()
  } finally {
    formSubmitting.value = false
  }
}

async function remove(item: UserAccessToken): Promise<void> {
  if (deletingID.value) return
  try {
    await ElMessageBox.confirm(`确认删除“${item.name}”吗？删除后将立即失效。`, '删除个人 Token', {
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
    await deleteUserAccessToken({ id: item.id })
    notify.success('个人 Token 已删除')
    await loadList()
  } finally {
    deletingID.value = ''
  }
}

onMounted(() => {
  clockTimer = setInterval(() => {
    clockNow.value = Date.now()
  }, 60_000)
  void loadList()
})
onBeforeUnmount(() => {
  if (clockTimer) clearInterval(clockTimer)
  items.value = []
  visibleTokenIDs.value = new Set()
  closeCreate()
})
</script>

<template>
  <section class="personal-tokens">
    <header class="personal-tokens__header">
      <div>
        <h2>个人 Token</h2>
        <span>{{ activeTokenCount }}/{{ MAX_ACTIVE_TOKENS }} 个有效</span>
      </div>
      <div class="personal-tokens__actions">
        <button
          type="button"
          class="personal-tokens__add"
          :disabled="createDisabled"
          aria-label="新增个人 Token"
          @click="openCreate"
        >
          <Plus :size="17" :stroke-width="2" />
        </button>
        <PageRefreshButton
          :action="loadList"
          :loading="listLoading"
          :disabled="formSubmitting || !!deletingID"
        />
      </div>
    </header>

    <div v-loading="listLoading" class="personal-tokens__table-wrap">
      <el-table v-if="items.length" :data="items" table-layout="fixed">
        <el-table-column label="Token 名" min-width="190" show-overflow-tooltip>
          <template #default="{ row }">
            <div class="personal-token-name">
              <span><KeySquare :size="16" :stroke-width="1.8" /></span>
              <strong>{{ row.name }}</strong>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="Token" min-width="330">
          <template #default="{ row }">
            <div class="personal-token-value">
              <button
                type="button"
                class="personal-token-value__copy"
                :aria-label="`复制 ${row.name} Token`"
                @click="copyToken(asUserAccessToken(row))"
              >
                <code :title="isTokenVisible(row.id) ? row.token : ''">
                  {{ isTokenVisible(row.id) ? row.token : MASKED_TOKEN }}
                </code>
                <Copy :size="14" :stroke-width="1.8" />
              </button>
              <button
                type="button"
                class="personal-token-value__toggle"
                :aria-label="isTokenVisible(row.id) ? '隐藏 Token' : '查看 Token'"
                :aria-pressed="isTokenVisible(row.id)"
                @click="toggleToken(row.id)"
              >
                <EyeOff v-if="isTokenVisible(row.id)" :size="15" :stroke-width="1.8" />
                <Eye v-else :size="15" :stroke-width="1.8" />
              </button>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="172">
          <template #default="{ row }">{{ formatDateTime(row.createAt) }}</template>
        </el-table-column>
        <el-table-column label="到期时间" width="172">
          <template #default="{ row }">
            <span
              class="personal-token-expiry"
              :class="{ 'is-expired': isExpired(asUserAccessToken(row)) }"
            >
              {{ formatDateTime(row.expiresAt) }}
              <small v-if="isExpired(asUserAccessToken(row))">已到期</small>
            </span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="76" fixed="right" align="center">
          <template #default="{ row }">
            <el-button
              text
              circle
              type="danger"
              :loading="deletingID === row.id"
              :disabled="Boolean(deletingID)"
              aria-label="删除个人 Token"
              @click="remove(asUserAccessToken(row))"
            >
              <Trash2 v-if="deletingID !== row.id" :size="16" :stroke-width="1.8" />
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div v-else-if="!listLoading" class="personal-tokens__empty">
        <span><KeySquare :size="23" :stroke-width="1.6" /></span>
        <strong>{{ loadFailed ? '个人 Token 加载失败' : '暂无个人 Token' }}</strong>
        <el-button v-if="loadFailed" type="primary" plain @click="loadList">重新加载</el-button>
        <button
          v-else
          type="button"
          class="personal-tokens__add"
          :disabled="createDisabled"
          aria-label="新增个人 Token"
          @click="openCreate"
        >
          <Plus :size="16" :stroke-width="1.8" />
        </button>
      </div>
    </div>

    <el-dialog
      v-model="dialogVisible"
      append-to-body
      align-center
      width="520px"
      class="vault-card-edit-dialog personal-token-dialog"
      destroy-on-close
      :close-on-click-modal="false"
      @closed="closeCreate"
    >
      <template #header>
        <span class="vault-card-edit-dialog__title">新增个人 Token</span>
      </template>
      <div class="vault-card-edit-dialog__body">
        <el-form ref="formRef" :model="form" :rules="formRules" label-position="top">
          <el-form-item label="Token 名" prop="name">
            <el-input
              v-model="form.name"
              maxlength="64"
              show-word-limit
              autocomplete="off"
              placeholder="请输入 Token 名称"
            />
          </el-form-item>
          <el-form-item label="到期时间" prop="expiresAt">
            <el-date-picker
              v-model="form.expiresAt"
              type="datetime"
              format="YYYY-MM-DD HH:mm"
              placeholder="请选择到期时间"
              :clearable="false"
              :disabled-date="disablePastDate"
            />
          </el-form-item>
        </el-form>
      </div>
      <template #footer>
        <el-button :disabled="formSubmitting" @click="dialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          class="vault-dialog-confirm-button"
          :loading="formSubmitting"
          @click="submitCreate"
        >
          创建
        </el-button>
      </template>
    </el-dialog>
  </section>
</template>

<style scoped lang="scss">
.personal-tokens__actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.personal-tokens {
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

    > div {
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

  &__add {
    width: 32px;
    height: 32px;
    flex: 0 0 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 1px solid #175dfb;
    border-radius: 50%;
    background: #175dfb;
    color: #fff;
    cursor: pointer;

    &:hover:not(:disabled),
    &:focus-visible {
      border-color: #124cd6;
      background: #124cd6;
      outline: none;
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.45;
    }
  }

  &__table-wrap {
    min-height: 340px;
    overflow-x: auto;

    :deep(.el-table) {
      min-width: 940px;
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
}

.personal-token-name {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;

  span {
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

  strong {
    min-width: 0;
    overflow: hidden;
    color: var(--v-text-primary);
    font-size: var(--v-font-sm);
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.personal-token-value {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;

  &__copy {
    min-width: 0;
    height: 30px;
    flex: 1 1 auto;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 9px;
    overflow: hidden;
    border: 1px solid transparent;
    border-radius: var(--v-radius-sm);
    background: var(--v-surface-bg-subtle);
    color: var(--v-text-secondary);
    cursor: pointer;

    &:hover,
    &:focus-visible {
      border-color: var(--el-color-primary-light-5);
      color: var(--el-color-primary);
      outline: none;
    }

    code {
      min-width: 0;
      flex: 1;
      overflow: hidden;
      color: var(--v-text-primary);
      font-family: var(
        --el-font-family-monospace,
        ui-monospace,
        SFMono-Regular,
        Consolas,
        monospace
      );
      font-size: var(--v-font-xs);
      letter-spacing: 0;
      text-align: left;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    svg {
      flex: 0 0 auto;
    }
  }

  &__toggle {
    width: 28px;
    height: 28px;
    flex: 0 0 28px;
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
}

.personal-token-expiry {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--v-text-secondary);
  font-size: var(--v-font-xs);

  small {
    color: var(--v-color-danger);
    font-size: var(--v-font-xs);
  }

  &.is-expired {
    color: var(--v-text-tertiary);
  }
}

:global(.personal-token-dialog .el-date-editor.el-input) {
  width: 100%;
}

:global(.personal-token-dialog .el-form-item) {
  margin-bottom: 18px;
}

:global(.personal-token-dialog .el-form-item:last-child) {
  margin-bottom: 0;
}
</style>
