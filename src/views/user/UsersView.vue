<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import {
  CircleClose,
  Lock,
  Plus,
  Refresh,
  Search,
  User as UserIcon,
  UserFilled,
} from '@element-plus/icons-vue'
import { ApiError } from '@/types/api'
import type { RbacUser, Role, RoleGrant, EffectivePermissionResult } from '@/types/rbac'
import {
  listRbacUsers,
  listUserGrants,
  listRoles,
  getUserPermissions,
} from '@/api/rbac'
import { withApiCall } from '@/composables/use-api-call'
import { usePermission } from '@/composables/use-permission'
import { Permission } from '@/constants/permission'
import { formatDateTime } from '@/utils/format'

const { has } = usePermission()

/* ==================== 列表 ==================== */
const users = ref<RbacUser[]>([])
const usersLoading = ref(false)
const usersKeyword = ref<string>('')
const usersTotal = ref(0)
const usersPage = ref(1)
const usersPageSize = ref(20)

const filteredUsers = computed<RbacUser[]>(() => {
  // 后端不分页场景下,前端再过一次关键词过滤
  const kw = usersKeyword.value.trim().toLowerCase()
  if (!kw) return users.value
  return users.value.filter(
    (u) =>
      (u.name ?? '').toLowerCase().includes(kw) ||
      (u.email ?? '').toLowerCase().includes(kw) ||
      (u.externalUserId ?? '').toLowerCase().includes(kw),
  )
})

/** 用 global 作用域列所有 user —— 文档里该接口按 caller 权限收窄 */
async function loadUsers(): Promise<void> {
  usersLoading.value = true
  try {
    const resp = await withApiCall(() =>
      listRbacUsers({
        scope: { scopeType: 'global' },
        pageNum: usersPage.value,
        pageSize: usersPageSize.value,
      }),
    )
    users.value = (resp.total > 0 ? resp.list : null) ?? []
    usersTotal.value = resp.total
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : '加载用户失败'
    ElMessage.error(msg)
    users.value = []
    usersTotal.value = 0
  } finally {
    usersLoading.value = false
  }
}

function onPageChange(p: number, ps: number): void {
  usersPage.value = p
  usersPageSize.value = ps
  void loadUsers()
}

/* ==================== 详情面板 ==================== */
const selectedUserId = ref<string>('')
const selectedUser = computed<RbacUser | null>(() => {
  if (!selectedUserId.value) return null
  return users.value.find((u) => u.id === selectedUserId.value) ?? null
})

type DetailTab = 'info' | 'grants' | 'perms'
const detailTab = ref<DetailTab>('info')

const userGrants = ref<RoleGrant[]>([])
const grantsLoading = ref(false)
const userPerms = ref<EffectivePermissionResult | null>(null)
const permsLoading = ref(false)

async function loadGrants(): Promise<void> {
  if (!selectedUserId.value) {
    userGrants.value = []
    return
  }
  grantsLoading.value = true
  try {
    const resp = await withApiCall(() =>
      listUserGrants({ userId: selectedUserId.value, pageNum: 1, pageSize: 100 }),
    )
    userGrants.value = (resp.total > 0 ? resp.list : null) ?? []
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : '加载授权失败'
    ElMessage.error(msg)
    userGrants.value = []
  } finally {
    grantsLoading.value = false
  }
}

async function loadPerms(): Promise<void> {
  if (!selectedUserId.value) {
    userPerms.value = null
    return
  }
  permsLoading.value = true
  try {
    // 有效权限需要 scope —— 用 global 拿用户的"最高"视图
    userPerms.value = await withApiCall(() =>
      getUserPermissions({
        userId: selectedUserId.value,
        scopeType: 'global',
      }),
    )
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : '加载有效权限失败'
    ElMessage.error(msg)
    userPerms.value = null
  } finally {
    permsLoading.value = false
  }
}

function onUserClick(u: RbacUser): void {
  if (!u.id) return
  selectedUserId.value = u.id
  detailTab.value = 'info'
}

function onDetailTabChange(tab: DetailTab): void {
  detailTab.value = tab
  if (tab === 'grants' && userGrants.value.length === 0 && !grantsLoading) {
    void loadGrants()
  } else if (tab === 'perms' && !userPerms.value && !permsLoading) {
    void loadPerms()
  }
}

/* ==================== 工具 ==================== */
const canRead = computed(() => has(Permission.RbacBindingRead))
const canManage = computed(() => has(Permission.RbacBindingManage))

function sourceLabel(s: string | undefined): string {
  if (s === 'jwt') return 'JWT'
  if (s === 'password') return '密码'
  return s || '—'
}

/* ==================== 授权弹框(简化版) ==================== */
const availableRoles = ref<Role[]>([])
const rolesLoading = ref(false)
const grantDialogVisible = ref(false)

async function loadAvailableRoles(): Promise<void> {
  rolesLoading.value = true
  try {
    const resp = await withApiCall(() => listRoles())
    // 无分页 GET,后端直接返回 Role[] 数组
    availableRoles.value = Array.isArray(resp) ? resp : []
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : '加载角色失败'
    ElMessage.error(msg)
    availableRoles.value = []
  } finally {
    rolesLoading.value = false
  }
}

async function openGrantDialog(): Promise<void> {
  if (!selectedUser.value) {
    ElMessage.warning('请先选择左侧用户')
    return
  }
  grantDialogVisible.value = true
  await loadAvailableRoles()
}

onMounted(() => {
  if (!canRead.value) return
  void loadUsers()
})
</script>

<template>
  <div class="users-page">
    <header class="page-header">
      <div>
        <h1 class="page-header__title">用户管理</h1>
        <p class="page-header__desc">
          列出系统内所有用户(global scope)。点击行查看详情:基本信息 / 直接授权 / 有效权限。
        </p>
      </div>
      <div class="page-header__actions">
        <el-input
          v-model="usersKeyword"
          placeholder="按姓名 / 邮箱 / userId 搜索"
          clearable
          class="page-header__search"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
        <el-button :icon="Refresh" :loading="usersLoading" @click="loadUsers" />
      </div>
    </header>

    <div v-if="!canRead" class="users-page__hint">
      <el-icon><CircleClose /></el-icon>
      <span>当前账号没有 <code>rbac:binding:read</code> 权限,无法查看用户列表。</span>
    </div>

    <div v-else class="users-page__body">
      <!-- 左:用户列表 -->
      <section class="users-pane">
        <ul v-loading="usersLoading" class="users-pane__list">
          <li
            v-for="u in filteredUsers"
            :key="u.id"
            class="users-pane__item"
            :class="{ 'is-selected': selectedUserId === u.id }"
            @click="onUserClick(u)"
          >
            <el-icon class="users-pane__avatar">
              <UserFilled v-if="u.isDisabled" />
              <UserIcon v-else />
            </el-icon>
            <div class="users-pane__info">
              <div class="users-pane__name">
                {{ u.name || u.externalUserId }}
                <el-tag v-if="u.isDisabled" size="small" type="danger" effect="plain">禁用</el-tag>
              </div>
              <div class="users-pane__sub">
                <span v-if="u.email">{{ u.email }}</span>
                <span v-else class="muted">{{ u.externalUserId }}</span>
              </div>
            </div>
            <el-tag
              v-if="u.source"
              size="small"
              effect="plain"
              :type="u.source === 'jwt' ? 'info' : 'success'"
              class="users-pane__source"
            >
              {{ sourceLabel(u.source) }}
            </el-tag>
          </li>
          <li v-if="filteredUsers.length === 0 && !usersLoading" class="users-pane__empty">
            暂无用户
          </li>
        </ul>
        <div class="users-pane__pager">
          <el-pagination
            background
            small
            layout="total, prev, pager, next"
            :total="usersTotal"
            :current-page="usersPage"
            :page-size="usersPageSize"
            @current-change="(p: number) => onPageChange(p, usersPageSize)"
          />
        </div>
      </section>

      <!-- 右:用户详情 -->
      <section class="detail-pane">
        <template v-if="!selectedUser">
          <div class="detail-pane__empty">
            <el-icon class="detail-pane__empty-icon"><UserIcon /></el-icon>
            <p>从左侧选择一个用户查看详情</p>
          </div>
        </template>

        <template v-else>
          <header class="detail-pane__head">
            <el-icon class="detail-pane__avatar"><UserFilled /></el-icon>
            <div class="detail-pane__head-info">
              <div class="detail-pane__name">
                {{ selectedUser.name || selectedUser.externalUserId }}
                <el-tag
                  v-if="selectedUser.isDisabled"
                  size="small"
                  type="danger"
                  effect="plain"
                >禁用</el-tag>
              </div>
              <div class="detail-pane__sub">
                <code>{{ selectedUser.externalUserId }}</code>
                <span v-if="selectedUser.email" class="muted"> · {{ selectedUser.email }}</span>
              </div>
            </div>
            <div class="detail-pane__head-actions">
              <el-button
                type="primary"
                :icon="Plus"
                :disabled="!canManage"
                @click="openGrantDialog"
              >
                授权
              </el-button>
            </div>
          </header>

          <el-tabs
            :model-value="detailTab"
            @update:model-value="(t) => onDetailTabChange(t as DetailTab)"
            class="detail-pane__tabs"
          >
            <el-tab-pane name="info" label="基本信息" />
            <el-tab-pane name="grants" :label="`直接授权 (${userGrants.length})`" />
            <el-tab-pane name="perms" :label="`有效权限 (${userPerms?.permissions.length ?? 0})`" />
          </el-tabs>

          <!-- 基本信息 -->
          <section v-show="detailTab === 'info'" class="detail-pane__body">
            <el-descriptions :column="1" border size="small">
              <el-descriptions-item label="ID">
                <code class="mono">{{ selectedUser.id }}</code>
              </el-descriptions-item>
              <el-descriptions-item label="externalUserId">
                <code class="mono">{{ selectedUser.externalUserId }}</code>
              </el-descriptions-item>
              <el-descriptions-item label="姓名">{{ selectedUser.name || '—' }}</el-descriptions-item>
              <el-descriptions-item label="邮箱">{{ selectedUser.email || '—' }}</el-descriptions-item>
              <el-descriptions-item label="来源">
                <el-tag
                  size="small"
                  effect="plain"
                  :type="selectedUser.source === 'jwt' ? 'info' : 'success'"
                >
                  {{ sourceLabel(selectedUser.source) }}
                </el-tag>
                <span class="muted detail-pane__hint-inline">
                  jwt = 外部 JWT 同步;password = 本地密码用户
                </span>
              </el-descriptions-item>
              <el-descriptions-item v-if="selectedUser.lastSeenAt" label="最后活跃">
                {{ formatDateTime(selectedUser.lastSeenAt) }}
              </el-descriptions-item>
              <el-descriptions-item label="状态">
                <el-tag
                  size="small"
                  :type="selectedUser.isDisabled ? 'danger' : 'success'"
                  effect="light"
                >
                  {{ selectedUser.isDisabled ? '已禁用' : '正常' }}
                </el-tag>
              </el-descriptions-item>
            </el-descriptions>
          </section>

          <!-- 直接授权 -->
          <section v-show="detailTab === 'grants'" class="detail-pane__body" v-loading="grantsLoading">
            <el-table
              :data="userGrants"
              empty-text="该用户没有任何直接授权"
              class="detail-pane__table"
            >
              <el-table-column prop="roleCode" label="角色" min-width="180">
                <template #default="{ row }">
                  <el-tag size="small" effect="plain" type="info">{{ row.roleCode }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column label="作用域" min-width="200">
                <template #default="{ row }">
                  <code class="mono">{{ row.resourceType }}<span v-if="row.resourceId">:{{ row.resourceId.slice(0, 8) }}…</span></code>
                </template>
              </el-table-column>
              <el-table-column label="过期" min-width="180">
                <template #default="{ row }">
                  <span v-if="row.expiresAt" class="muted">{{ formatDateTime(row.expiresAt) }}</span>
                  <span v-else class="muted">永久</span>
                </template>
              </el-table-column>
              <el-table-column label="授权人" min-width="120">
                <template #default="{ row }">
                  <span class="muted">{{ row.grantedBy || '—' }}</span>
                </template>
              </el-table-column>
            </el-table>
          </section>

          <!-- 有效权限 -->
          <section v-show="detailTab === 'perms'" class="detail-pane__body" v-loading="permsLoading">
            <div v-if="userPerms" class="detail-pane__perms">
              <div class="detail-pane__perm-meta">
                <el-icon><Lock /></el-icon>
                <span>
                  共 <strong>{{ userPerms.permissions.length }}</strong> 个有效权限(在 global scope 下)
                </span>
              </div>
              <div v-if="userPerms.sourceGrants.length > 0" class="detail-pane__perm-source">
                <h4>权限来源 ({{ userPerms.sourceGrants.length }})</h4>
                <el-tag
                  v-for="g in userPerms.sourceGrants"
                  :key="`${g.roleCode}-${g.scopeType}-${g.scopeId}`"
                  size="small"
                  effect="plain"
                  class="detail-pane__source-tag"
                >
                  <code class="mono">{{ g.roleCode }}</code>
                  <span class="muted"> @ {{ g.scopeType }}<span v-if="g.scopeId">:{{ g.scopeId.slice(0, 8) }}…</span></span>
                </el-tag>
              </div>
              <div class="detail-pane__perm-list">
                <h4>权限码清单</h4>
                <div class="detail-pane__perm-grid">
                  <code
                    v-for="p in userPerms.permissions"
                    :key="p"
                    class="detail-pane__perm-chip"
                  >{{ p }}</code>
                </div>
              </div>
            </div>
            <div v-else class="detail-pane__empty">
              <el-icon><CircleClose /></el-icon>
              <span>该用户在 global scope 下没有任何有效权限</span>
            </div>
          </section>
        </template>
      </section>
    </div>

    <!-- ============= 授权弹框(角色列表 - 简化版) ============= -->
    <el-dialog
      v-model="grantDialogVisible"
      width="720px"
      :close-on-click-modal="false"
      title="角色列表"
    >
      <el-table
        v-loading="rolesLoading"
        :data="availableRoles"
        class="users-page__grant-table"
        empty-text="暂无可分配的角色"
        row-key="code"
      >
        <el-table-column prop="name" label="名称" min-width="160" />
        <el-table-column prop="code" label="Code" min-width="180" />
        <el-table-column prop="scopeType" label="Scope" min-width="120" />
        <el-table-column prop="description" label="说明" min-width="220" show-overflow-tooltip />
      </el-table>
    </el-dialog>
  </div>
</template>

<style lang="scss" scoped>
.users-page {
  max-width: 1400px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;

  &__hint {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 36px;
    color: var(--v-text-tertiary);
    font-size: 13px;

    code {
      font-family: var(--el-font-family-monospace, ui-monospace, monospace);
      background: var(--v-surface-bg-subtle);
      padding: 1px 4px;
      border-radius: 3px;
      font-size: 12px;
    }
  }

  &__body {
    display: grid;
    grid-template-columns: 360px 1fr;
    gap: 16px;
    align-items: stretch;
    min-height: 480px;
  }
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;

  &__title {
    margin: 0 0 4px;
    font-size: 22px;
    font-weight: 600;
    letter-spacing: -0.2px;
    color: var(--v-text-primary);
  }
  &__desc {
    margin: 0;
    color: var(--v-text-secondary);
    font-size: 13px;
    max-width: 720px;
  }
  &__actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  &__search {
    width: 260px;
  }
}

.users-pane {
  background: var(--v-surface-bg);
  border: 1px solid var(--v-surface-border);
  border-radius: var(--v-radius-lg);
  display: flex;
  flex-direction: column;
  overflow: hidden;

  &__list {
    list-style: none;
    margin: 0;
    padding: 4px 0;
    flex: 1;
    overflow-y: auto;
    max-height: 60vh;
  }

  &__item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    cursor: pointer;
    transition: background 0.15s ease;

    &:hover {
      background: var(--v-surface-row-hover);
    }

    &.is-selected {
      background: var(--el-color-primary-light-9);
      .users-pane__name {
        color: var(--el-color-primary);
      }
    }
  }

  &__avatar {
    font-size: 20px;
    color: var(--v-text-tertiary);
    flex-shrink: 0;
  }

  &__info {
    flex: 1;
    min-width: 0;
  }

  &__name {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 500;
    color: var(--v-text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__sub {
    font-size: 11px;
    color: var(--v-text-tertiary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__source {
    flex-shrink: 0;
  }

  &__empty {
    padding: 24px 12px;
    text-align: center;
    color: var(--v-text-tertiary);
    font-size: 12px;
  }

  &__pager {
    padding: 8px 12px;
    border-top: 1px solid var(--v-divider);
    display: flex;
    justify-content: flex-end;
  }
}

.detail-pane {
  background: var(--v-surface-bg);
  border: 1px solid var(--v-surface-border);
  border-radius: var(--v-radius-lg);
  display: flex;
  flex-direction: column;
  overflow: hidden;

  &__head {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 18px;
    border-bottom: 1px solid var(--v-divider);
    background: var(--v-surface-bg-subtle);
  }

  &__head-info {
    flex: 1;
    min-width: 0;
  }

  &__head-actions {
    flex-shrink: 0;
  }

  &__avatar {
    font-size: 28px;
    color: var(--el-color-primary);
    flex-shrink: 0;
  }

  &__name {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 15px;
    font-weight: 600;
    color: var(--v-text-primary);
  }

  &__sub {
    margin-top: 2px;
    font-size: 12px;
    color: var(--v-text-secondary);

    code {
      font-family: var(--el-font-family-monospace, ui-monospace, monospace);
      background: var(--v-surface-bg-subtle);
      padding: 1px 5px;
      border-radius: 3px;
      font-size: 11px;
    }
  }

  &__tabs {
    padding: 0 18px;
  }

  &__body {
    flex: 1;
    overflow-y: auto;
    padding: 12px 18px 18px;
  }

  &__table {
    width: 100%;
  }

  &__empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 60px 0;
    color: var(--v-text-tertiary);
    font-size: 13px;

    &-icon {
      font-size: 32px;
      color: var(--v-divider);
    }
  }

  &__hint-inline {
    margin-left: 8px;
    font-size: 11px;
  }

  &__perms {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  &__perm-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: var(--v-text-primary);

    strong {
      color: var(--el-color-primary);
      margin: 0 2px;
    }
  }

  &__perm-source,
  &__perm-list {
    h4 {
      margin: 0 0 8px;
      font-size: 12px;
      font-weight: 600;
      color: var(--v-text-secondary);
      letter-spacing: 0.3px;
    }
  }

  &__source-tag {
    margin: 0 4px 4px 0;

    code {
      font-family: var(--el-font-family-monospace, ui-monospace, monospace);
      font-size: 11px;
    }
  }

  &__perm-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  &__perm-chip {
    font-family: var(--el-font-family-monospace, ui-monospace, monospace);
    font-size: 11px;
    background: var(--el-color-primary-light-9);
    color: var(--el-color-primary);
    padding: 2px 6px;
    border-radius: 3px;
  }
}

.muted {
  color: var(--v-text-tertiary);
}

.mono {
  font-family: var(--el-font-family-monospace, ui-monospace, monospace);
  font-size: 12px;
}
</style>
