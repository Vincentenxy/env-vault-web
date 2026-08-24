<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  ArrowDown,
  ArrowRight,
  Check,
  CollectionTag,
  Delete,
  Edit,
  Folder,
  OfficeBuilding,
  Plus,
  Search,
  Setting,
  Star,
  StarFilled,
  User,
} from '@element-plus/icons-vue'
import { listOrganizations, updateOrganization } from '@/api/organization'
import { listProjects, updateProject } from '@/api/project'
import {
  getTenantWithOrgProject,
  listTenants,
  updateTenant,
  type Tenant,
  type TenantHierarchyOption,
  type TenantOrganizationOption,
  type TenantProjectOption,
} from '@/api/tenant'
import CardEditDialog, { type CardEditPayload } from '@/components/CardEditDialog.vue'
import TenantEditDialog from '@/components/TenantEditDialog.vue'
import ResourceCreateDialog, {
  type ResourceCreatedPayload,
} from './components/ResourceCreateDialog.vue'
import type { Organization } from '@/types/organization'
import type { Project } from '@/types/project'
import { ApiError } from '@/types/api'

type CascadeLevel = 'tenant' | 'organization' | 'project'
type ResourceLevel = 'tenant' | 'organization' | 'project'
type CascadeItem = TenantHierarchyOption | TenantOrganizationOption | TenantProjectOption
type ResourceItem = Tenant | Organization | Project
type CardTone = 'blue' | 'violet' | 'teal' | 'rose'
type DeleteResourceHandler = (id: string) => Promise<unknown>

const tenantHierarchy = ref<TenantHierarchyOption[]>([])
const tenants = ref<Tenant[]>([])
const organizations = ref<Organization[]>([])
const projects = ref<Project[]>([])
const selectedTenantId = ref('')
const selectedOrganizationId = ref('')
const selectedProjectId = ref('')
const hierarchyLoading = ref(false)
const contentLoading = ref(false)
const loadFailed = ref(false)
const currentPage = ref(1)
const pageSize = ref(10)
const total = ref(0)
const searchKeyword = ref('')
const favoriteOnly = ref(false)
const managementMode = ref(false)
const favoriteIds = reactive(new Set<string>())

// 后端删除接口开放后，按资源层级在此接入对应请求方法。
const deleteResourceHandlers: Partial<Record<ResourceLevel, DeleteResourceHandler>> = {}

const cascadeOpen = ref(false)
const cascadeLevel = ref<CascadeLevel>('tenant')
const cascadeSearch = ref('')

let contentRequestId = 0
let searchTimer: number | undefined
let skipNextSearchReload = false

const resourceLevel = computed<ResourceLevel>(() => {
  if (!selectedTenantId.value) return 'tenant'
  return selectedOrganizationId.value ? 'project' : 'organization'
})

const selectedTenant = computed<TenantHierarchyOption | undefined>(() => {
  const hierarchyItem = tenantHierarchy.value.find((item) => item.id === selectedTenantId.value)
  if (hierarchyItem) return hierarchyItem

  const listItem = tenants.value.find((item) => item.id === selectedTenantId.value)
  return listItem ? { id: listItem.id, name: listItem.name, orgList: [] } : undefined
})

const tenantOrganizations = computed(() => selectedTenant.value?.orgList ?? [])

const selectedOrganization = computed<TenantOrganizationOption | undefined>(() => {
  const hierarchyItem = tenantOrganizations.value.find(
    (item) => item.id === selectedOrganizationId.value,
  )
  if (hierarchyItem) return hierarchyItem

  const listItem = organizations.value.find((item) => item.id === selectedOrganizationId.value)
  return listItem ? { id: listItem.id, name: listItem.name, projectList: [] } : undefined
})

const projectOptions = computed<TenantProjectOption[]>(() => {
  const options = new Map<string, TenantProjectOption>()
  for (const item of selectedOrganization.value?.projectList ?? []) options.set(item.id, item)
  for (const item of projects.value) options.set(item.id, { id: item.id, name: item.name })
  return [...options.values()]
})

const selectedProject = computed(() =>
  projectOptions.value.find((item) => item.id === selectedProjectId.value),
)

const cascadeItems = computed<CascadeItem[]>(() => {
  const keyword = cascadeSearch.value.trim().toLowerCase()
  const source: CascadeItem[] =
    cascadeLevel.value === 'tenant'
      ? tenantHierarchy.value
      : cascadeLevel.value === 'organization'
        ? tenantOrganizations.value
        : projectOptions.value

  return keyword ? source.filter((item) => item.name.toLowerCase().includes(keyword)) : source
})

const visibleOrganizations = computed(() =>
  favoriteOnly.value
    ? organizations.value.filter((item) => favoriteIds.has(item.id))
    : organizations.value,
)

const visibleTenants = computed(() =>
  favoriteOnly.value ? tenants.value.filter((item) => favoriteIds.has(item.id)) : tenants.value,
)

const visibleProjects = computed<Project[]>(() => {
  let items = projects.value
  if (selectedProjectId.value) {
    const loaded = items.find((item) => item.id === selectedProjectId.value)
    items = loaded
      ? [loaded]
      : selectedProject.value
        ? [projectOptionToCard(selectedProject.value)]
        : []
  }
  return favoriteOnly.value ? items.filter((item) => favoriteIds.has(item.id)) : items
})

const visibleResources = computed<ResourceItem[]>(() =>
  resourceLevel.value === 'tenant'
    ? visibleTenants.value
    : resourceLevel.value === 'organization'
      ? visibleOrganizations.value
      : visibleProjects.value,
)

const hasVisibleResources = computed(() => visibleResources.value.length > 0)

const searchPlaceholder = computed(() => `搜索${resourceLabel(resourceLevel.value)}...`)

const emptyTitle = computed(() => {
  const label = resourceLabel(resourceLevel.value)
  return loadFailed.value ? `${label}加载失败` : `暂无${label}`
})

function resourceLabel(level: ResourceLevel): string {
  if (level === 'tenant') return '租户'
  return level === 'organization' ? '组织' : '项目'
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function firstString(value: unknown, keys: string[]): string | undefined {
  const record = asRecord(value)
  for (const key of keys) {
    const candidate = record[key]
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
  }
  return undefined
}

function firstNumber(value: unknown, keys: string[]): number | undefined {
  const record = asRecord(value)
  for (const key of keys) {
    const candidate = record[key]
    if (typeof candidate === 'number' && Number.isFinite(candidate)) return candidate
  }
  return undefined
}

function resourceDescription(item: ResourceItem): string {
  return (
    firstString(item, ['remark', 'comment', 'description']) ??
    `暂无${resourceLabel(resourceLevel.value)}说明`
  )
}

function resourceRemark(item: ResourceItem): string {
  return firstString(item, ['remark', 'comment', 'description']) ?? ''
}

function resourceAdmin(item: ResourceItem): string {
  const managerName = firstString(item, ['managerName'])
  if (isTenantItem(item)) return managerName ?? '暂无负责人'

  return (
    managerName ??
    firstString(item, [
      'admin',
      'adminName',
      'updatedByLabel',
      'createdByLabel',
      'updatedBy',
      'createdBy',
    ]) ??
    '暂无负责人'
  )
}

function tenantOrganizationCount(item: Tenant): number | undefined {
  return firstNumber(item, ['orgCount', 'organizationCount', 'orgNum'])
}

function organizationProjectCount(item: Organization): number {
  const count = firstNumber(item, ['projectCount', 'projectNum'])
  if (count !== undefined) return count
  return tenantOrganizations.value.find((option) => option.id === item.id)?.projectList.length ?? 0
}

function memberCount(item: ResourceItem): number | undefined {
  return firstNumber(item, ['memberCount', 'memberNum', 'userCount'])
}

function projectFolderCount(item: Project): number | undefined {
  return firstNumber(item, ['folderCount'])
}

function isProject(item: ResourceItem): item is Project {
  return 'orgId' in item
}

function isTenantItem(item: ResourceItem): item is Tenant {
  return !isProject(item) && tenants.value.some((tenant) => tenant.id === item.id)
}

function avatarText(item: ResourceItem): string {
  const manager = resourceAdmin(item)
  return manager === '暂无负责人' ? '未' : manager.slice(0, 1)
}

function stableIndex(value: string, modulo: number): number {
  return [...value].reduce((sum, char) => sum + char.charCodeAt(0), 0) % modulo
}

function cardTone(item: ResourceItem): CardTone {
  const tones = ['blue', 'violet', 'teal', 'rose'] as const
  return tones[stableIndex(item.id, tones.length)] ?? 'blue'
}

function avatarTone(item: ResourceItem): number {
  return stableIndex(item.id, 5) + 1
}

function projectOptionToCard(item: TenantProjectOption): Project {
  return {
    id: item.id,
    orgId: selectedOrganizationId.value,
    code: firstString(item, ['code']) ?? '',
    name: item.name,
    comment: '',
    createdBy: '',
    createdByLabel: '',
    updatedBy: '',
    updatedByLabel: '',
    createdAt: '',
    updatedAt: '',
  }
}

function resetResourceSearch(): void {
  window.clearTimeout(searchTimer)
  if (searchKeyword.value) {
    skipNextSearchReload = true
    searchKeyword.value = ''
  }
}

async function loadHierarchy(): Promise<void> {
  hierarchyLoading.value = true
  try {
    const data = await getTenantWithOrgProject()
    tenantHierarchy.value = Array.isArray(data.tenantList) ? data.tenantList : []

    if (
      selectedTenantId.value &&
      !tenantHierarchy.value.some((item) => item.id === selectedTenantId.value)
    ) {
      selectedTenantId.value = ''
      selectedOrganizationId.value = ''
      selectedProjectId.value = ''
    }
  } catch {
    tenantHierarchy.value = []
  } finally {
    hierarchyLoading.value = false
  }
}

async function loadTenants(): Promise<void> {
  const requestId = ++contentRequestId
  contentLoading.value = true
  loadFailed.value = false
  organizations.value = []
  projects.value = []

  try {
    const data = await listTenants({
      pageNum: currentPage.value,
      pageSize: pageSize.value,
      name: searchKeyword.value.trim(),
      code: '',
    })
    if (requestId !== contentRequestId) return
    tenants.value = Array.isArray(data.list) ? data.list : []
    total.value = data.total ?? tenants.value.length
  } catch {
    if (requestId !== contentRequestId) return
    tenants.value = []
    total.value = 0
    loadFailed.value = true
  } finally {
    if (requestId === contentRequestId) contentLoading.value = false
  }
}

async function loadOrganizations(): Promise<void> {
  const requestId = ++contentRequestId
  contentLoading.value = true
  loadFailed.value = false
  projects.value = []

  try {
    const data = await listOrganizations({
      pageNum: currentPage.value,
      pageSize: pageSize.value,
      tenantId: selectedTenantId.value || null,
      name: searchKeyword.value.trim(),
      code: '',
    })
    if (requestId !== contentRequestId) return
    organizations.value = Array.isArray(data.list) ? data.list : []
    total.value = data.total ?? organizations.value.length
  } catch {
    if (requestId !== contentRequestId) return
    organizations.value = []
    total.value = 0
    loadFailed.value = true
  } finally {
    if (requestId === contentRequestId) contentLoading.value = false
  }
}

async function loadProjects(): Promise<void> {
  if (!selectedOrganizationId.value) return

  const requestId = ++contentRequestId
  contentLoading.value = true
  loadFailed.value = false

  try {
    const data = await listProjects({
      pageNum: currentPage.value,
      pageSize: pageSize.value,
      orgId: selectedOrganizationId.value,
      name: searchKeyword.value.trim(),
      code: '',
    })
    if (requestId !== contentRequestId) return
    projects.value = Array.isArray(data.list) ? data.list : []
    total.value = data.total ?? projects.value.length
  } catch {
    if (requestId !== contentRequestId) return
    projects.value = []
    total.value = 0
    loadFailed.value = true
  } finally {
    if (requestId === contentRequestId) contentLoading.value = false
  }
}

function loadCurrentLevel(): Promise<void> {
  if (resourceLevel.value === 'tenant') return loadTenants()
  return resourceLevel.value === 'organization' ? loadOrganizations() : loadProjects()
}

async function refreshPage(): Promise<void> {
  await loadHierarchy()
  await loadCurrentLevel()
}

function canOpenCascadeLevel(level: CascadeLevel): boolean {
  if (level === 'organization') return Boolean(selectedTenantId.value)
  if (level === 'project') return Boolean(selectedOrganizationId.value)
  return true
}

function openCascade(level: CascadeLevel): void {
  if (!canOpenCascadeLevel(level)) return
  cascadeLevel.value = level
  cascadeSearch.value = ''
  cascadeOpen.value = true
}

function selectTenant(item: TenantHierarchyOption): void {
  selectedTenantId.value = item.id
  selectedOrganizationId.value = ''
  selectedProjectId.value = ''
  currentPage.value = 1
  resetResourceSearch()
  cascadeLevel.value = 'organization'
  cascadeSearch.value = ''
  void loadOrganizations()
}

function selectAllTenants(): void {
  selectedTenantId.value = ''
  selectedOrganizationId.value = ''
  selectedProjectId.value = ''
  currentPage.value = 1
  resetResourceSearch()
  cascadeOpen.value = false
  cascadeSearch.value = ''
  void loadTenants()
}

function selectAllOrganizations(): void {
  selectedOrganizationId.value = ''
  selectedProjectId.value = ''
  currentPage.value = 1
  resetResourceSearch()
  cascadeOpen.value = false
  void loadOrganizations()
}

function selectOrganization(item: TenantOrganizationOption): void {
  selectedOrganizationId.value = item.id
  selectedProjectId.value = ''
  currentPage.value = 1
  resetResourceSearch()
  cascadeLevel.value = 'project'
  cascadeSearch.value = ''
  void loadProjects()
}

function selectAllProjects(): void {
  selectedProjectId.value = ''
  cascadeOpen.value = false
  cascadeSearch.value = ''
}

function selectProject(item: TenantProjectOption): void {
  selectedProjectId.value = item.id
  cascadeOpen.value = false
  cascadeSearch.value = ''
}

function onCascadeItemClick(item: CascadeItem): void {
  if (cascadeLevel.value === 'tenant') selectTenant(item as TenantHierarchyOption)
  else if (cascadeLevel.value === 'organization') {
    selectOrganization(item as TenantOrganizationOption)
  } else selectProject(item as TenantProjectOption)
}

function enterOrganization(item: Organization): void {
  const hierarchyItem = tenantOrganizations.value.find((option) => option.id === item.id)
  selectOrganization(hierarchyItem ?? { id: item.id, name: item.name, projectList: [] })
  cascadeOpen.value = false
}

function enterTenant(item: Tenant): void {
  selectTenant({
    id: item.id,
    name: item.name,
    orgList: tenantHierarchy.value.find((tenant) => tenant.id === item.id)?.orgList ?? [],
  })
  cascadeOpen.value = false
}

function enterResource(item: ResourceItem): void {
  if (resourceLevel.value === 'tenant') enterTenant(item as Tenant)
  else if (resourceLevel.value === 'organization') enterOrganization(item as Organization)
  else enterProject(item as Project)
}

function enterProject(item: Project): void {
  selectProject({ id: item.id, name: item.name })
}

function onPageChange(page: number): void {
  currentPage.value = page
  void loadCurrentLevel()
}

function toggleFavorite(item: ResourceItem): void {
  if (favoriteIds.has(item.id)) favoriteIds.delete(item.id)
  else favoriteIds.add(item.id)
}

function toggleManagementMode(): void {
  managementMode.value = !managementMode.value
}

async function confirmResourceDelete(item: ResourceItem): Promise<void> {
  const level = resourceLevel.value
  try {
    await ElMessageBox.confirm(`确认删除${item.name}么？`, `删除${resourceLabel(level)}`, {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      customClass: 'vault-confirm-message-box',
      confirmButtonClass: 'vault-delete-confirm-button',
    })
  } catch {
    return
  }

  const deleteResource = deleteResourceHandlers[level]
  if (!deleteResource) {
    ElMessage.info('删除接口暂未开放')
    return
  }

  try {
    await deleteResource(item.id)
    favoriteIds.delete(item.id)
    ElMessage.success(`${resourceLabel(level)}删除成功`)
    await Promise.all([loadHierarchy(), loadCurrentLevel()])
  } catch (error) {
    if (!(error instanceof ApiError)) ElMessage.error(`${resourceLabel(level)}删除失败`)
  }
}

const createDialogVisible = ref(false)
const editDialogVisible = ref(false)
const editSubmitting = ref(false)
const editingResource = ref<ResourceItem | null>(null)
const editingResourceLevel = ref<ResourceLevel>('tenant')
const editDialogTitle = computed(() => `编辑${resourceLabel(editingResourceLevel.value)}`)

function openCreate(): void {
  createDialogVisible.value = true
}

function openResourceEdit(item: ResourceItem): void {
  editingResource.value = item
  editingResourceLevel.value = resourceLevel.value
  editDialogVisible.value = true
}

async function submitResourceEdit(payload: CardEditPayload): Promise<void> {
  const resource = editingResource.value
  if (!resource || editSubmitting.value) return

  editSubmitting.value = true
  try {
    const request = { id: resource.id, name: payload.name, remark: payload.remark }
    if (editingResourceLevel.value === 'tenant') await updateTenant(request)
    else if (editingResourceLevel.value === 'organization') await updateOrganization(request)
    else await updateProject(request)

    ElMessage.success(`${resourceLabel(editingResourceLevel.value)}更新成功`)
    editDialogVisible.value = false
    await Promise.all([loadHierarchy(), loadCurrentLevel()])
  } catch (error) {
    if (!(error instanceof ApiError)) {
      ElMessage.error(`${resourceLabel(editingResourceLevel.value)}更新失败`)
    }
  } finally {
    editSubmitting.value = false
  }
}

async function onResourceCreated(payload: ResourceCreatedPayload): Promise<void> {
  currentPage.value = 1
  resetResourceSearch()
  await loadHierarchy()

  if (payload.type === 'tenant') {
    const createdTenant = tenantHierarchy.value.find(
      (tenant) => tenant.id === payload.resourceId || tenant.name === payload.name,
    )
    selectedTenantId.value = payload.resourceId ?? createdTenant?.id ?? selectedTenantId.value
    selectedOrganizationId.value = ''
    selectedProjectId.value = ''
  } else if (payload.type === 'organization') {
    selectedTenantId.value = payload.tenantId ?? selectedTenantId.value
    selectedOrganizationId.value = ''
    selectedProjectId.value = ''
  } else {
    selectedTenantId.value = payload.tenantId ?? selectedTenantId.value
    selectedOrganizationId.value = payload.organizationId ?? ''
    selectedProjectId.value = ''
  }

  await loadCurrentLevel()
}

watch(searchKeyword, () => {
  if (skipNextSearchReload) {
    skipNextSearchReload = false
    return
  }
  window.clearTimeout(searchTimer)
  searchTimer = window.setTimeout(() => {
    selectedProjectId.value = ''
    currentPage.value = 1
    void loadCurrentLevel()
  }, 300)
})

onMounted(() => {
  void refreshPage()
})

onBeforeUnmount(() => {
  window.clearTimeout(searchTimer)
})
</script>

<template>
  <section class="organization-page">
    <header class="organization-toolbar">
      <el-popover
        v-model:visible="cascadeOpen"
        placement="bottom-start"
        :width="336"
        :show-arrow="false"
        popper-class="organization-cascade-popper"
        trigger="click"
      >
        <template #reference>
          <button class="cascade-trigger" type="button" aria-label="选择租户、组织和项目">
            <span class="cascade-trigger__part" @click.stop="openCascade('tenant')">
              <el-icon><OfficeBuilding /></el-icon>
              <span>{{
                selectedTenant?.name || (hierarchyLoading ? '加载中...' : '全部租户')
              }}</span>
            </span>
            <el-icon class="cascade-trigger__separator"><ArrowRight /></el-icon>
            <span
              class="cascade-trigger__part"
              :class="{ 'is-disabled': !selectedTenantId }"
              @click.stop="openCascade('organization')"
            >
              <el-icon><OfficeBuilding /></el-icon>
              <span>{{ selectedOrganization?.name || '全部组织' }}</span>
            </span>
            <el-icon class="cascade-trigger__separator"><ArrowRight /></el-icon>
            <span
              class="cascade-trigger__part"
              :class="{ 'is-disabled': !selectedOrganizationId }"
              @click.stop="openCascade('project')"
            >
              <el-icon><Folder /></el-icon>
              <span>{{ selectedProject?.name || '全部项目' }}</span>
            </span>
            <el-icon class="cascade-trigger__arrow"><ArrowDown /></el-icon>
          </button>
        </template>

        <div class="cascade-panel">
          <el-input
            v-model="cascadeSearch"
            clearable
            :placeholder="`搜索${cascadeLevel === 'tenant' ? '租户' : cascadeLevel === 'organization' ? '组织' : '项目'}...`"
          >
            <template #prefix
              ><el-icon><Search /></el-icon
            ></template>
          </el-input>

          <div class="cascade-tabs" role="tablist" aria-label="筛选层级">
            <button
              v-for="level in ['tenant', 'organization', 'project'] as CascadeLevel[]"
              :key="level"
              type="button"
              role="tab"
              class="cascade-tabs__item"
              :class="{
                'is-active': cascadeLevel === level,
                'is-disabled': !canOpenCascadeLevel(level),
              }"
              :aria-selected="cascadeLevel === level"
              :disabled="!canOpenCascadeLevel(level)"
              @click="openCascade(level)"
            >
              <span>{{
                level === 'tenant' ? '租户' : level === 'organization' ? '组织' : '项目'
              }}</span>
              <el-icon
                v-if="
                  (level === 'tenant' && selectedTenantId) ||
                  (level === 'organization' && selectedOrganizationId) ||
                  (level === 'project' && selectedProjectId)
                "
              >
                <Check />
              </el-icon>
            </button>
          </div>

          <div class="cascade-panel__list">
            <button
              v-if="cascadeLevel === 'tenant'"
              type="button"
              class="cascade-option"
              :class="{ 'is-active': !selectedTenantId }"
              @click="selectAllTenants"
            >
              <span class="cascade-option__icon"><OfficeBuilding /></span>
              <span>全部租户</span>
              <el-icon v-if="!selectedTenantId"><Check /></el-icon>
            </button>
            <button
              v-if="cascadeLevel === 'organization'"
              type="button"
              class="cascade-option"
              :class="{ 'is-active': !selectedOrganizationId }"
              @click="selectAllOrganizations"
            >
              <span class="cascade-option__icon"><OfficeBuilding /></span>
              <span>全部组织</span>
              <el-icon v-if="!selectedOrganizationId"><Check /></el-icon>
            </button>
            <button
              v-if="cascadeLevel === 'project'"
              type="button"
              class="cascade-option"
              :class="{ 'is-active': !selectedProjectId }"
              @click="selectAllProjects"
            >
              <span class="cascade-option__icon is-project"><Folder /></span>
              <span>全部项目</span>
              <el-icon v-if="!selectedProjectId"><Check /></el-icon>
            </button>
            <button
              v-for="item in cascadeItems"
              :key="item.id"
              type="button"
              class="cascade-option"
              :class="{
                'is-active':
                  cascadeLevel === 'tenant'
                    ? selectedTenantId === item.id
                    : cascadeLevel === 'organization'
                      ? selectedOrganizationId === item.id
                      : selectedProjectId === item.id,
              }"
              @click="onCascadeItemClick(item)"
            >
              <span
                class="cascade-option__icon"
                :class="{ 'is-project': cascadeLevel === 'project' }"
              >
                <Folder v-if="cascadeLevel === 'project'" />
                <OfficeBuilding v-else />
              </span>
              <span>{{ item.name }}</span>
              <el-icon
                v-if="
                  cascadeLevel === 'tenant'
                    ? selectedTenantId === item.id
                    : cascadeLevel === 'organization'
                      ? selectedOrganizationId === item.id
                      : selectedProjectId === item.id
                "
              >
                <Check />
              </el-icon>
              <el-icon v-else-if="cascadeLevel !== 'project'"><ArrowRight /></el-icon>
            </button>
            <div v-if="!cascadeItems.length" class="cascade-panel__empty">暂无匹配项</div>
          </div>
        </div>
      </el-popover>

      <div class="organization-toolbar__actions">
        <el-input
          v-model="searchKeyword"
          clearable
          class="organization-toolbar__search"
          :placeholder="searchPlaceholder"
        >
          <template #prefix
            ><el-icon><Search /></el-icon
          ></template>
        </el-input>
        <el-tooltip content="新建" placement="bottom">
          <button
            type="button"
            class="round-action round-action--primary"
            aria-label="新建"
            @click="openCreate"
          >
            <el-icon><Plus /></el-icon>
          </button>
        </el-tooltip>
        <el-tooltip :content="favoriteOnly ? '显示全部' : '仅显示收藏'" placement="bottom">
          <button
            type="button"
            class="round-action"
            :class="{ 'is-active': favoriteOnly }"
            :aria-pressed="favoriteOnly"
            aria-label="筛选收藏"
            @click="favoriteOnly = !favoriteOnly"
          >
            <el-icon><StarFilled v-if="favoriteOnly" /><Star v-else /></el-icon>
          </button>
        </el-tooltip>
        <el-tooltip :content="managementMode ? '退出管理' : '管理卡片'" placement="bottom">
          <button
            type="button"
            class="round-action"
            :class="{ 'is-managing': managementMode }"
            :aria-pressed="managementMode"
            :aria-label="managementMode ? '退出管理' : '管理卡片'"
            @click="toggleManagementMode"
          >
            <el-icon><Setting /></el-icon>
          </button>
        </el-tooltip>
      </div>
    </header>

    <main v-loading="contentLoading" class="organization-content">
      <div v-if="hasVisibleResources" class="resource-grid">
        <article
          v-for="item in visibleResources"
          :key="item.id"
          class="resource-card"
          tabindex="0"
          @click="enterResource(item)"
          @keydown.enter.self="enterResource(item)"
        >
          <div class="resource-card__top">
            <span class="resource-card__symbol" :class="`is-${cardTone(item)}`">
              <el-icon><Folder v-if="isProject(item)" /><OfficeBuilding v-else /></el-icon>
            </span>
            <span class="resource-card__actions">
              <el-tooltip :content="favoriteIds.has(item.id) ? '取消收藏' : '收藏'" placement="top">
                <button
                  type="button"
                  class="resource-card__favorite"
                  :class="{ 'is-active': favoriteIds.has(item.id) }"
                  :aria-label="favoriteIds.has(item.id) ? '取消收藏' : '收藏'"
                  @click.stop="toggleFavorite(item)"
                  @keydown.enter.stop
                >
                  <el-icon>
                    <StarFilled v-if="favoriteIds.has(item.id)" />
                    <Star v-else />
                  </el-icon>
                </button>
              </el-tooltip>
              <template v-if="managementMode">
                <el-tooltip :content="`编辑${resourceLabel(resourceLevel)}`" placement="top">
                  <button
                    type="button"
                    class="resource-card__edit vault-edit-action"
                    :aria-label="`编辑${item.name}`"
                    @click.stop="openResourceEdit(item)"
                    @keydown.enter.stop
                  >
                    <el-icon><Edit /></el-icon>
                  </button>
                </el-tooltip>
                <el-tooltip :content="`删除${resourceLabel(resourceLevel)}`" placement="top">
                  <button
                    type="button"
                    class="resource-card__delete vault-delete-action"
                    :aria-label="`删除${item.name}`"
                    @click.stop="confirmResourceDelete(item)"
                    @keydown.enter.stop
                  >
                    <el-icon><Delete /></el-icon>
                  </button>
                </el-tooltip>
              </template>
            </span>
          </div>

          <h2>{{ item.name }}</h2>
          <p>{{ resourceDescription(item) }}</p>

          <footer class="resource-card__footer">
            <span class="resource-card__owner">
              <span class="resource-card__avatar" :class="`is-${avatarTone(item)}`">
                {{ avatarText(item) }}
              </span>
              <span :title="resourceAdmin(item)">{{ resourceAdmin(item) }}</span>
            </span>
            <span class="resource-card__stats">
              <template v-if="isTenantItem(item)">
                <span>
                  <el-icon><OfficeBuilding /></el-icon>
                  {{ tenantOrganizationCount(item) ?? '--' }} 个组织
                </span>
              </template>
              <template v-else-if="isProject(item)">
                <span>
                  <el-icon><CollectionTag /></el-icon>
                  {{ projectFolderCount(item) ?? '--' }} 个密钥集
                </span>
              </template>
              <template v-else>
                <span>
                  <el-icon><Folder /></el-icon>
                  {{ organizationProjectCount(item) }} 个项目
                </span>
              </template>
              <span>
                <el-icon><User /></el-icon>
                {{ memberCount(item) ?? '--' }} 人
              </span>
            </span>
          </footer>
        </article>
      </div>

      <div v-else-if="!contentLoading" class="resource-empty">
        <span class="resource-empty__icon">
          <Folder v-if="resourceLevel === 'project'" />
          <OfficeBuilding v-else />
        </span>
        <strong>{{ emptyTitle }}</strong>
        <span>{{ loadFailed ? '请稍后重试' : '当前筛选条件下没有数据' }}</span>
        <el-button v-if="loadFailed" type="primary" plain @click="loadCurrentLevel">
          重新加载
        </el-button>
      </div>

      <div
        v-if="total > pageSize && !selectedProjectId && !favoriteOnly"
        class="resource-pagination"
      >
        <el-pagination
          background
          layout="prev, pager, next"
          :current-page="currentPage"
          :page-size="pageSize"
          :total="total"
          @current-change="onPageChange"
        />
      </div>
    </main>

    <ResourceCreateDialog
      v-model="createDialogVisible"
      :tenants="tenantHierarchy"
      @created="onResourceCreated"
    />
    <TenantEditDialog
      v-if="editingResourceLevel === 'tenant'"
      :key="editingResource?.id ?? 'tenant-edit'"
      v-model="editDialogVisible"
      :name="editingResource?.name ?? ''"
      :remark="editingResource ? resourceRemark(editingResource) : ''"
      :submitting="editSubmitting"
      @submit="submitResourceEdit"
    />
    <CardEditDialog
      v-else
      v-model="editDialogVisible"
      :title="editDialogTitle"
      :name="editingResource?.name ?? ''"
      :remark="editingResource ? resourceRemark(editingResource) : ''"
      :submitting="editSubmitting"
      @submit="submitResourceEdit"
    />
  </section>
</template>

<style lang="scss" scoped>
.organization-page {
  height: 100%;
  min-height: 100%;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  background: var(--v-page-bg);
  color: var(--v-text-primary);
}

.organization-toolbar {
  min-height: 60px;
  padding: 0 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  background: var(--v-surface-bg);
  border-bottom: 1px solid var(--v-divider);

  &__actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  &__search {
    width: 176px;

    :deep(.el-input__wrapper) {
      min-height: 34px;
      border-radius: 999px !important;
      background: var(--v-surface-bg-subtle);
      box-shadow: none;
    }
  }
}

.cascade-trigger {
  height: 36px;
  max-width: min(650px, 62vw);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border: 1px solid var(--v-surface-border);
  border-radius: 9px;
  background: var(--v-surface-bg);
  color: var(--v-text-primary);
  cursor: pointer;

  &__part {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 13px;
    font-weight: 600;

    > span {
      max-width: 150px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .el-icon {
      flex: 0 0 auto;
      color: var(--v-text-secondary);
      font-size: 16px;
    }

    &.is-disabled {
      cursor: default;
      opacity: 0.55;
    }
  }

  &__separator,
  &__arrow {
    flex: 0 0 auto;
    color: var(--v-text-tertiary);
    font-size: 12px;
  }
}

.round-action {
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
    background 0.18s ease;

  &:hover {
    border-color: rgb(23, 93, 251);
    color: rgb(23, 93, 251);
  }

  &.is-active {
    border-color: #f4b400;
    background: rgba(244, 180, 0, 0.08);
    color: #f4b400;
  }

  &.is-managing {
    border-color: rgb(23, 93, 251);
    background: rgba(23, 93, 251, 0.08);
    color: rgb(23, 93, 251);
  }

  &--primary {
    border-color: rgb(23, 93, 251);
    background: rgb(23, 93, 251);
    color: #fff;

    &:hover {
      background: rgb(18, 76, 214);
      color: #fff;
    }
  }

  &.is-disabled {
    cursor: not-allowed;
    opacity: 0.48;
  }

  .el-icon {
    font-size: 16px;
  }
}

.organization-content {
  flex: 1;
  min-height: 360px;
  padding: 20px 24px 28px;
}

.resource-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 252px));
  align-items: start;
  gap: 14px;
}

.resource-card {
  min-width: 0;
  height: 183px;
  min-height: 183px;
  padding: 16px 16px 0;
  display: flex;
  flex-direction: column;
  background: var(--v-surface-bg);
  border: 1px solid var(--v-surface-border);
  border-radius: 12px;
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    transform 0.18s ease;

  &:hover,
  &:focus-visible {
    border-color: var(--el-color-primary-light-5);
    box-shadow: var(--v-shadow-md);
    outline: none;
    transform: translateY(-1px);
  }

  &__top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 12px;
  }

  &__symbol {
    width: 34px;
    height: 34px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    font-size: 18px;

    &.is-blue {
      color: #2563eb;
      background: #eef4ff;
    }
    &.is-violet {
      color: #7c3aed;
      background: #f4efff;
    }
    &.is-teal {
      color: #059669;
      background: #eaf8f2;
    }
    &.is-rose {
      color: #e11d48;
      background: #fff0f3;
    }
  }

  &__actions {
    display: inline-flex;
    align-items: center;
    gap: 2px;
  }

  &__edit,
  &__delete,
  &__favorite {
    width: 26px;
    height: 26px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--v-text-tertiary);
    cursor: pointer;
  }

  &__edit {
    color: #176dfb;

    &:hover,
    &:focus-visible {
      background: rgba(23, 109, 251, 0.08);
      outline: none;
    }
  }

  &__delete {
    color: var(--v-color-danger);

    &:hover,
    &:focus-visible {
      background: rgba(220, 38, 38, 0.08);
      color: var(--v-color-danger);
      outline: none;
    }
  }

  &__favorite {
    &:hover,
    &.is-active {
      color: #f4b400;
      background: rgba(244, 180, 0, 0.08);
    }
  }

  h2 {
    margin: 0 0 7px;
    overflow: hidden;
    color: var(--v-text-primary);
    font-size: 14px;
    font-weight: 700;
    letter-spacing: 0;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  > p {
    min-height: 36px;
    margin: 0 0 12px;
    display: -webkit-box;
    overflow: hidden;
    color: var(--v-text-secondary);
    font-size: 11.5px;
    line-height: 1.55;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  &__footer {
    min-height: 44px;
    margin-top: auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 7px;
    border-top: 1px solid var(--v-divider);
    color: var(--v-text-secondary);
    font-size: 10px;
  }

  &__owner,
  &__stats,
  &__stats > span {
    display: flex;
    align-items: center;
  }

  &__owner {
    min-width: 0;
    gap: 6px;

    > span:last-child {
      max-width: 48px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  &__stats {
    flex: 0 0 auto;
    gap: 7px;

    > span {
      gap: 3px;
      white-space: nowrap;
    }

    .el-icon {
      font-size: 12px;
    }
  }

  &__avatar {
    width: 20px;
    height: 20px;
    flex: 0 0 20px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    color: #fff;
    font-size: 9px;
    font-weight: 600;

    &.is-1 {
      background: #2563eb;
    }
    &.is-2 {
      background: #7c3aed;
    }
    &.is-3 {
      background: #059669;
    }
    &.is-4 {
      background: #e36c09;
    }
    &.is-5 {
      background: #db2777;
    }
  }
}

.resource-empty {
  min-height: 340px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 9px;
  color: var(--v-text-secondary);
  font-size: 13px;

  &__icon {
    width: 46px;
    height: 46px;
    margin-bottom: 3px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: var(--v-surface-bg-subtle);
    color: var(--v-text-tertiary);
    font-size: 23px;
  }

  strong {
    color: var(--v-text-primary);
    font-size: 14px;
  }
}

.resource-pagination {
  display: flex;
  justify-content: center;
  padding-top: 24px;
}

:global(.organization-cascade-popper.el-popper) {
  padding: 10px 0 8px;
  border: 1px solid var(--v-surface-border);
  border-radius: 8px;
  background: var(--v-surface-bg);
  box-shadow: var(--v-shadow-md);
}

.cascade-panel {
  > .el-input {
    padding: 0 10px;
  }

  :deep(.el-input__wrapper) {
    min-height: 36px;
    margin-bottom: 8px;
    border-radius: 999px !important;
    background: var(--v-surface-bg-subtle);
    box-shadow: none;
  }

  &__list {
    max-height: 270px;
    padding: 6px 8px 0;
    overflow-y: auto;
  }

  &__empty {
    padding: 22px 10px;
    color: var(--v-text-tertiary);
    font-size: 12px;
    text-align: center;
  }
}

.cascade-tabs {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  border-top: 1px solid var(--v-divider);
  border-bottom: 1px solid var(--v-divider);

  &__item {
    position: relative;
    height: 38px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--v-text-secondary);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;

    &::after {
      position: absolute;
      right: 0;
      bottom: -1px;
      left: 0;
      height: 2px;
      background: transparent;
      content: '';
    }

    &.is-active {
      color: var(--el-color-primary);

      &::after {
        background: var(--el-color-primary);
      }
    }

    &.is-disabled {
      cursor: not-allowed;
      opacity: 0.42;
    }

    .el-icon {
      color: #059669;
      font-size: 13px;
    }
  }
}

.cascade-option {
  width: 100%;
  min-height: 38px;
  display: grid;
  grid-template-columns: 26px minmax(0, 1fr) 16px;
  align-items: center;
  gap: 7px;
  padding: 4px 8px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--v-text-secondary);
  font-size: 13px;
  text-align: left;
  cursor: pointer;

  &:hover,
  &.is-active {
    background: var(--v-surface-bg-subtle);
    color: var(--v-text-primary);
  }

  &.is-active {
    color: var(--el-color-primary);
    font-weight: 600;
  }

  &__icon {
    width: 26px;
    height: 26px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 5px;
    background: #eef4ff;
    color: #2563eb;

    &.is-project {
      background: #f4efff;
      color: #7c3aed;
    }
  }

  > span:nth-child(2) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

@media (max-width: 760px) {
  .organization-toolbar {
    min-height: 108px;
    padding: 12px 16px;
    align-items: stretch;
    flex-direction: column;
    gap: 10px;

    &__actions {
      width: 100%;
    }

    &__search {
      width: auto;
      flex: 1;
    }
  }

  .cascade-trigger {
    width: 100%;
    max-width: none;
    gap: 5px;
    justify-content: flex-start;

    &__part {
      gap: 4px;

      > span {
        max-width: 72px;
      }
    }
  }

  .organization-content {
    padding: 14px 16px 22px;
  }

  .resource-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
