<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox, type FormInstance } from 'element-plus'
import {
  ArrowRight,
  CircleClose,
  Delete,
  Lock,
  Plus,
  Refresh,
  Search,
  User as UserIcon,
} from '@element-plus/icons-vue'
import { useOrganizationStore } from '@/stores/organization'
import { useProjectStore } from '@/stores/project'
import { useEnvStore } from '@/stores/env'
import { useFolderStore } from '@/stores/folder'
import { ApiError } from '@/types/api'
import type { Organization } from '@/types/organization'
import type { Project } from '@/types/project'
import type { Environment } from '@/types/env'
import type { Folder } from '@/types/folder'
import type { Role, RbacUser, RoleGrant, Scope, ScopeType } from '@/types/rbac'
import { getProjectOrgId } from '@/utils/project'
import { getEnvProjectId } from '@/utils/env'
import { getFolderEnvId } from '@/utils/folder'
import {
  listRoles,
  listRbacUsers,
  listUserGrants,
  grantRole,
  revokeRole,
} from '@/api/rbac'
import { withApiCall } from '@/composables/use-api-call'
import { usePermission } from '@/composables/use-permission'
import { Permission } from '@/constants/permission'
import { formatDateTime } from '@/utils/format'

const orgStore = useOrganizationStore()
const projectStore = useProjectStore()
const envStore = useEnvStore()
const folderStore = useFolderStore()
const { has } = usePermission()

type TabKey = ScopeType
const activeTab = ref<TabKey>('organization')

const selectedOrgId = ref<string>('')
const selectedProjectId = ref<string>('')
const selectedEnvId = ref<string>('')
const selectedFolderId = ref<string>('')

const currentScope = computed<Scope | null>(() => {
  switch (activeTab.value) {
    case 'global':
      return { scopeType: 'global' }
    case 'organization':
      return selectedOrgId.value ? { scopeType: 'organization', scopeId: selectedOrgId.value } : null
    case 'project':
      return selectedProjectId.value ? { scopeType: 'project', scopeId: selectedProjectId.value } : null
    case 'environment':
      return selectedEnvId.value ? { scopeType: 'environment', scopeId: selectedEnvId.value } : null
    case 'folder':
      return selectedFolderId.value ? { scopeType: 'folder', scopeId: selectedFolderId.value } : null
  }
})

const orgOptions = computed<Organization[]>(() => orgStore.items)
const projectOptions = computed<Project[]>(() =>
  projectStore.items.filter((p) => getProjectOrgId(p) === selectedOrgId.value),
)
const envOptions = computed<Environment[]>(() =>
  envStore.items.filter((e) => getEnvProjectId(e) === selectedProjectId.value),
)
const folderOptions = computed<Folder[]>(() => {
  if (!selectedEnvId.value) return []
  return folderStore.items.filter(
    (f) => getFolderEnvId(f) === selectedEnvId.value && f.level === 1,
  )
})

watch(selectedEnvId, async (envId) => {
  if (envId && activeTab.value === 'folder' && folderStore.context?.parent !== envId) {
    try {
      await folderStore.fetchList({
        environmentId: envId,
        includeSubfolders: true,
        pageNum: 1,
        pageSize: 100,
      })
    } catch {
      // ignore
    }
  }
})

const users = ref<RbacUser[]>([])
const usersLoading = ref(false)
const usersKeyword = ref<string>('')

const filteredUsers = computed<RbacUser[]>(() => {
  const kw = usersKeyword.value.trim().toLowerCase()
  if (!kw) return users.value
  return users.value.filter(
    (u) =>
      (u.name ?? '').toLowerCase().includes(kw) ||
      (u.email ?? '').toLowerCase().includes(kw) ||
      (u.externalUserId ?? '').toLowerCase().includes(kw),
  )
})

async function loadUsers(): Promise<void> {
  if (!currentScope.value) return
  usersLoading.value = true
  try {
    const resp = await withApiCall(() =>
      listRbacUsers({ scope: currentScope.value!, pageNum: 1, pageSize: 100 }),
    )
    users.value = (resp.total > 0 ? resp.list : null) ?? []
    if (users.value.length > 0 && !selectedUserId.value) {
      selectedUserId.value = users.value[0]?.id! ?? ''
    }
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : '加载用户失败'
    ElMessage.error(msg)
    users.value = []
  } finally {
    usersLoading.value = false
  }
}

const selectedUserId = ref<string>('')
const selectedUser = computed<RbacUser | null>(() => {
  if (!selectedUserId.value) return null
  return users.value.find((u) => u.id === selectedUserId.value) ?? null
})

const userGrants = ref<RoleGrant[]>([])
const grantsLoading = ref(false)
const availableRoles = ref<Role[]>([])

async function loadAvailableRoles(): Promise<void> {
  if (!currentScope.value) return
  try {
    const resp = await withApiCall(() => listRoles())
    // 无分页 GET,后端直接返回 Role[] 数组
    availableRoles.value = Array.isArray(resp) ? resp : []
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : '加载角色失败'
    ElMessage.error(msg)
    availableRoles.value = []
  }
}

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

const visibleGrants = computed<RoleGrant[]>(() => {
  if (!currentScope.value) return []
  return userGrants.value.filter((g) => {
    if (g.resourceType !== currentScope.value!.scopeType) return false
    if (currentScope.value!.scopeType === 'global') return true
    return g.resourceId === currentScope.value!.scopeId
  })
})

watch(
  () => [
    activeTab.value,
    selectedOrgId.value,
    selectedProjectId.value,
    selectedEnvId.value,
    selectedFolderId.value,
  ],
  async () => {
    if (!currentScope.value) {
      users.value = []
      userGrants.value = []
      return
    }
    selectedUserId.value = ''
    userGrants.value = []
    await Promise.all([loadUsers(), loadAvailableRoles()])
  },
)

watch(selectedUserId, () => {
  void loadGrants()
})

const grantDialogVisible = ref(false)
const grantSubmitting = ref(false)
const grantFormRef = ref<FormInstance>()

const grantForm = reactive<{
  roleCode: string
  scopeId: string
  expiresAt: string
}>({
  roleCode: '',
  scopeId: '',
  expiresAt: '',
})

// 表单不用 el-form 校验,改用 canSubmit 控制提交按钮 disabled

const availableRoleOptions = computed(() => {
  const assigned = new Set(visibleGrants.value.map((g) => g.roleCode))
  return availableRoles.value.filter((r) => !assigned.has(r.code))
})

/** 按 scopeType 分组的可分配角色 */
interface RoleGroup {
  scopeType: ScopeType
  scopeTypeLabel: string
  roles: Role[]
}
const roleGroups = computed<RoleGroup[]>(() => {
  const buckets = new Map<ScopeType, Role[]>()
  for (const r of availableRoleOptions.value) {
    const list = buckets.get(r.scopeType) ?? []
    list.push(r)
    buckets.set(r.scopeType, list)
  }
  const labelMap: Record<ScopeType, string> = {
    global: 'Global(平台级)',
    organization: 'Organization(组织)',
    project: 'Project(项目)',
    environment: 'Environment(环境)',
    folder: 'Folder(目录)',
  }
  const order: ScopeType[] = ['organization', 'project', 'environment', 'folder', 'global']
  return order
    .filter((k) => buckets.has(k))
    .map((k) => ({
      scopeType: k,
      scopeTypeLabel: labelMap[k],
      roles: buckets.get(k) ?? [],
    }))
})

/** 当前选中的角色(grantForm.roleCode 决定的) */
const selectedRole = computed<Role | null>(() => {
  if (!grantForm.roleCode) return null
  return availableRoles.value.find((r) => r.code === grantForm.roleCode) ?? null
})

/** 当前选中角色对应的可分配资源(从当前用户可见的 org/project/env/folder 列表里筛) */
const resourcesForRole = computed<Array<{ id: string; name: string; code: string }>>(() => {
  const role = selectedRole.value
  if (!role) return []
  if (role.scopeType === 'global') return []  // global 不需要 scopeId
  if (role.scopeType === 'organization') {
    return orgOptions.value.map((o) => ({ id: o.id, name: o.name, code: o.code }))
  }
  if (role.scopeType === 'project') {
    return projectOptions.value.map((p) => ({ id: p.id, name: p.name, code: p.code }))
  }
  if (role.scopeType === 'environment') {
    return envOptions.value.map((e) => ({ id: e.id, name: e.name, code: e.code }))
  }
  // folder
  return folderOptions.value.map((f) => ({ id: f.id, name: f.name, code: f.code }))
})

/** 资源列表变更时,如果之前选中的 scopeId 已不存在(列表变了),就清掉 */
watch(resourcesForRole, (list) => {
  if (grantForm.scopeId && !list.some((r) => r.id === grantForm.scopeId)) {
    grantForm.scopeId = ''
  }
})

/** 可提交条件 */
const canSubmit = computed(() => {
  if (!grantForm.roleCode) return false
  const role = selectedRole.value
  if (!role) return false
  if (role.scopeType === 'global') return true
  return Boolean(grantForm.scopeId)
})

function resetGrantForm(): void {
  grantForm.roleCode = ''
  grantForm.scopeId = ''
  grantForm.expiresAt = ''
  grantFormRef.value?.clearValidate()
}

function openGrant(): void {
  if (!selectedUserId.value) {
    ElMessage.warning('请先选择用户')
    return
  }
  if (!currentScope.value) {
    ElMessage.warning('请先选择 scope')
    return
  }
  resetGrantForm()
  grantDialogVisible.value = true
}

async function onGrantSubmit(): Promise<void> {
  if (!grantFormRef.value) return
  const valid = await grantFormRef.value.validate().catch(() => false)
  if (!valid) return
  if (!currentScope.value) return
  grantSubmitting.value = true
  try {
    const role = selectedRole.value
    if (!role) return
    await grantRole({
      userId: selectedUserId.value,
      roleCode: grantForm.roleCode,
      scopeType: role.scopeType,
      scopeId: role.scopeType === 'global' ? undefined : grantForm.scopeId,
      expiresAt: grantForm.expiresAt || undefined,
    })
    ElMessage.success('已分配角色')
    grantDialogVisible.value = false
    await loadGrants()
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : '分配失败'
    ElMessage.error(msg)
  } finally {
    grantSubmitting.value = false
  }
}

async function onRevoke(grant: RoleGrant): Promise<void> {
  if (!currentScope.value) return
  try {
    await ElMessageBox.confirm(
      `确定撤销用户 ${selectedUser.value?.name ?? selectedUserId.value} 的角色 ${grant.roleCode}?`,
      '撤销角色',
      { type: 'warning', confirmButtonText: '撤销', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  try {
    await revokeRole({
      userId: grant.userId,
      roleCode: grant.roleCode,
      scopeType: currentScope.value!.scopeType,
      scopeId: currentScope.value!.scopeId,
    })
    ElMessage.success('已撤销')
    await loadGrants()
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : '撤销失败'
    ElMessage.error(msg)
  }
}

const canManage = computed(() => has(Permission.RbacBindingManage))
const canRead = computed(() => has(Permission.RbacBindingRead))

const tabOptions: Array<{ key: TabKey; label: string; description: string }> = [
  { key: 'global', label: 'Global', description: '平台全局' },
  { key: 'organization', label: '组织', description: '作用于整个组织' },
  { key: 'project', label: '项目', description: '作用于某个项目' },
  { key: 'environment', label: '环境', description: '作用于某个环境' },
  { key: 'folder', label: '目录', description: '作用于某个 folder' },
]

function scopeKeyLabel(s: Scope | null): string {
  if (!s) return '(未选)'
  if (s.scopeType === 'global') return 'global'
  if (!s.scopeId) return `${s.scopeType}:(未选)`
  if (s.scopeType === 'organization') {
    return orgOptions.value.find((o) => o.id === s.scopeId)?.name ?? s.scopeId
  }
  if (s.scopeType === 'project') {
    return projectOptions.value.find((p) => p.id === s.scopeId)?.name ?? s.scopeId
  }
  if (s.scopeType === 'environment') {
    return envOptions.value.find((e) => e.id === s.scopeId)?.name ?? s.scopeId
  }
  return folderOptions.value.find((f) => f.id === s.scopeId)?.name ?? s.scopeId
}

onMounted(async () => {
  if (orgStore.items.length === 0) {
    try {
      await orgStore.fetchList({ pageNum: 1, pageSize: 100 })
    } catch {
      // ignore
    }
  }
  const firstOrg = orgStore.items[0]
  if (firstOrg) {
    activeTab.value = 'organization'
    selectedOrgId.value = firstOrg.id
  }
})
</script>

<template>
  <div class="rbac-page">
    <header class="page-header">
      <div>
        <h1 class="page-header__title">权限管理</h1>
        <p class="page-header__desc">
          在指定 scope 下查看成员,给单个用户分配或撤销角色。所有变更会写入审计。
        </p>
      </div>
    </header>

    <section class="scope-bar">
      <el-tabs v-model="activeTab" class="scope-tabs">
        <el-tab-pane
          v-for="t in tabOptions"
          :key="t.key"
          :name="t.key"
        >
          <template #label>
            <span class="scope-tabs__label">{{ t.label }}</span>
          </template>
        </el-tab-pane>
      </el-tabs>

      <div class="scope-bar__selectors">
        <template v-if="activeTab === 'global'">
          <span class="scope-bar__hint">无需选择,作用域即 platform 级</span>
        </template>
        <template v-else-if="activeTab === 'organization'">
          <el-select v-model="selectedOrgId" placeholder="选择组织" filterable style="width: 280px">
            <el-option
              v-for="o in orgOptions"
              :key="o.id"
              :value="o.id"
              :label="`${o.name} (${o.code})`"
            />
          </el-select>
        </template>
        <template v-else-if="activeTab === 'project'">
          <el-select
            v-model="selectedOrgId"
            placeholder="选择组织"
            filterable
            style="width: 220px"
            @change="selectedProjectId = ''"
          >
            <el-option
              v-for="o in orgOptions"
              :key="o.id"
              :value="o.id"
              :label="o.name"
            />
          </el-select>
          <el-icon><ArrowRight /></el-icon>
          <el-select
            v-model="selectedProjectId"
            placeholder="选择项目"
            filterable
            :disabled="!selectedOrgId"
            style="width: 280px"
          >
            <el-option
              v-for="p in projectOptions"
              :key="p.id"
              :value="p.id"
              :label="`${p.name} (${p.code})`"
            />
          </el-select>
        </template>
        <template v-else-if="activeTab === 'environment'">
          <el-select
            v-model="selectedOrgId"
            placeholder="组织"
            filterable
            style="width: 180px"
            @change="(selectedProjectId = ''); (selectedEnvId = '')"
          >
            <el-option
              v-for="o in orgOptions"
              :key="o.id"
              :value="o.id"
              :label="o.name"
            />
          </el-select>
          <el-icon><ArrowRight /></el-icon>
          <el-select
            v-model="selectedProjectId"
            placeholder="项目"
            filterable
            :disabled="!selectedOrgId"
            style="width: 200px"
            @change="selectedEnvId = ''"
          >
            <el-option
              v-for="p in projectOptions"
              :key="p.id"
              :value="p.id"
              :label="p.name"
            />
          </el-select>
          <el-icon><ArrowRight /></el-icon>
          <el-select
            v-model="selectedEnvId"
            placeholder="环境"
            filterable
            :disabled="!selectedProjectId"
            style="width: 220px"
          >
            <el-option
              v-for="e in envOptions"
              :key="e.id"
              :value="e.id"
              :label="`${e.name} (${e.code})`"
            />
          </el-select>
        </template>
        <template v-else-if="activeTab === 'folder'">
          <el-select
            v-model="selectedOrgId"
            placeholder="组织"
            filterable
            style="width: 140px"
            @change="(selectedProjectId = ''); (selectedEnvId = ''); (selectedFolderId = '')"
          >
            <el-option
              v-for="o in orgOptions"
              :key="o.id"
              :value="o.id"
              :label="o.name"
            />
          </el-select>
          <el-icon><ArrowRight /></el-icon>
          <el-select
            v-model="selectedProjectId"
            placeholder="项目"
            filterable
            :disabled="!selectedOrgId"
            style="width: 160px"
            @change="(selectedEnvId = ''); (selectedFolderId = '')"
          >
            <el-option
              v-for="p in projectOptions"
              :key="p.id"
              :value="p.id"
              :label="p.name"
            />
          </el-select>
          <el-icon><ArrowRight /></el-icon>
          <el-select
            v-model="selectedEnvId"
            placeholder="环境"
            filterable
            :disabled="!selectedProjectId"
            style="width: 180px"
            @change="selectedFolderId = ''"
          >
            <el-option
              v-for="e in envOptions"
              :key="e.id"
              :value="e.id"
              :label="e.name"
            />
          </el-select>
          <el-icon><ArrowRight /></el-icon>
          <el-select
            v-model="selectedFolderId"
            placeholder="folder"
            filterable
            :disabled="!selectedEnvId"
            style="width: 200px"
          >
            <el-option
              v-for="f in folderOptions"
              :key="f.id"
              :value="f.id"
              :label="`${f.name} (${f.code})`"
            />
          </el-select>
        </template>
      </div>
      <div class="scope-bar__key">
        <el-icon><Lock /></el-icon>
        <span>当前 scope:<code>{{ scopeKeyLabel(currentScope) }}</code></span>
      </div>
    </section>

    <div v-if="!currentScope" class="rbac-page__hint">
      <el-icon><CircleClose /></el-icon>
      <span>请先选择 scope。</span>
    </div>

    <div v-else-if="!canRead" class="rbac-page__hint">
      <el-icon><CircleClose /></el-icon>
      <span>当前账号没有 <code>rbac:binding:read</code> 权限,无法查看授权信息。</span>
    </div>

    <div v-else class="rbac-page__body">
      <section class="users-pane">
        <header class="users-pane__head">
          <span class="users-pane__title">成员</span>
          <el-input
            v-model="usersKeyword"
            placeholder="按姓名 / 邮箱 / userId 搜索"
            clearable
            size="small"
            class="users-pane__search"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
          <el-button :icon="Refresh" size="small" @click="loadUsers" :loading="usersLoading" />
        </header>
        <ul v-loading="usersLoading" class="users-pane__list">
          <li
            v-for="u in filteredUsers"
            :key="u.id"
            class="users-pane__item"
            :class="{ 'is-selected': selectedUserId === u.externalUserId }"
            @click="selectedUserId = u.id!"
          >
            <el-icon class="users-pane__avatar"><UserIcon /></el-icon>
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
          </li>
          <li v-if="filteredUsers.length === 0 && !usersLoading" class="users-pane__empty">
            暂无成员
          </li>
        </ul>
      </section>

      <section class="grants-pane">
        <header class="grants-pane__head">
          <div>
            <span class="grants-pane__title">
              {{ selectedUser?.name || selectedUserId || '(未选用户)' }}
            </span>
            <span v-if="selectedUser" class="grants-pane__sub">
              {{ selectedUser.email || selectedUser.externalUserId }}
            </span>
          </div>
          <el-button
            type="primary"
            :icon="Plus"
            :disabled="!canManage || !selectedUser"
            @click="openGrant"
          >
            分配角色
          </el-button>
        </header>

        <el-table
          v-loading="grantsLoading"
          :data="visibleGrants"
          class="grants-pane__table"
          empty-text="该用户在此 scope 下没有直接授权"
        >
          <el-table-column prop="roleCode" label="角色" min-width="160">
            <template #default="{ row }">
              <span class="grants-pane__role">
                <el-tag size="small" effect="plain" type="info">{{ row.roleCode }}</el-tag>
              </span>
            </template>
          </el-table-column>
          <el-table-column label="作用域" min-width="200">
            <template #default="{ row }">
              <span class="grants-pane__scope">
                {{ row.resourceType }}<span v-if="row.resourceId">:{{ row.resourceId.slice(0, 8) }}…</span>
              </span>
            </template>
          </el-table-column>
          <el-table-column label="过期" min-width="180">
            <template #default="{ row }">
              <span v-if="row.expiresAt" class="grants-pane__expires">
                {{ formatDateTime(row.expiresAt) }}
              </span>
              <span v-else class="muted">永久</span>
            </template>
          </el-table-column>
          <el-table-column label="授权人" min-width="120">
            <template #default="{ row }">
              <span class="muted">{{ row.grantedBy || '—' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="120" fixed="right">
            <template #default="{ row }">
              <el-button
                link
                type="danger"
                :icon="Delete"
                :disabled="!canManage"
                @click="onRevoke(row as RoleGrant)"
              >
                撤销
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </section>
    </div>

    <el-dialog
      v-model="grantDialogVisible"
      width="640px"
      :close-on-click-modal="false"
      :title="`为 ${selectedUser?.name || selectedUserId} 分配角色`"
      @closed="resetGrantForm"
    >
      <!-- 上下文:给谁 + 当前页面 scope -->
      <div class="grant-form__context">
        <div>
          <span class="muted">用户</span>
          <strong>{{ selectedUser?.name || selectedUserId }}</strong>
          <code v-if="selectedUser?.email" class="muted">({{ selectedUser.email }})</code>
        </div>
        <div>
          <span class="muted">当前页面 scope</span>
          <code>{{ scopeKeyLabel(currentScope) }}</code>
        </div>
      </div>

      <!-- Step 1: 选角色 -->
      <section class="grant-form__step">
        <h3>
          <el-tag size="small" type="info">1</el-tag>
          选择角色
          <span class="muted grant-form__step-hint">(已分配的会自动过滤)</span>
        </h3>
        <div v-if="roleGroups.length === 0" class="grant-form__empty">
          暂无可分配的角色
        </div>
        <div v-else class="grant-form__roles">
          <div v-for="g in roleGroups" :key="g.scopeType" class="grant-form__role-group">
            <header class="grant-form__role-group-head">
              <span class="grant-form__scope-tag">{{ g.scopeTypeLabel }}</span>
            </header>
            <el-radio-group v-model="grantForm.roleCode" class="grant-form__role-radios">
              <el-radio
                v-for="r in g.roles"
                :key="r.code"
                :value="r.code"
                class="grant-form__role-radio"
              >
                <span class="grant-form__role-name">{{ r.name }}</span>
                <code class="muted">({{ r.code }})</code>
                <span v-if="r.description" class="muted grant-form__role-desc">
                  · {{ r.description }}
                </span>
              </el-radio>
            </el-radio-group>
          </div>
        </div>
      </section>

      <!-- Step 2: 选资源(根据 Step 1 选中的角色动态显示) -->
      <section v-if="selectedRole" class="grant-form__step">
        <h3>
          <el-tag size="small" type="info">2</el-tag>
          选择资源
          <span class="muted grant-form__step-hint">
            (角色 {{ selectedRole.code }} 的 scopeType = <code>{{ selectedRole.scopeType }}</code>)
          </span>
        </h3>

        <div v-if="selectedRole.scopeType === 'global'" class="grant-form__empty">
          Global 级角色不需要选资源,直接生效。
        </div>
        <template v-else>
          <div v-if="resourcesForRole.length === 0" class="grant-form__empty">
            当前用户在该 scopeType 下没有可分配的资源
          </div>
          <el-radio-group v-else v-model="grantForm.scopeId" class="grant-form__resources">
            <el-radio
              v-for="r in resourcesForRole"
              :key="r.id"
              :value="r.id"
              class="grant-form__resource-radio"
            >
              <span class="grant-form__role-name">{{ r.name }}</span>
              <code class="muted">({{ r.code }})</code>
            </el-radio>
          </el-radio-group>
        </template>
      </section>

      <!-- 过期时间 -->
      <section class="grant-form__step">
        <h3>
          <el-tag size="small">+</el-tag>
          过期时间
          <span class="muted grant-form__step-hint">(不填 = 永久)</span>
        </h3>
        <el-date-picker
          v-model="grantForm.expiresAt"
          type="datetime"
          placeholder="选填,留空 = 永久生效"
          value-format="YYYY-MM-DDTHH:mm:ssZ"
          style="width: 100%"
        />
      </section>

      <div class="grant-form__hint">
        系统会校验:不能授予比自己权限集合更大的角色;非 platform_admin 不能授 platform_admin。
      </div>

      <template #footer>
        <el-button @click="grantDialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="grantSubmitting"
          :disabled="!canSubmit"
          @click="onGrantSubmit"
        >
          分配
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style lang="scss" scoped>
.rbac-page {
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
  }

  &__body {
    display: grid;
    grid-template-columns: 320px 1fr;
    gap: 16px;
    align-items: stretch;
  }
}

.page-header {
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
}

.scope-bar {
  background: var(--v-surface-bg);
  border: 1px solid var(--v-surface-border);
  border-radius: var(--v-radius-lg);
  padding: 12px 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;

  &__selectors {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  &__hint {
    color: var(--v-text-tertiary);
    font-size: 12px;
  }

  &__key {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--v-text-secondary);
    padding-top: 4px;
    border-top: 1px dashed var(--v-divider);

    code {
      font-family: var(--el-font-family-monospace, ui-monospace, monospace);
      background: var(--v-surface-bg-subtle);
      padding: 2px 6px;
      border-radius: 3px;
      color: var(--el-color-primary);
    }
  }
}

.scope-tabs {
  :deep(.el-tabs__header) {
    margin-bottom: 0;
  }
  :deep(.el-tabs__nav-wrap::after) {
    background: var(--v-divider);
  }
  &__label {
    font-weight: 500;
  }
}

.users-pane {
  background: var(--v-surface-bg);
  border: 1px solid var(--v-surface-border);
  border-radius: var(--v-radius-lg);
  display: flex;
  flex-direction: column;
  min-height: 480px;

  &__head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--v-divider);
    background: var(--v-surface-bg-subtle);
  }

  &__title {
    font-size: 13px;
    font-weight: 600;
    color: var(--v-text-secondary);
    margin-right: 4px;
  }

  &__search {
    flex: 1;
  }

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

  &__empty {
    padding: 24px 12px;
    text-align: center;
    color: var(--v-text-tertiary);
    font-size: 12px;
  }
}

.grants-pane {
  background: var(--v-surface-bg);
  border: 1px solid var(--v-surface-border);
  border-radius: var(--v-radius-lg);
  display: flex;
  flex-direction: column;
  min-height: 480px;

  &__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--v-divider);
    background: var(--v-surface-bg-subtle);
  }

  &__title {
    font-size: 14px;
    font-weight: 600;
    color: var(--v-text-primary);
  }

  &__sub {
    display: block;
    margin-top: 2px;
    font-size: 11px;
    color: var(--v-text-tertiary);
    font-family: var(--el-font-family-monospace, ui-monospace, monospace);
  }

  &__table {
    width: 100%;
  }

  &__role {
    display: inline-flex;
    align-items: center;
  }

  &__scope {
    font-family: var(--el-font-family-monospace, ui-monospace, monospace);
    font-size: 12px;
    color: var(--v-text-secondary);
  }

  &__expires {
    font-size: 12px;
    color: var(--v-text-secondary);
  }
}

.grant-form {
  display: flex;
  flex-direction: column;
  gap: 16px;

  &__context {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 10px 12px;
    background: var(--v-surface-bg-subtle);
    border: 1px solid var(--v-divider);
    border-radius: var(--v-radius-md);
    font-size: 12px;

    strong {
      margin: 0 4px;
      color: var(--v-text-primary);
    }
    code {
      font-family: var(--el-font-family-monospace, ui-monospace, monospace);
      background: var(--v-surface-bg);
      padding: 1px 5px;
      border-radius: 3px;
      font-size: 11px;
    }
  }

  &__step {
    h3 {
      display: flex;
      align-items: center;
      gap: 6px;
      margin: 0 0 8px;
      font-size: 13px;
      font-weight: 600;
      color: var(--v-text-primary);
    }
  }

  &__step-hint {
    font-weight: 400;
    font-size: 11px;
  }

  &__empty {
    padding: 16px;
    text-align: center;
    color: var(--v-text-tertiary);
    font-size: 12px;
    background: var(--v-surface-bg-subtle);
    border-radius: var(--v-radius-md);
  }

  &__roles {
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-height: 240px;
    overflow-y: auto;
    padding-right: 4px;
  }

  &__role-group {
    border: 1px solid var(--v-divider);
    border-radius: var(--v-radius-md);
    overflow: hidden;
  }

  &__role-group-head {
    display: flex;
    align-items: center;
    padding: 6px 12px;
    background: var(--v-surface-bg-subtle);
    border-bottom: 1px solid var(--v-divider);
  }

  &__scope-tag {
    font-size: 11px;
    font-weight: 600;
    color: var(--el-color-primary);
    letter-spacing: 0.3px;
  }

  &__role-radios {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px 12px;
  }

  &__role-radio {
    margin-right: 0 !important;
    display: flex !important;
    align-items: center;
    width: 100%;
    white-space: normal;
    height: auto;
    padding: 4px 0;

    :deep(.el-radio__label) {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }
  }

  &__role-name {
    font-weight: 500;
  }

  &__role-desc {
    font-size: 11px;
    margin-left: 4px;
  }

  &__resources {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 6px 12px;
    padding: 10px 12px;
    border: 1px solid var(--v-divider);
    border-radius: var(--v-radius-md);
  }

  &__resource-radio {
    margin-right: 0 !important;
    display: flex !important;
    align-items: center;

    :deep(.el-radio__label) {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
  }

  &__hint {
    font-size: 11px;
    color: var(--v-text-tertiary);
    padding: 8px 12px;
    background: var(--el-color-warning-light-9);
    border-radius: var(--v-radius-md);
    border: 1px solid var(--el-color-warning-light-5);
  }
}

.muted {
  color: var(--v-text-tertiary);
}
</style>
