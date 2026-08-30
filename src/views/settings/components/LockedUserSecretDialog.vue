<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Eye, EyeOff, KeyRound, Search } from '@lucide/vue'
import { listManagedPersonalSecrets, type PersonalSecret } from '@/api/personal-secret'
import type { UserManagementListItem } from '@/api/user'
import { formatDateTime } from '@/utils/format'

const props = defineProps<{
  modelValue: boolean
  user?: UserManagementListItem
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const dialogVisible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})
const targetName = computed(
  () => props.user?.nickname || props.user?.username || props.user?.userId || '用户',
)

const keywordDraft = ref('')
const keyword = ref('')
const items = ref<PersonalSecret[]>([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(10)
const listLoading = ref(false)
const listFailed = ref(false)
const visibleSecretIDs = ref<Set<string>>(new Set())
let listRequestID = 0

const allPasswordsVisible = computed(
  () => items.value.length > 0 && items.value.every((item) => visibleSecretIDs.value.has(item.id)),
)

function asPersonalSecret(row: unknown): PersonalSecret {
  return row as PersonalSecret
}

async function loadSecrets(): Promise<void> {
  const userID = props.user?.userId
  if (!userID || !props.user?.isBlocked) return
  const requestID = ++listRequestID
  listLoading.value = true
  listFailed.value = false
  try {
    const result = await listManagedPersonalSecrets({
      userId: userID,
      keyword: keyword.value || undefined,
      pageNum: pageNum.value,
      pageSize: pageSize.value,
    })
    if (requestID !== listRequestID || !dialogVisible.value) return
    items.value = result.list
    total.value = result.total
    visibleSecretIDs.value = new Set()
    if (items.value.length === 0 && pageNum.value > 1 && total.value > 0) {
      pageNum.value -= 1
      await loadSecrets()
    }
  } catch {
    if (requestID !== listRequestID) return
    items.value = []
    total.value = 0
    visibleSecretIDs.value = new Set()
    listFailed.value = true
  } finally {
    if (requestID === listRequestID) listLoading.value = false
  }
}

function search(): void {
  keyword.value = keywordDraft.value.trim()
  pageNum.value = 1
  void loadSecrets()
}

function clearSearch(): void {
  if (keywordDraft.value !== '') return
  keyword.value = ''
  pageNum.value = 1
  void loadSecrets()
}

function changePage(page: number): void {
  pageNum.value = page
  void loadSecrets()
}

function changePageSize(size: number): void {
  pageSize.value = size
  pageNum.value = 1
  void loadSecrets()
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

function resetDialog(): void {
  listRequestID += 1
  keywordDraft.value = ''
  keyword.value = ''
  items.value = []
  total.value = 0
  pageNum.value = 1
  listLoading.value = false
  listFailed.value = false
  visibleSecretIDs.value = new Set()
}

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    resetDialog()
    void loadSecrets()
  },
)
</script>

<template>
  <el-dialog
    v-model="dialogVisible"
    width="1180px"
    class="vault-card-edit-dialog locked-user-secret-dialog"
    append-to-body
    destroy-on-close
    :close-on-click-modal="false"
    @closed="resetDialog"
  >
    <template #header>
      <div class="locked-user-secret-dialog__header">
        <div class="locked-user-secret-dialog__identity">
          <span class="locked-user-secret-dialog__symbol" aria-hidden="true">
            <KeyRound :size="17" :stroke-width="1.8" />
          </span>
          <strong :title="targetName">{{ targetName }}</strong>
          <el-tag type="danger" size="small" effect="plain">已锁定</el-tag>
        </div>
        <div class="locked-user-secret-dialog__search-area">
          <el-input
            v-model="keywordDraft"
            clearable
            class="locked-user-secret-dialog__search"
            placeholder="搜索名称、账号或地址"
            aria-label="搜索用户个人密钥"
            @keyup.enter="search"
            @clear="clearSearch"
          />
          <el-tooltip content="查询" placement="bottom">
            <button
              type="button"
              class="locked-user-secret-dialog__round-action"
              aria-label="查询个人密钥"
              @click="search"
            >
              <Search :size="16" :stroke-width="1.8" />
            </button>
          </el-tooltip>
        </div>
      </div>
    </template>

    <div v-loading="listLoading" class="locked-user-secret-dialog__content">
      <div class="locked-user-secret-dialog__summary">{{ total }} 条记录</div>
      <div class="locked-user-secret-dialog__table-wrap">
        <el-table v-if="items.length" :data="items" row-key="id" table-layout="fixed">
          <el-table-column label="名称" min-width="180">
            <template #default="{ row }">
              <div class="locked-user-secret-name">
                <span><KeyRound :size="16" :stroke-width="1.8" /></span>
                <div>
                  <strong :title="row.name">{{ row.name }}</strong>
                  <small>密码 · v{{ row.version }}</small>
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="account" label="登录用户名" min-width="155" show-overflow-tooltip>
            <template #default="{ row }">{{ row.account || '—' }}</template>
          </el-table-column>
          <el-table-column prop="loginUrl" label="登录地址" min-width="200" show-overflow-tooltip>
            <template #default="{ row }">{{ row.loginUrl || '—' }}</template>
          </el-table-column>
          <el-table-column min-width="270">
            <template #header>
              <div class="locked-user-secret-password locked-user-secret-password--header">
                <span>密码</span>
                <el-tooltip
                  :content="allPasswordsVisible ? '隐藏全部密码' : '查看全部密码'"
                  placement="top"
                >
                  <button
                    type="button"
                    class="locked-user-secret-password__toggle"
                    :aria-label="allPasswordsVisible ? '隐藏全部密码' : '查看全部密码'"
                    :aria-pressed="allPasswordsVisible"
                    @click="toggleAllPasswords"
                  >
                    <EyeOff v-if="allPasswordsVisible" :size="15" :stroke-width="1.8" />
                    <Eye v-else :size="15" :stroke-width="1.8" />
                  </button>
                </el-tooltip>
              </div>
            </template>
            <template #default="{ row }">
              <div class="locked-user-secret-password">
                <code :title="isPasswordVisible(asPersonalSecret(row).id) ? row.value : ''">
                  {{ isPasswordVisible(asPersonalSecret(row).id) ? row.value || '—' : '••••••••' }}
                </code>
                <el-tooltip
                  :content="isPasswordVisible(asPersonalSecret(row).id) ? '隐藏密码' : '查看密码'"
                  placement="top"
                >
                  <button
                    type="button"
                    class="locked-user-secret-password__toggle"
                    :aria-label="
                      isPasswordVisible(asPersonalSecret(row).id) ? '隐藏密码' : '查看密码'
                    "
                    :aria-pressed="isPasswordVisible(asPersonalSecret(row).id)"
                    @click="togglePassword(asPersonalSecret(row).id)"
                  >
                    <EyeOff
                      v-if="isPasswordVisible(asPersonalSecret(row).id)"
                      :size="15"
                      :stroke-width="1.8"
                    />
                    <Eye v-else :size="15" :stroke-width="1.8" />
                  </button>
                </el-tooltip>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="更新时间" min-width="170">
            <template #default="{ row }">
              <div class="locked-user-secret-time">
                <span>{{ formatDateTime(row.updateAt) || '—' }}</span>
                <small>{{ row.updateByName || row.updateBy || '—' }}</small>
              </div>
            </template>
          </el-table-column>
        </el-table>

        <div v-else-if="!listLoading" class="locked-user-secret-dialog__empty">
          <span><KeyRound :size="25" :stroke-width="1.6" /></span>
          <strong>{{
            listFailed ? '个人密钥加载失败' : keyword ? '没有匹配的个人密钥' : '暂无个人密钥'
          }}</strong>
          <el-button v-if="listFailed" type="primary" plain @click="loadSecrets"
            >重新加载</el-button
          >
        </div>
      </div>

      <footer v-if="total > pageSize" class="locked-user-secret-dialog__pagination">
        <el-pagination
          v-model:current-page="pageNum"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          @current-change="changePage"
          @size-change="changePageSize"
        />
      </footer>
    </div>

    <template #footer>
      <el-button type="primary" @click="dialogVisible = false">关闭</el-button>
    </template>
  </el-dialog>
</template>

<style scoped lang="scss">
.locked-user-secret-dialog {
  &__header {
    width: 100%;
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    padding-right: 40px;
  }

  &__identity,
  &__search-area {
    min-width: 0;
    display: flex;
    align-items: center;
  }

  &__identity {
    gap: 9px;

    strong {
      max-width: 360px;
      overflow: hidden;
      color: var(--v-text-primary);
      font-size: var(--v-font-lg);
      font-weight: 650;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  &__symbol {
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

  &__search-area {
    gap: 8px;
  }

  &__search {
    width: 250px;

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

    &:hover,
    &:focus-visible {
      border-color: var(--el-color-primary);
      color: var(--el-color-primary);
      outline: none;
    }
  }

  &__content {
    min-height: 430px;
  }

  &__summary {
    min-height: 38px;
    display: flex;
    align-items: center;
    padding: 0 16px;
    border-bottom: 1px solid var(--v-divider);
    color: var(--v-text-tertiary);
    font-size: var(--v-font-xs);
  }

  &__table-wrap {
    min-height: 340px;
    overflow-x: auto;

    :deep(.el-table) {
      min-width: 1030px;
    }

    :deep(.el-table__header th.el-table__cell) {
      background: var(--v-surface-bg-subtle);
      color: var(--v-text-secondary);
      font-size: var(--v-font-xs);
      font-weight: 600;
    }

    :deep(.el-table__cell) {
      padding: 10px 0;
      font-size: var(--v-font-sm);
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

.locked-user-secret-name {
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

  > div {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  strong,
  small {
    min-width: 0;
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

.locked-user-secret-password {
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
    color: var(--v-text-secondary);
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
}

.locked-user-secret-time {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;

  span,
  small {
    overflow: hidden;
    color: var(--v-text-tertiary);
    font-size: var(--v-font-xs);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

:global(.locked-user-secret-dialog.vault-card-edit-dialog.el-dialog) {
  width: min(1180px, calc(100vw - 32px));
}

:global(.locked-user-secret-dialog.vault-card-edit-dialog.el-dialog .el-dialog__header) {
  min-height: 64px;
}

:global(.locked-user-secret-dialog.vault-card-edit-dialog.el-dialog .el-dialog__body) {
  max-height: calc(90vh - 126px);
  overflow: auto;
}

@media (max-width: 760px) {
  .locked-user-secret-dialog {
    &__header {
      align-items: stretch;
      flex-direction: column;
      gap: 10px;
      padding: 10px 40px 10px 0;
    }

    &__search-area,
    &__search {
      width: 100%;
    }

    &__search {
      min-width: 0;
      flex: 1;
    }
  }

  :global(.locked-user-secret-dialog.vault-card-edit-dialog.el-dialog .el-dialog__header) {
    min-height: 112px;
  }
}
</style>
