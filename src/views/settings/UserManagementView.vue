<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Building2, KeyRound, RefreshCw, Search, Settings, UsersRound } from '@lucide/vue'
import { listTenants, type Tenant } from '@/api/tenant'
import { listManagedUsers, type UserManagementListItem } from '@/api/user'
import { formatDateTime } from '@/utils/format'
import LockedUserSecretDialog from './components/LockedUserSecretDialog.vue'
import UserEditDialog from './components/UserEditDialog.vue'

defineOptions({ name: 'UserManagementView' })

const tenantPageSize = 200
const tenantOptions = ref<Tenant[]>([])
const selectedTenantID = ref('')
const tenantLoading = ref(false)

const keywordDraft = ref('')
const keyword = ref('')
const users = ref<UserManagementListItem[]>([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(20)
const listLoading = ref(false)
const listFailed = ref(false)
let listRequestID = 0
const secretDialogVisible = ref(false)
const secretTarget = ref<UserManagementListItem>()
const editDialogVisible = ref(false)
const editTarget = ref<UserManagementListItem>()

const selectedTenantName = computed(() => {
  if (!selectedTenantID.value) return '全部租户'
  return tenantOptions.value.find((item) => item.id === selectedTenantID.value)?.name || '当前租户'
})

function mergeTenants(pages: Tenant[][]): Tenant[] {
  const options = new Map<string, Tenant>()
  for (const page of pages) {
    for (const tenant of page) options.set(tenant.id, tenant)
  }
  return [...options.values()].sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))
}

async function loadTenantOptions(): Promise<void> {
  if (tenantLoading.value) return
  tenantLoading.value = true
  try {
    const first = await listTenants({ pageNum: 1, pageSize: tenantPageSize })
    const pageCount = Math.ceil(first.total / tenantPageSize)
    const rest =
      pageCount > 1
        ? await Promise.all(
            Array.from({ length: pageCount - 1 }, (_, index) =>
              listTenants({ pageNum: index + 2, pageSize: tenantPageSize }),
            ),
          )
        : []
    tenantOptions.value = mergeTenants([first.list, ...rest.map((page) => page.list)])
  } catch {
    tenantOptions.value = []
  } finally {
    tenantLoading.value = false
  }
}

async function loadUsers(): Promise<void> {
  const requestID = ++listRequestID
  listLoading.value = true
  listFailed.value = false
  try {
    const result = await listManagedUsers({
      tenantId: selectedTenantID.value || undefined,
      keyword: keyword.value || undefined,
      pageNum: pageNum.value,
      pageSize: pageSize.value,
    })
    if (requestID !== listRequestID) return
    users.value = result.list
    total.value = result.total
    if (users.value.length === 0 && pageNum.value > 1 && total.value > 0) {
      pageNum.value -= 1
      await loadUsers()
    }
  } catch {
    if (requestID !== listRequestID) return
    users.value = []
    total.value = 0
    listFailed.value = true
  } finally {
    if (requestID === listRequestID) listLoading.value = false
  }
}

function searchUsers(): void {
  keyword.value = keywordDraft.value.trim()
  pageNum.value = 1
  void loadUsers()
}

function clearSearch(): void {
  if (keywordDraft.value !== '') return
  keyword.value = ''
  pageNum.value = 1
  void loadUsers()
}

function changeTenant(): void {
  pageNum.value = 1
  void loadUsers()
}

function changePage(page: number): void {
  pageNum.value = page
  void loadUsers()
}

function changePageSize(size: number): void {
  pageSize.value = size
  pageNum.value = 1
  void loadUsers()
}

async function refresh(): Promise<void> {
  await Promise.all([loadTenantOptions(), loadUsers()])
}

function userInitial(user: UserManagementListItem): string {
  return (user.nickname || user.username || user.userId || '?').slice(0, 1).toUpperCase()
}

function asManagedUser(row: unknown): UserManagementListItem {
  return row as UserManagementListItem
}

function openSecretManagement(user: UserManagementListItem): void {
  if (!user.isBlocked) return
  secretTarget.value = user
  secretDialogVisible.value = true
}

function openUserEdit(user: UserManagementListItem): void {
  editTarget.value = user
  editDialogVisible.value = true
}

function handleUserSaved(): void {
  void loadUsers()
}

onMounted(() => {
  void Promise.all([loadTenantOptions(), loadUsers()])
})
</script>

<template>
  <section class="user-management-page">
    <header class="user-management-toolbar">
      <div class="user-management-toolbar__tenant">
        <span class="user-management-toolbar__tenant-icon" aria-hidden="true">
          <Building2 :size="16" :stroke-width="1.8" />
        </span>
        <el-select
          v-model="selectedTenantID"
          filterable
          :loading="tenantLoading"
          placeholder="全部租户"
          aria-label="按租户筛选用户"
          @change="changeTenant"
        >
          <el-option label="全部租户" value="" />
          <el-option
            v-for="tenant in tenantOptions"
            :key="tenant.id"
            :label="tenant.name"
            :value="tenant.id"
          />
        </el-select>
      </div>

      <div class="user-management-toolbar__actions">
        <el-input
          v-model="keywordDraft"
          clearable
          class="user-management-toolbar__search"
          placeholder="搜索姓名、账号、用户 ID 或邮箱"
          aria-label="搜索用户"
          @keyup.enter="searchUsers"
          @clear="clearSearch"
        />
        <el-tooltip content="查询" placement="bottom">
          <button
            type="button"
            class="user-management-round-action"
            aria-label="查询用户"
            @click="searchUsers"
          >
            <Search :size="16" :stroke-width="1.8" />
          </button>
        </el-tooltip>
        <el-tooltip content="刷新" placement="bottom">
          <button
            type="button"
            class="user-management-round-action"
            :disabled="listLoading || tenantLoading"
            aria-label="刷新用户列表"
            @click="refresh"
          >
            <RefreshCw
              :size="16"
              :stroke-width="1.8"
              :class="{ 'is-spinning': listLoading || tenantLoading }"
            />
          </button>
        </el-tooltip>
      </div>
    </header>

    <main class="user-management-content">
      <section class="user-management-table" aria-label="用户列表">
        <header class="user-management-table__header">
          <div>
            <span class="user-management-table__symbol" aria-hidden="true">
              <UsersRound :size="18" :stroke-width="1.8" />
            </span>
            <div>
              <h1>用户管理</h1>
              <span>{{ selectedTenantName }} · {{ total }} 人</span>
            </div>
          </div>
        </header>

        <div v-loading="listLoading" class="user-management-table__body">
          <el-table v-if="users.length" :data="users" row-key="id" table-layout="fixed">
            <el-table-column label="用户" min-width="220">
              <template #default="{ row }">
                <div class="managed-user">
                  <span class="managed-user__avatar">{{ userInitial(asManagedUser(row)) }}</span>
                  <span class="managed-user__identity">
                    <strong :title="row.nickname || row.username || row.userId">
                      {{ row.nickname || row.username || row.userId }}
                    </strong>
                    <small :title="row.userId">{{ row.userId }}</small>
                  </span>
                </div>
              </template>
            </el-table-column>
            <el-table-column prop="username" label="登录账号" min-width="150" show-overflow-tooltip>
              <template #default="{ row }">{{ row.username || '—' }}</template>
            </el-table-column>
            <el-table-column
              prop="tenantName"
              label="所属租户"
              min-width="160"
              show-overflow-tooltip
            >
              <template #default="{ row }">{{ row.tenantName || '未分配' }}</template>
            </el-table-column>
            <el-table-column prop="orgName" label="所属组织" min-width="160" show-overflow-tooltip>
              <template #default="{ row }">{{ row.orgName || '未分配' }}</template>
            </el-table-column>
            <el-table-column label="联系方式" min-width="230">
              <template #default="{ row }">
                <div class="managed-user-contact">
                  <span :title="row.email">{{ row.email || '—' }}</span>
                  <small v-if="row.phone" :title="row.phone">{{ row.phone }}</small>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="104" align="center">
              <template #default="{ row }">
                <el-tag :type="row.isBlocked ? 'danger' : 'success'" size="small" effect="plain">
                  {{ row.isBlocked ? '已锁定' : '正常' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="更新时间" width="168">
              <template #default="{ row }">{{ formatDateTime(row.updateAt) || '—' }}</template>
            </el-table-column>
            <el-table-column label="操作" width="148" fixed="right" align="center">
              <template #default="{ row }">
                <div class="managed-user-actions">
                  <button
                    type="button"
                    class="managed-user-settings-action"
                    :aria-label="`编辑${row.nickname || row.username || row.userId}的用户信息`"
                    @click="openUserEdit(asManagedUser(row))"
                  >
                    <Settings :size="16" :stroke-width="1.8" />
                  </button>
                  <el-button
                    v-if="row.isBlocked"
                    type="primary"
                    link
                    class="managed-user-secret-action"
                    @click="openSecretManagement(asManagedUser(row))"
                  >
                    <KeyRound :size="15" :stroke-width="1.8" />
                    <span>密钥处理</span>
                  </el-button>
                </div>
              </template>
            </el-table-column>
          </el-table>

          <div v-else-if="!listLoading" class="user-management-empty">
            <span><UsersRound :size="26" :stroke-width="1.6" /></span>
            <strong>{{ listFailed ? '用户列表加载失败' : '暂无用户' }}</strong>
            <el-button v-if="listFailed" type="primary" plain @click="loadUsers"
              >重新加载</el-button
            >
          </div>
        </div>

        <footer v-if="total > 0" class="user-management-table__footer">
          <el-pagination
            v-model:current-page="pageNum"
            v-model:page-size="pageSize"
            :total="total"
            :page-sizes="[20, 50, 100, 200]"
            layout="total, sizes, prev, pager, next"
            @current-change="changePage"
            @size-change="changePageSize"
          />
        </footer>
      </section>
    </main>

    <LockedUserSecretDialog v-model="secretDialogVisible" :user="secretTarget" />
    <UserEditDialog
      v-model="editDialogVisible"
      :user="editTarget"
      :tenants="tenantOptions"
      @saved="handleUserSaved"
    />
  </section>
</template>

<style scoped lang="scss">
.user-management-page {
  height: 100%;
  min-height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--v-app-bg);
  color: var(--v-text-primary);
}

.user-management-toolbar {
  min-height: 60px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 0 24px;
  border-bottom: 1px solid var(--v-divider);
  background: var(--v-surface-bg);

  &__tenant {
    width: 280px;
    display: flex;
    align-items: center;
    gap: 8px;

    :deep(.el-select) {
      flex: 1;
    }

    :deep(.el-select__wrapper) {
      min-height: 34px;
      border-radius: var(--v-radius-md);
      box-shadow: 0 0 0 1px var(--v-surface-border) inset;
    }
  }

  &__tenant-icon {
    width: 32px;
    height: 32px;
    flex: 0 0 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--v-surface-border);
    border-radius: 50%;
    background: var(--v-surface-bg-subtle);
    color: var(--v-text-secondary);
  }

  &__actions {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  &__search {
    width: 280px;

    :deep(.el-input__wrapper) {
      min-height: 34px;
      border-radius: 999px !important;
      background: var(--v-surface-bg-subtle);
      box-shadow: none;
    }
  }
}

.user-management-round-action {
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
  transition:
    border-color 0.18s ease,
    color 0.18s ease,
    background-color 0.18s ease;

  &:hover:not(:disabled),
  &:focus-visible:not(:disabled) {
    border-color: rgb(23, 93, 251);
    color: rgb(23, 93, 251);
    outline: none;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.48;
  }

  .is-spinning {
    animation: user-management-spin 0.9s linear infinite;
  }
}

.user-management-content {
  min-height: 0;
  flex: 1;
  padding: 20px 24px 28px;
  overflow: auto;
}

.user-management-table {
  max-width: 1440px;
  min-height: 480px;
  margin: 0 auto;
  overflow: hidden;
  border: 1px solid var(--v-surface-border);
  border-radius: var(--v-radius-md);
  background: var(--v-surface-bg);
  box-shadow: var(--v-shadow-sm);

  &__header {
    min-height: 64px;
    display: flex;
    align-items: center;
    padding: 10px 18px;
    border-bottom: 1px solid var(--v-divider);

    > div {
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 11px;
    }

    h1,
    span {
      margin: 0;
    }

    h1 {
      color: var(--v-text-primary);
      font-size: var(--v-font-lg);
      font-weight: 650;
      letter-spacing: 0;
    }

    > div > div > span {
      color: var(--v-text-tertiary);
      font-size: var(--v-font-xs);
    }
  }

  &__symbol {
    width: 36px;
    height: 36px;
    flex: 0 0 36px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--v-radius-sm);
    background: rgba(23, 93, 251, 0.09);
    color: rgb(23, 93, 251);
  }

  &__body {
    min-height: 350px;
    overflow: hidden;

    :deep(.el-table) {
      width: 100%;
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

  &__footer {
    display: flex;
    justify-content: flex-end;
    padding: 12px 16px;
    border-top: 1px solid var(--v-divider);
  }
}

.managed-user-secret-action {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: var(--v-font-xs);
  font-weight: 600;
}

.managed-user-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.managed-user-settings-action {
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid var(--v-surface-border);
  border-radius: 50%;
  background: var(--v-surface-bg);
  color: var(--v-text-secondary);
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    color 0.18s ease,
    background-color 0.18s ease;

  &:hover,
  &:focus-visible {
    border-color: rgb(23, 93, 251);
    background: rgba(23, 93, 251, 0.07);
    color: rgb(23, 93, 251);
    outline: none;
  }
}

.managed-user {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;

  &__avatar {
    width: 32px;
    height: 32px;
    flex: 0 0 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: rgba(23, 93, 251, 0.1);
    color: rgb(23, 93, 251);
    font-size: var(--v-font-sm);
    font-weight: 700;
  }

  &__identity {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;

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
}

.managed-user-contact {
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
    color: var(--v-text-primary);
  }

  small {
    color: var(--v-text-tertiary);
    font-size: var(--v-font-xs);
  }
}

.user-management-empty {
  min-height: 350px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--v-text-secondary);

  > span {
    width: 50px;
    height: 50px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: var(--v-surface-bg-subtle);
    color: var(--v-text-tertiary);
  }

  strong {
    color: var(--v-text-primary);
    font-size: var(--v-font-md);
    font-weight: 600;
  }
}

@keyframes user-management-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 760px) {
  .user-management-toolbar {
    align-items: stretch;
    flex-direction: column;
    gap: 10px;
    padding: 12px 16px;

    &__tenant,
    &__actions {
      width: 100%;
    }

    &__search {
      min-width: 0;
      flex: 1;
      width: auto;
    }
  }

  .user-management-content {
    padding: 16px;
  }
}
</style>
