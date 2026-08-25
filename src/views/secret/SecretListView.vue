<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, type Component, watch } from 'vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { FolderOpen, Globe, History, KeyRound, Maximize2 } from '@lucide/vue'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Check,
  Close,
  CopyDocument,
  Delete,
  Edit,
  FolderOpened,
  Hide,
  Key as ElementKey,
  Loading,
  OfficeBuilding,
  Plus,
  Search,
  Setting,
  Star,
  StarFilled,
  View,
} from '@element-plus/icons-vue'
import { copyToClipboard } from '@/utils/copy'
import CardEditDialog, { type CardEditPayload } from '@/components/CardEditDialog.vue'
import ManagerSelect from '@/components/ManagerSelect.vue'
import { useManagerSelection } from '@/composables/use-manager-selection'
import { listEnvironments } from '@/api/env'
import { getOrganizationsWithProjects } from '@/api/organization'
import { createSecretFolder, deleteFolder, listFolders, updateFolder } from '@/api/folder'
import {
  batchCreateSecrets,
  deleteFolderGroupSecret,
  getSecretBatchDetail,
  getSecretHistory,
  listSecretsByFolderGroup,
  updateFolderGroupSecrets,
  type BatchCreateSecretValue,
  type BatchCreateSecretsRequest,
  type FolderGroupSecret,
  type SecretBatchDetailItem,
  type SecretHistoryItem,
  type SecretHistoryResponse,
  type UpdateFolderGroupSecretItemRequest,
} from '@/api/secret'
import { ApiError } from '@/types/api'
import type { Folder } from '@/types/folder'
import { formatDateTime } from '@/utils/format'

type FolderType = 'customer' | 'global' | 'groups' | 'common' | 'unknown'
type CreateFolderType = 'common' | 'customer'
type CascadeLevel = 'organization' | 'project'
type HistoryDetailTab = 'version' | 'batch'
interface ProjectOption {
  id: string
  orgId: string
  name: string
}

interface OrganizationOption {
  id: string
  name: string
}

interface VaultFolder {
  id: string
  projectId: string
  folderGroupId: string
  code: string
  name: string
  type: FolderType
  remark: string
  description: string
  owner: string
  count: number | null
  groups?: number | null
  favorite: boolean
}

interface SecretRow {
  key: string
  comment: string
  [environmentCode: string]: string
}

interface SecretRowMeta {
  groupId: string
  values: Record<string, { secretId: string; folderId: string }>
}

interface VaultEnvironment {
  id: string
  code: string
  name: string
  isCheckPerm: boolean
}

interface KeyDraftRow {
  id: string
  key: string
  remark: string
  values: Record<string, string>
}

interface SecretHistoryDisplayRow {
  id: string
  timeWindow: string
  isWindowFirst: boolean
  isWindowLast: boolean
  values: Record<string, SecretHistoryItem>
}

interface NormalizedSecretHistoryRecord {
  environmentCode: string
  item: SecretHistoryItem
  timestamp: number
}

interface HistoryVersionSelection {
  key: string
  remark: string
  environment: VaultEnvironment
  item: SecretHistoryItem
}

interface BatchVersionEntry {
  environment: VaultEnvironment
  item: SecretHistoryItem
}

const organizations = ref<OrganizationOption[]>([])
const { resolveManagerId } = useManagerSelection()
const projects = ref<ProjectOption[]>([])
const folders = ref<VaultFolder[]>([])
const secretRows = reactive<Record<string, SecretRow[]>>({})
const secretRowMeta = reactive<Record<string, Record<string, SecretRowMeta>>>({})
const serviceGroups = ref<VaultFolder[]>([])

const selectedOrgId = ref('')
const selectedProjectId = ref('')
const cascadeLevel = ref<CascadeLevel>('organization')
const cascadeSearch = ref('')
const cascadeOpen = ref(false)
const folderListSearch = ref('')
const folderSearch = ref('')
const favoriteOnly = ref(false)
const managementMode = ref(false)
const folderPage = ref(1)
const folderPageSize = 6
const folderTotal = ref(0)
const scopeLoading = ref(false)
const folderLoading = ref(false)
const folderLoadFailed = ref(false)
const groupLoading = ref(false)
const groupLoadFailed = ref(false)
const secretLoading = ref(false)
const secretLoadFailed = ref(false)
const environmentLoading = ref(false)
const environmentLoadFailed = ref(false)
const environmentProjectId = ref('')
const activeFolderId = ref('')
const activeGroupId = ref('')
const environments = ref<VaultEnvironment[]>([])
const visibleEnvironments = reactive<Record<string, boolean>>({})
const visibleSecretValues = reactive<Record<string, Record<string, boolean>>>({})
const keyDialogVisible = ref(false)
const keyDialogMode = ref<'create' | 'edit'>('create')
const editingKey = ref('')
const expandedKeyEditVisible = ref(false)
const keySubmitting = ref(false)
const deletingKey = ref('')
const expandedHistoryKey = ref('')
const historyLoadingKey = ref('')
const historyLoadFailedKey = ref('')
const historyRows = ref<SecretHistoryDisplayRow[]>([])
const historyData = ref<SecretHistoryResponse>({})
const historyPageNum = ref(1)
const historyLoadingMore = ref(false)
const historyDetailVisible = ref(false)
const historyDetailTab = ref<HistoryDetailTab>('version')
const historyVersionSelection = ref<HistoryVersionSelection | null>(null)
const historyDetailValueVisible = ref(true)
const historyBatchLoading = ref(false)
const historyBatchLoadFailed = ref(false)
const historyBatchLoadedId = ref('')
const historyBatchDetails = ref<SecretBatchDetailItem[]>([])
const historyBatchValueVisibility = reactive<Record<string, boolean>>({})
const keyForm = reactive({
  key: '',
  remark: '',
  commitMsg: '',
  values: {} as Record<string, string>,
})
const keyDraftRows = ref<KeyDraftRow[]>([])
const keyFormBaseline = reactive({ key: '', remark: '', values: {} as Record<string, string> })
const commitMsgInvalid = ref(false)
let keyDraftSequence = 0
const createFolderDialogVisible = ref(false)
const createFolderSubmitting = ref(false)
const createFolderFormRef = ref<FormInstance>()
const createFolderParent = ref<VaultFolder | null>(null)
const createFolderForm = reactive({
  organizationId: '',
  projectId: '',
  type: 'customer' as CreateFolderType,
  code: '',
  name: '',
  managerId: '',
  remark: '',
})
const folderEditDialogVisible = ref(false)
const folderEditSubmitting = ref(false)
const editingFolder = ref<VaultFolder | null>(null)
const deletingFolderGroupId = ref('')
const favoriteFolderIds = new Set<string>()
let folderRequestSequence = 0
let groupRequestSequence = 0
let environmentRequestSequence = 0
let folderSearchTimer: number | undefined
const favoriteFolderStorageKey = 'env-vault:secret:favorite-folders'
const keyDialogDraftStoragePrefix = 'env-vault:secret:key-dialog-draft'
const createFolderDraftStoragePrefix = 'env-vault:secret:create-folder-draft'
let secretRequestSequence = 0
let historyRequestSequence = 0
let historyBatchRequestSequence = 0
const historyWindowDuration = 5 * 60 * 1000
const historyPageSize = 10

const historyHasMore = computed(() =>
  Object.values(historyData.value).some(
    (history) => Number(history?.total) > (history?.list?.length ?? 0),
  ),
)

const createFolderRules: FormRules<typeof createFolderForm> = {
  projectId: [
    {
      required: true,
      validator: (_rule, value: string, callback) => {
        if (!createFolderForm.organizationId) {
          callback(new Error('请选择所属组织'))
        } else if (!value) {
          callback(new Error('请选择所属项目'))
        } else {
          callback()
        }
      },
      trigger: 'change',
    },
  ],
  type: [{ required: true, message: '请选择类型', trigger: 'change' }],
  code: [
    { required: true, message: '请输入 code', trigger: 'blur' },
    {
      pattern: /^[a-z0-9]+(-[a-z0-9]+)*$/,
      message: '仅支持小写字母、数字和中横线',
      trigger: 'blur',
    },
    { max: 32, message: '长度不能超过 32 个字符', trigger: 'blur' },
  ],
  name: [
    { required: true, message: '请输入名称', trigger: 'blur' },
    { max: 64, message: '长度不能超过 64 个字符', trigger: 'blur' },
  ],
  remark: [{ max: 256, message: '长度不能超过 256 个字符', trigger: 'blur' }],
}

function createFolderDraftKey(): string {
  const projectId = createFolderForm.projectId || selectedProjectId.value || 'unknown'
  const parentId = createFolderParent.value?.id || 'root'
  return `${createFolderDraftStoragePrefix}:${encodeURIComponent(projectId)}:${encodeURIComponent(parentId)}`
}

function clearCreateFolderForm(): void {
  createFolderForm.organizationId = ''
  createFolderForm.projectId = ''
  createFolderForm.type = 'customer'
  createFolderForm.code = ''
  createFolderForm.name = ''
  createFolderForm.managerId = ''
  createFolderForm.remark = ''
}

function selectCreateFolderType(type: CreateFolderType): void {
  createFolderForm.type = type
  createFolderFormRef.value?.clearValidate('type')
}

function restoreCreateFolderDraft(): boolean {
  clearCreateFolderForm()
  createFolderForm.organizationId = selectedOrgId.value
  createFolderForm.projectId = selectedProjectId.value
  if (typeof window === 'undefined') return false

  const raw = window.localStorage.getItem(createFolderDraftKey())
  if (!raw) return false
  try {
    const draft: unknown = JSON.parse(raw)
    if (!draft || typeof draft !== 'object') throw new Error('Invalid folder draft')
    const value = draft as Record<string, unknown>
    if (!selectedProjectId.value) {
      const draftOrganizationId =
        typeof value.organizationId === 'string' ? value.organizationId : ''
      const draftProjectId = typeof value.projectId === 'string' ? value.projectId : ''
      const draftProject = projects.value.find((project) => project.id === draftProjectId)
      if (
        draftOrganizationId &&
        organizations.value.some((item) => item.id === draftOrganizationId)
      ) {
        createFolderForm.organizationId = draftOrganizationId
      } else if (draftProject) {
        createFolderForm.organizationId = draftProject.orgId
      }
      if (draftProject && draftProject.orgId === createFolderForm.organizationId) {
        createFolderForm.projectId = draftProject.id
      } else if (
        !projects.value.some(
          (project) =>
            project.id === createFolderForm.projectId &&
            project.orgId === createFolderForm.organizationId,
        )
      ) {
        createFolderForm.projectId =
          projects.value.find((project) => project.orgId === createFolderForm.organizationId)?.id ??
          ''
      }
    }
    createFolderForm.code = typeof value.code === 'string' ? value.code : ''
    createFolderForm.name = typeof value.name === 'string' ? value.name : ''
    createFolderForm.managerId = typeof value.managerId === 'string' ? value.managerId : ''
    createFolderForm.remark = typeof value.remark === 'string' ? value.remark : ''
    createFolderForm.type =
      value.type === 'common' || value.type === 'customer' ? value.type : 'customer'
    return true
  } catch {
    window.localStorage.removeItem(createFolderDraftKey())
    return false
  }
}

function persistCreateFolderDraft(): void {
  if (typeof window === 'undefined') return
  const isEmpty =
    !createFolderForm.code &&
    !createFolderForm.name &&
    !createFolderForm.managerId &&
    !createFolderForm.remark
  if (isEmpty) {
    window.localStorage.removeItem(createFolderDraftKey())
    return
  }
  window.localStorage.setItem(
    createFolderDraftKey(),
    JSON.stringify({
      organizationId: createFolderForm.organizationId,
      projectId: createFolderForm.projectId,
      type: createFolderForm.type,
      code: createFolderForm.code,
      name: createFolderForm.name,
      managerId: createFolderForm.managerId,
      remark: createFolderForm.remark,
    }),
  )
}

function clearCreateFolderDraft(): void {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(createFolderDraftKey())
  }
}

function restoreFavoriteFolders(): void {
  if (typeof window === 'undefined') return
  const raw = window.localStorage.getItem(favoriteFolderStorageKey)
  if (!raw) return
  try {
    const ids: unknown = JSON.parse(raw)
    if (!Array.isArray(ids)) throw new Error('Invalid favorite folders')
    favoriteFolderIds.clear()
    ids.forEach((id) => {
      if (typeof id === 'string' && id) favoriteFolderIds.add(id)
    })
  } catch {
    window.localStorage.removeItem(favoriteFolderStorageKey)
  }
}

function persistFavoriteFolders(): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(favoriteFolderStorageKey, JSON.stringify([...favoriteFolderIds]))
}

const selectedOrg = computed<OrganizationOption>(
  () =>
    organizations.value.find((item) => item.id === selectedOrgId.value) ?? {
      id: '',
      name: scopeLoading.value ? '加载中...' : '暂无组织',
    },
)
const selectedProject = computed<ProjectOption>(
  () =>
    projects.value.find((item) => item.id === selectedProjectId.value) ?? {
      id: '',
      orgId: '',
      name: scopeLoading.value ? '加载中...' : '暂无项目',
    },
)
const availableProjects = computed(() =>
  projects.value.filter((item) => item.orgId === selectedOrgId.value),
)
const createFolderProjects = computed(() =>
  projects.value.filter((item) => item.orgId === createFolderForm.organizationId),
)
const activeFolder = computed(
  () => folders.value.find((item) => item.id === activeFolderId.value) ?? null,
)
const activeServiceGroup = computed(
  () => serviceGroups.value.find((item) => item.id === activeGroupId.value) ?? null,
)
const activeSecretFolder = computed(() => activeServiceGroup.value ?? activeFolder.value)
const visibleFolders = computed(() =>
  favoriteOnly.value ? folders.value.filter((folder) => folder.favorite) : folders.value,
)
const activeRows = computed(() => {
  const rows = activeSecretFolder.value ? (secretRows[activeSecretFolder.value.id] ?? []) : []
  const keyword = folderSearch.value.trim().toLowerCase()
  return keyword ? rows.filter((row) => row.key.toLowerCase().includes(keyword)) : rows
})
const operationColumnWidth = computed(() => (editingKey.value ? 420 : 156))
const secretTableMinWidth = computed(
  () => 230 + environments.value.length * 220 + 220 + operationColumnWidth.value,
)
const secretTableColumnCount = computed(() => environments.value.length + 3)
const cascadeItems = computed(() => {
  const keyword = cascadeSearch.value.trim().toLowerCase()
  const items =
    cascadeLevel.value === 'organization' ? organizations.value : availableProjects.value
  return items.filter((item) => !keyword || item.name.toLowerCase().includes(keyword))
})
function folderMeta(type: FolderType): { label: string; icon: Component } {
  if (type === 'global') return { label: '全局配置', icon: Globe }
  if (type === 'groups') return { label: '分组配置', icon: FolderOpen }
  if (type === 'common') return { label: '通用配置', icon: FolderOpen }
  if (type === 'unknown') return { label: '类型待补充', icon: FolderOpen }
  return { label: '客户配置', icon: KeyRound }
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
      return Number(value)
    }
  }
  return null
}

function inferFolderType(folder: Folder): FolderType {
  const raw = folder as Folder & Record<string, unknown>
  const code = firstString(raw.code).toLowerCase()
  if (code === 'groups' || code === 'group') return 'groups'
  if (code === 'global') return 'global'

  const explicitType = firstString(raw.type, raw.folderType, raw.configType).toLowerCase()
  if (explicitType === 'global') return 'global'
  if (explicitType === 'groups' || explicitType === 'group') return 'groups'
  if (explicitType === 'common') return 'common'
  if (explicitType === 'customer') return 'customer'

  const marker = `${firstString(raw.code)} ${firstString(raw.name)}`.toLowerCase()
  if (marker.includes('global')) return 'global'
  if (marker.includes('group')) return 'groups'
  return 'unknown'
}

function mapFolder(folder: Folder, projectId: string, index: number): VaultFolder {
  const raw = folder as Folder & Record<string, unknown>
  const id = firstString(raw.id, raw.code) || `${projectId}-folder-${index}`
  const remark = firstString(raw.remark, raw.comment, raw.description)
  return {
    id,
    projectId,
    folderGroupId: firstString(raw.groupId, raw.group_id, raw.folderGroupId, raw.folder_group_id),
    code: firstString(raw.code, raw.name) || id,
    name: firstString(raw.name, raw.code) || '未命名配置目录',
    type: inferFolderType(folder),
    remark,
    description: remark || '暂无目录说明',
    owner:
      firstString(raw.updatedByLabel, raw.createdByLabel, raw.ownerName, raw.owner) || '待补充',
    count: firstNumber(raw.secretCount, raw.secretsCount, raw.keyCount, raw.count),
    groups: firstNumber(raw.groupCount, raw.groupsCount),
    favorite: favoriteFolderIds.has(id),
  }
}

function mergeMappedFolders(items: Folder[], projectId: string): VaultFolder[] {
  const merged = new Map<string, VaultFolder>()
  items.forEach((folder, index) => {
    const mapped = mapFolder(folder, projectId, index)
    const raw = folder as Folder & Record<string, unknown>
    const logicalKey = firstString(
      raw.groupId,
      raw.group_id,
      raw.folderGroupId,
      raw.folder_group_id,
      mapped.code,
    )
    const previous = merged.get(logicalKey)
    if (!previous) {
      merged.set(logicalKey, mapped)
      return
    }
    previous.count = previous.count ?? mapped.count
    previous.groups = previous.groups ?? mapped.groups
  })
  return [...merged.values()]
}

function resetEnvironmentVisibility(): void {
  Object.keys(visibleEnvironments).forEach((code) => {
    delete visibleEnvironments[code]
  })
  environments.value.forEach((environment) => {
    visibleEnvironments[environment.code] = !environment.isCheckPerm
  })
  clearSecretValueVisibility()
}

function normalizeProjectEnvironments(response: unknown): VaultEnvironment[] {
  if (!response || typeof response !== 'object') return []
  const raw = response as Record<string, unknown>
  const list = Array.isArray(response)
    ? response
    : ([raw.list, raw.envList, raw.environmentList].find(Array.isArray) ?? [])
  const seen = new Set<string>()

  return list.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const environment = item as Record<string, unknown>
    const code = firstString(
      environment.code,
      environment.envCode,
      environment.environmentCode,
    ).toLowerCase()
    if (!code || seen.has(code)) return []
    seen.add(code)
    return [
      {
        id: firstString(environment.id, environment.envId, environment.environmentId),
        code,
        name: firstString(environment.name, environment.envName, environment.environmentName, code),
        isCheckPerm: environment.isCheckPerm === true,
      },
    ]
  })
}

async function loadProjectEnvironments(projectId: string): Promise<void> {
  const requestSequence = ++environmentRequestSequence
  environmentLoadFailed.value = false
  environmentProjectId.value = ''
  environments.value = []
  resetEnvironmentVisibility()

  if (!projectId) {
    return
  }

  environmentLoading.value = true
  try {
    const response = await listEnvironments({ projectId, pageNum: 1, pageSize: 200 })
    if (requestSequence !== environmentRequestSequence) return
    environments.value = normalizeProjectEnvironments(response)
    environmentProjectId.value = projectId
  } catch {
    if (requestSequence !== environmentRequestSequence) return
    environments.value = []
    environmentLoadFailed.value = true
  } finally {
    if (requestSequence === environmentRequestSequence) {
      environmentLoading.value = false
      resetEnvironmentVisibility()
    }
  }
}

function mapSecretRows(items: FolderGroupSecret[], folderId: string): SecretRow[] {
  const metadata: Record<string, SecretRowMeta> = {}
  const rows = items.map((item) => {
    const row: SecretRow = {
      key: firstString(item.key) || '未命名密钥',
      comment: firstString(item.remark),
    }
    const values: Record<string, { secretId: string; folderId: string }> = {}
    environments.value.forEach((environment) => {
      const value = item.values?.[environment.code]
      row[environment.code] = value?.value ?? ''
      if (value?.secretId && value.folderId) {
        values[environment.code] = {
          secretId: value.secretId,
          folderId: value.folderId,
        }
      }
    })
    metadata[row.key] = { groupId: item.groupId, values }
    return row
  })
  secretRowMeta[folderId] = metadata
  return rows
}

async function loadSecretsForFolder(folder: VaultFolder): Promise<void> {
  closeKeyHistory()
  const requestSequence = ++secretRequestSequence
  secretLoadFailed.value = false

  if (!folder.folderGroupId) {
    secretRows[folder.id] = []
    return
  }

  secretLoading.value = true
  try {
    const response = await listSecretsByFolderGroup({
      folderGroupId: folder.folderGroupId,
    })
    if (requestSequence !== secretRequestSequence) return
    const rows = mapSecretRows(response?.secretList ?? [], folder.id)
    secretRows[folder.id] = rows
    folder.count = rows.length
  } catch {
    if (requestSequence !== secretRequestSequence) return
    secretRows[folder.id] = []
    secretLoadFailed.value = true
  } finally {
    if (requestSequence === secretRequestSequence) secretLoading.value = false
  }
}

function reloadActiveSecrets(): void {
  if (activeSecretFolder.value) void loadSecretsForFolder(activeSecretFolder.value)
}

async function loadFolders(): Promise<void> {
  finishInlineEdit(false)
  closeKeyHistory()
  const projectId = selectedProjectId.value
  const requestSequence = ++folderRequestSequence
  groupRequestSequence += 1
  activeFolderId.value = ''
  activeGroupId.value = ''
  serviceGroups.value = []
  groupLoading.value = false
  groupLoadFailed.value = false
  folderLoadFailed.value = false

  if (!projectId) {
    folders.value = []
    folderTotal.value = 0
    return
  }

  folderLoading.value = true
  try {
    const name = folderListSearch.value.trim()
    const response = await listFolders({
      pageNum: folderPage.value,
      pageSize: folderPageSize,
      projectId,
      ...(name ? { name } : {}),
    })
    if (requestSequence !== folderRequestSequence) return
    folders.value = mergeMappedFolders(response.list, projectId)
    folderTotal.value = Number(response.total) || 0
  } catch {
    if (requestSequence !== folderRequestSequence) return
    folders.value = []
    folderTotal.value = 0
    folderLoadFailed.value = true
  } finally {
    if (requestSequence === folderRequestSequence) folderLoading.value = false
  }
}

async function loadGroupFolders(parentFolder: VaultFolder): Promise<void> {
  const requestSequence = ++groupRequestSequence
  groupLoading.value = true
  groupLoadFailed.value = false
  serviceGroups.value = []

  try {
    const response = await listFolders({
      pageNum: 1,
      pageSize: 200,
      parentFolderId: parentFolder.id,
    })
    if (requestSequence !== groupRequestSequence) return
    serviceGroups.value = mergeMappedFolders(response.list, parentFolder.projectId)
    parentFolder.groups = Number(response.total) || 0
  } catch {
    if (requestSequence !== groupRequestSequence) return
    serviceGroups.value = []
    groupLoadFailed.value = true
  } finally {
    if (requestSequence === groupRequestSequence) groupLoading.value = false
  }
}

function reloadGroupFolders(): void {
  if (activeFolder.value?.type === 'groups') void loadGroupFolders(activeFolder.value)
}

async function loadScopeOptions(): Promise<void> {
  scopeLoading.value = true
  try {
    const response = await getOrganizationsWithProjects()
    const orgList = Array.isArray(response.orgList) ? response.orgList : []
    organizations.value = orgList.map((organization) => ({
      id: organization.id,
      name: organization.name || '未命名组织',
    }))
    projects.value = orgList.flatMap((organization) =>
      (Array.isArray(organization.projectList) ? organization.projectList : []).map((project) => ({
        id: project.id,
        orgId: organization.id,
        name: project.name || '未命名项目',
      })),
    )
    selectedOrgId.value = organizations.value[0]?.id ?? ''
    selectedProjectId.value =
      projects.value.find((project) => project.orgId === selectedOrgId.value)?.id ?? ''
    folderPage.value = 1
    await loadProjectEnvironments(selectedProjectId.value)
    await loadFolders()
  } catch {
    organizations.value = []
    projects.value = []
    selectedOrgId.value = ''
    selectedProjectId.value = ''
    folders.value = []
    folderTotal.value = 0
  } finally {
    scopeLoading.value = false
  }
}

function ownerColor(owner: string): string {
  const colors: Record<string, string> = {
    张明: '#4f46e5',
    李华: '#2563eb',
    王芳: '#2563eb',
    陈磊: '#0d9488',
    赵静: '#d97706',
    刘强: '#059669',
  }
  return colors[owner] ?? '#2563eb'
}

async function reloadProjectData(): Promise<void> {
  await loadProjectEnvironments(selectedProjectId.value)
  await loadFolders()
}

function selectOrganization(id: string): void {
  selectedOrgId.value = id
  selectedProjectId.value = projects.value.find((item) => item.orgId === id)?.id ?? ''
  folderPage.value = 1
  cascadeLevel.value = 'project'
  cascadeSearch.value = ''
  void reloadProjectData()
}

function selectProject(id: string): void {
  selectedProjectId.value = id
  folderPage.value = 1
  cascadeOpen.value = false
  cascadeSearch.value = ''
  void reloadProjectData()
}

function changeFolderPage(): void {
  void loadFolders()
}

function onCreateFolderOrganizationChange(): void {
  createFolderForm.projectId = createFolderProjects.value[0]?.id ?? ''
  createFolderFormRef.value?.clearValidate('projectId')
}

function openCreateFolder(parentFolder: VaultFolder | null = null): void {
  createFolderParent.value = parentFolder
  const restoredDraft = restoreCreateFolderDraft()
  if (parentFolder) {
    createFolderForm.organizationId = selectedOrgId.value
    createFolderForm.projectId = parentFolder.projectId
    if (!restoredDraft) createFolderForm.type = 'common'
  }
  createFolderFormRef.value?.clearValidate()
  createFolderDialogVisible.value = true
}

function openFolderEdit(folder: VaultFolder): void {
  editingFolder.value = folder
  folderEditDialogVisible.value = true
}

async function submitFolderEdit(payload: CardEditPayload): Promise<void> {
  const folder = editingFolder.value
  if (!folder || folderEditSubmitting.value) return
  if (!folder.folderGroupId) {
    ElMessage.error('当前配置目录缺少 groupId，无法更新')
    return
  }

  const isServiceGroup = serviceGroups.value.some((item) => item.id === folder.id)
  const parentFolder = activeFolder.value
  folderEditSubmitting.value = true
  try {
    await updateFolder({
      groupId: folder.folderGroupId,
      name: payload.name,
      remark: payload.remark,
    })
    folder.name = payload.name
    folder.remark = payload.remark
    folder.description = payload.remark || '暂无目录说明'
    ElMessage.success('配置目录更新成功')
    folderEditDialogVisible.value = false

    if (isServiceGroup && parentFolder) await loadGroupFolders(parentFolder)
    else await loadFolders()
  } catch (error) {
    if (!(error instanceof ApiError)) ElMessage.error('配置目录更新失败')
  } finally {
    folderEditSubmitting.value = false
  }
}

async function createFolder(): Promise<void> {
  const valid = await createFolderFormRef.value?.validate().catch(() => false)
  if (!valid || !createFolderForm.projectId) return

  createFolderSubmitting.value = true
  try {
    const parentFolder = createFolderParent.value
    const organizationId = createFolderForm.organizationId
    const projectId = createFolderForm.projectId
    const managerId = await resolveManagerId(createFolderForm.managerId)
    if (!managerId) {
      ElMessage.error('无法获取当前用户，请选择管理员后重试')
      return
    }
    await createSecretFolder({
      projectId,
      code: createFolderForm.code.trim(),
      name: createFolderForm.name.trim(),
      managerId,
      remark: createFolderForm.remark.trim() || undefined,
      type: createFolderForm.type,
      parentFolderId: parentFolder?.id,
    })
    ElMessage.success('Folder 创建成功')
    clearCreateFolderDraft()
    clearCreateFolderForm()
    createFolderDialogVisible.value = false
    selectedOrgId.value = organizationId
    selectedProjectId.value = projectId
    cascadeLevel.value = 'project'
    cascadeSearch.value = ''
    folderPage.value = 1
    if (parentFolder) {
      await loadGroupFolders(parentFolder)
    } else {
      await loadProjectEnvironments(projectId)
      await loadFolders()
    }
  } catch (error) {
    const message = error instanceof ApiError ? error.message : 'Folder 创建失败'
    ElMessage.error(message)
  } finally {
    createFolderSubmitting.value = false
  }
}

function switchCascadeLevel(level: CascadeLevel): void {
  cascadeLevel.value = level
  cascadeSearch.value = ''
}

function selectCascadeItem(id: string): void {
  if (cascadeLevel.value === 'organization') selectOrganization(id)
  else selectProject(id)
}

function openFolder(folder: VaultFolder): void {
  finishInlineEdit(false)
  closeKeyHistory()
  activeFolderId.value = folder.id
  activeGroupId.value = ''
  folderSearch.value = ''
  serviceGroups.value = []
  if (folder.type === 'groups') {
    void loadGroupFolders(folder)
    return
  }
  void loadSecretsForFolder(folder)
}

function openServiceGroup(group: VaultFolder): void {
  finishInlineEdit(false)
  activeGroupId.value = group.id
  folderSearch.value = ''
  void loadSecretsForFolder(group)
}

function goBack(): void {
  finishInlineEdit(false)
  closeKeyHistory()
  if (activeGroupId.value) {
    activeGroupId.value = ''
    folderSearch.value = ''
    return
  }
  activeFolderId.value = ''
  serviceGroups.value = []
  folderSearch.value = ''
}

function closeDetail(): void {
  finishInlineEdit(false)
  closeKeyHistory()
  activeFolderId.value = ''
  activeGroupId.value = ''
  serviceGroups.value = []
}

function toggleFavorite(folder: VaultFolder): void {
  folder.favorite = !folder.favorite
  if (folder.favorite) favoriteFolderIds.add(folder.id)
  else favoriteFolderIds.delete(folder.id)
  persistFavoriteFolders()
}

function toggleManagementMode(): void {
  managementMode.value = !managementMode.value
}

async function confirmFolderDelete(folder: VaultFolder): Promise<void> {
  if (!folder.folderGroupId) {
    ElMessage.warning('当前配置目录缺少 groupId，无法删除')
    return
  }

  try {
    await ElMessageBox.confirm(`确定删除配置目录“${folder.name}”吗？`, '删除配置目录', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      customClass: 'vault-confirm-message-box',
      confirmButtonClass: 'vault-delete-confirm-button',
    })
  } catch {
    return
  }

  deletingFolderGroupId.value = folder.folderGroupId
  try {
    await deleteFolder({ groupId: folder.folderGroupId })
    favoriteFolderIds.delete(folder.id)
    persistFavoriteFolders()
    ElMessage.success('配置目录已删除')
    if (
      activeFolder.value?.type === 'groups' &&
      serviceGroups.value.some((item) => item.id === folder.id)
    ) {
      await loadGroupFolders(activeFolder.value)
    } else {
      await loadFolders()
    }
  } catch (error) {
    const message = error instanceof ApiError ? error.message : '配置目录删除失败'
    ElMessage.error(message)
  } finally {
    deletingFolderGroupId.value = ''
  }
}

function isEnvironmentVisible(code: string): boolean {
  return visibleEnvironments[code] !== false
}

function isSecretValueVisible(rowKey: string, code: string): boolean {
  const rowVisibility = visibleSecretValues[rowKey]
  if (rowVisibility && code in rowVisibility) return rowVisibility[code] !== false
  return isEnvironmentVisible(code)
}

function displayValue(row: SecretRow, code: string): string {
  if (!isEnvironmentVisible(code)) return '••••••••'
  return row[code] || '—'
}

function historyItem(row: SecretHistoryDisplayRow, code: string): SecretHistoryItem | undefined {
  return row.values[code]
}

function displayHistoryValue(row: SecretHistoryDisplayRow, code: string): string {
  if (!isEnvironmentVisible(code)) return '••••••••'
  return historyItem(row, code)?.value || '—'
}

function displayHistoryDetailValue(value: string, visible: boolean): string {
  if (!value) return '—'
  return visible ? value : '••••••••'
}

function batchVersionEntries(detail: SecretBatchDetailItem): BatchVersionEntry[] {
  const environmentOrder = new Map(
    environments.value.map((environment, index) => [environment.code, index]),
  )

  return Object.entries(detail.versions ?? {})
    .map(([environmentId, item]) => {
      const environmentCode = (item.envCode || '').toLowerCase()
      const environment = environments.value.find(
        (candidate) => candidate.id === environmentId || candidate.code === environmentCode,
      ) ?? {
        id: environmentId,
        code: environmentCode || 'unknown',
        name: item.envCode || '未知环境',
        isCheckPerm: false,
      }
      return { environment, item }
    })
    .sort(
      (left, right) =>
        (environmentOrder.get(left.environment.code) ?? Number.MAX_SAFE_INTEGER) -
        (environmentOrder.get(right.environment.code) ?? Number.MAX_SAFE_INTEGER),
    )
}

function historyBatchValueKey(entry: BatchVersionEntry): string {
  return `${entry.item.id}:${entry.environment.id || entry.environment.code}`
}

function isHistoryBatchValueVisible(entry: BatchVersionEntry): boolean {
  const key = historyBatchValueKey(entry)
  if (key in historyBatchValueVisibility) return historyBatchValueVisibility[key] === true
  return !entry.environment.isCheckPerm || isEnvironmentVisible(entry.environment.code)
}

function toggleHistoryBatchValue(entry: BatchVersionEntry): void {
  historyBatchValueVisibility[historyBatchValueKey(entry)] = !isHistoryBatchValueVisible(entry)
}

function clearHistoryBatchValueVisibility(): void {
  Object.keys(historyBatchValueVisibility).forEach((key) => {
    delete historyBatchValueVisibility[key]
  })
}

function formatHistoryTimeWindow(windowStart: number): string {
  if (windowStart < 0) return '时间未知'

  const start = new Date(windowStart)
  const end = new Date(windowStart + historyWindowDuration - 1)
  const pad = (value: number) => String(value).padStart(2, '0')
  const date = `${start.getFullYear()}/${pad(start.getMonth() + 1)}/${pad(start.getDate())}`
  const startTime = `${pad(start.getHours())}:${pad(start.getMinutes())}`
  const endTime = `${pad(end.getHours())}:${pad(end.getMinutes())}`
  return `${date} ${startTime} ~ ${endTime}`
}

function buildSecretHistoryRows(
  response: SecretHistoryResponse | null | undefined,
): SecretHistoryDisplayRow[] {
  const environmentCodeById = new Map(
    environments.value
      .filter((environment) => environment.id)
      .map((environment) => [environment.id, environment.code]),
  )
  const environmentOrder = new Map(
    environments.value.map((environment, index) => [environment.code, index]),
  )
  const supportedEnvironmentCodes = new Set(environmentOrder.keys())
  const records: NormalizedSecretHistoryRecord[] = []

  Object.entries(response ?? {}).forEach(([environmentId, history]) => {
    const responseEnvironmentCode = environmentCodeById.get(environmentId)
    ;(history?.list ?? []).forEach((item) => {
      const environmentCode = (responseEnvironmentCode || item.envCode || '').toLowerCase()
      if (!supportedEnvironmentCodes.has(environmentCode)) return

      const timestamp = Date.parse(item.createAt)
      records.push({
        environmentCode,
        item,
        timestamp: Number.isFinite(timestamp) ? timestamp : -1,
      })
    })
  })

  const recordsByBatch = new Map<string, NormalizedSecretHistoryRecord[]>()
  records
    .sort(
      (left, right) => right.timestamp - left.timestamp || right.item.version - left.item.version,
    )
    .forEach((record) => {
      const batchId = record.item.batchId || record.item.id
      const batchRecords = recordsByBatch.get(batchId) ?? []
      batchRecords.push(record)
      recordsByBatch.set(batchId, batchRecords)
    })

  const batchesByWindow = new Map<
    number,
    Array<{ batchId: string; timestamp: number; records: NormalizedSecretHistoryRecord[] }>
  >()
  recordsByBatch.forEach((batchRecords, batchId) => {
    const timestamp = Math.max(...batchRecords.map((record) => record.timestamp))
    const windowStart =
      timestamp >= 0 ? Math.floor(timestamp / historyWindowDuration) * historyWindowDuration : -1
    const windowBatches = batchesByWindow.get(windowStart) ?? []
    windowBatches.push({ batchId, timestamp, records: batchRecords })
    batchesByWindow.set(windowStart, windowBatches)
  })

  return [...batchesByWindow.entries()]
    .sort(([left], [right]) => right - left)
    .flatMap(([windowStart, windowBatches]) => {
      const windowRows: SecretHistoryDisplayRow[] = []
      windowBatches
        .sort((left, right) => right.timestamp - left.timestamp)
        .forEach(({ batchId, records: batchRecords }) => {
          const batchRows: SecretHistoryDisplayRow[] = []
          batchRecords
            .sort(
              (left, right) =>
                (environmentOrder.get(left.environmentCode) ?? Number.MAX_SAFE_INTEGER) -
                  (environmentOrder.get(right.environmentCode) ?? Number.MAX_SAFE_INTEGER) ||
                right.timestamp - left.timestamp,
            )
            .forEach((record) => {
              let targetRow = batchRows.find((row) => !row.values[record.environmentCode])
              if (!targetRow) {
                targetRow = {
                  id: `${windowStart}:${batchId}:${batchRows.length}`,
                  timeWindow: formatHistoryTimeWindow(windowStart),
                  isWindowFirst: false,
                  isWindowLast: false,
                  values: {},
                }
                batchRows.push(targetRow)
              }
              targetRow.values[record.environmentCode] = record.item
            })
          windowRows.push(...batchRows)
        })

      const firstRow = windowRows[0]
      const lastRow = windowRows.at(-1)
      if (firstRow && lastRow) {
        firstRow.isWindowFirst = true
        lastRow.isWindowLast = true
      }
      return windowRows
    })
}

function mergeSecretHistoryData(
  current: SecretHistoryResponse,
  incoming: SecretHistoryResponse | null | undefined,
): SecretHistoryResponse {
  const merged: SecretHistoryResponse = {}
  const environmentIds = new Set([...Object.keys(current), ...Object.keys(incoming ?? {})])

  environmentIds.forEach((environmentId) => {
    const currentHistory = current[environmentId]
    const incomingHistory = incoming?.[environmentId]
    const records = [...(currentHistory?.list ?? []), ...(incomingHistory?.list ?? [])]
    const uniqueRecords = new Map<string, SecretHistoryItem>()

    records.forEach((item) => {
      const identity = item.id || `${item.secretId}:${item.version}:${item.createAt}`
      uniqueRecords.set(identity, item)
    })

    const list = [...uniqueRecords.values()]
    merged[environmentId] = {
      total: Math.max(Number(currentHistory?.total) || 0, Number(incomingHistory?.total) || 0),
      list,
    }
  })

  return merged
}

function toggleEnvironmentVisibility(code: string): void {
  visibleEnvironments[code] = !isEnvironmentVisible(code)
  Object.values(visibleSecretValues).forEach((rowVisibility) => {
    delete rowVisibility[code]
  })
}

function toggleSecretValueVisibility(rowKey: string, code: string): void {
  const rowVisibility = visibleSecretValues[rowKey] ?? {}
  rowVisibility[code] = !isSecretValueVisible(rowKey, code)
  visibleSecretValues[rowKey] = rowVisibility
}

function clearSecretValueVisibility(rowKey?: string): void {
  if (rowKey) {
    delete visibleSecretValues[rowKey]
    return
  }
  Object.keys(visibleSecretValues).forEach((key) => {
    delete visibleSecretValues[key]
  })
}

async function copyValue(value: string): Promise<void> {
  const copied = await copyToClipboard(value)
  ElMessage[copied ? 'success' : 'warning'](
    copied ? '已复制到剪贴板' : '复制失败，请检查浏览器权限',
  )
}

function closeKeyHistory(): void {
  historyRequestSequence += 1
  expandedHistoryKey.value = ''
  historyLoadingKey.value = ''
  historyLoadFailedKey.value = ''
  historyRows.value = []
  historyData.value = {}
  historyPageNum.value = 1
  historyLoadingMore.value = false
}

function resetKeyForm(): void {
  keyForm.key = ''
  keyForm.remark = ''
  keyForm.commitMsg = ''
  keyForm.values = Object.fromEntries(
    environments.value.map((environment) => [environment.code, '']),
  )
  commitMsgInvalid.value = false
}

function resetKeyFormBaseline(): void {
  keyFormBaseline.key = ''
  keyFormBaseline.remark = ''
  keyFormBaseline.values = {}
}

function keyDialogDraftKey(mode: 'create' | 'edit' = keyDialogMode.value): string {
  const scope = [selectedProjectId.value, activeFolderId.value, activeGroupId.value || 'root']
    .map((value) => encodeURIComponent(value || 'unknown'))
    .join(':')
  const key = mode === 'edit' ? `:${encodeURIComponent(editingKey.value || 'unknown')}` : ''
  return `${keyDialogDraftStoragePrefix}:${mode}:${scope}${key}`
}

function normalizeKeyDraftRows(value: unknown): KeyDraftRow[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const raw = item as Record<string, unknown>
    const values =
      raw.values && typeof raw.values === 'object'
        ? Object.fromEntries(
            Object.entries(raw.values as Record<string, unknown>).map(([code, itemValue]) => [
              code,
              typeof itemValue === 'string' ? itemValue : '',
            ]),
          )
        : {}
    keyDraftSequence += 1
    return [
      {
        id: `key-draft-${keyDraftSequence}`,
        key: typeof raw.key === 'string' ? raw.key : '',
        remark: typeof raw.remark === 'string' ? raw.remark : '',
        values,
      },
    ]
  })
}

function isKeyDraftEmpty(): boolean {
  return !keyDraftRows.value.some(
    (row) =>
      row.key.trim() ||
      row.remark.trim() ||
      Object.values(row.values).some((value) => value.trim()),
  )
}

function isKeyFormDirty(): boolean {
  if (keyForm.commitMsg.trim()) return true
  if (keyForm.key !== keyFormBaseline.key || keyForm.remark !== keyFormBaseline.remark) return true
  return environments.value.some(
    (environment) => keyForm.values[environment.code] !== keyFormBaseline.values[environment.code],
  )
}

function clearKeyDialogDraft(mode: 'create' | 'edit' = keyDialogMode.value): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(keyDialogDraftKey(mode))
  } catch {
    // 本地存储不可用时不影响密钥弹框的正常使用。
  }
}

function persistKeyDialogDraft(): void {
  if (typeof window === 'undefined' || !activeFolderId.value) return
  const mode = keyDialogMode.value
  const shouldPersist = mode === 'create' ? !isKeyDraftEmpty() : isKeyFormDirty()
  if (!shouldPersist) {
    clearKeyDialogDraft(mode)
    return
  }

  const draft =
    mode === 'create'
      ? { mode, rows: keyDraftRows.value }
      : {
          mode,
          form: {
            key: keyForm.key,
            remark: keyForm.remark,
            commitMsg: keyForm.commitMsg,
            values: keyForm.values,
          },
        }
  try {
    window.localStorage.setItem(keyDialogDraftKey(mode), JSON.stringify(draft))
  } catch {
    // 本地存储不可用或空间不足时仍允许用户继续编辑。
  }
}

function restoreKeyDialogDraft(mode: 'create' | 'edit'): void {
  if (typeof window === 'undefined' || !activeFolderId.value) return
  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(keyDialogDraftKey(mode))
  } catch {
    return
  }
  if (!raw) return

  try {
    const draft: unknown = JSON.parse(raw)
    if (!draft || typeof draft !== 'object') throw new Error('Invalid key draft')
    const value = draft as Record<string, unknown>
    if (value.mode !== mode) throw new Error('Mismatched key draft')
    if (mode === 'create') {
      const rows = normalizeKeyDraftRows(value.rows)
      if (rows.length) keyDraftRows.value = rows
      return
    }
    if (!value.form || typeof value.form !== 'object') throw new Error('Invalid key form draft')
    const form = value.form as Record<string, unknown>
    if (typeof form.remark === 'string') keyForm.remark = form.remark
    if (typeof form.commitMsg === 'string') keyForm.commitMsg = form.commitMsg
    if (form.values && typeof form.values === 'object') {
      keyForm.values = Object.fromEntries(
        Object.entries(form.values as Record<string, unknown>).map(([code, itemValue]) => [
          code,
          typeof itemValue === 'string' ? itemValue : '',
        ]),
      )
    }
  } catch {
    clearKeyDialogDraft(mode)
  }
}

function createKeyDraftRow(): KeyDraftRow {
  keyDraftSequence += 1
  return {
    id: `key-draft-${keyDraftSequence}`,
    key: '',
    remark: '',
    values: Object.fromEntries(environments.value.map((environment) => [environment.code, ''])),
  }
}

function addKeyDraftRow(): void {
  keyDraftRows.value.push(createKeyDraftRow())
}

function removeKeyDraftRow(index: number): void {
  if (keyDraftRows.value.length <= 1) return
  keyDraftRows.value.splice(index, 1)
}

async function openKeyDialog(): Promise<void> {
  if (editingKey.value) {
    ElMessage.warning('请先保存或取消当前行的编辑')
    return
  }
  if (
    !activeSecretFolder.value ||
    (activeFolder.value?.type === 'groups' && !activeGroupId.value)
  ) {
    ElMessage.warning('请先选择一个配置目录')
    return
  }

  closeKeyHistory()

  const projectId = activeSecretFolder.value.projectId || selectedProjectId.value
  if (environmentProjectId.value !== projectId || environmentLoadFailed.value) {
    await loadProjectEnvironments(projectId)
  }
  if (!environments.value.length) {
    ElMessage.error(
      environmentLoadFailed.value ? '当前项目环境加载失败,请稍后重试' : '当前项目没有可用环境',
    )
    return
  }

  keyDialogMode.value = 'create'
  editingKey.value = ''
  resetKeyForm()
  resetKeyFormBaseline()
  keyDraftRows.value = [createKeyDraftRow()]
  restoreKeyDialogDraft('create')
  keySubmitting.value = false
  keyDialogVisible.value = true
}

function keyFormValue(environmentCode: string): string {
  return keyForm.values[environmentCode] ?? ''
}

async function createKeys(): Promise<void> {
  const folder = activeSecretFolder.value
  if (!folder) return

  const rows = keyDraftRows.value
  if (!rows.length) {
    ElMessage.warning('请至少添加一行密钥')
    return
  }

  const keys = new Set<string>()
  for (const [index, row] of rows.entries()) {
    const key = row.key.trim()
    if (!key) {
      ElMessage.error(`第 ${index + 1} 行 key 不能为空`)
      return
    }
    if (!/^[A-Z][A-Z0-9_]*$/.test(key)) {
      ElMessage.error(`第 ${index + 1} 行 key 格式不正确,需使用大写字母、数字和下划线`)
      return
    }
    if (keys.has(key)) {
      ElMessage.error(`密钥 ${key} 重复,请合并或修改`)
      return
    }
    keys.add(key)
    if (row.remark.trim().length > 256) {
      ElMessage.error(`第 ${index + 1} 行说明不能超过 256 个字符`)
      return
    }
    let hasEnvironmentValue = false
    for (const environment of environments.value) {
      const value = row.values[environment.code] ?? ''
      if (value.trim()) hasEnvironmentValue = true
      if (value.length > 8192) {
        ElMessage.error(`${environment.code.toUpperCase()} 环境值不能超过 8192 个字符`)
        return
      }
    }
    if (!hasEnvironmentValue) {
      ElMessage.error(`第 ${index + 1} 行至少填写一个环境值`)
      return
    }
  }

  if (!environments.value.length) {
    ElMessage.error('当前项目没有可用环境,无法创建密钥')
    return
  }

  if (!folder.folderGroupId) {
    ElMessage.error('当前配置集缺少 folderGroupId,无法创建密钥')
    return
  }

  const request: BatchCreateSecretsRequest = {
    secretList: rows.map((row) => ({
      folderGroupId: folder.folderGroupId,
      key: row.key.trim(),
      remark: row.remark.trim(),
      values: environments.value.map(
        (environment): BatchCreateSecretValue => ({
          envId: environment.id,
          value: row.values[environment.code] ?? '',
        }),
      ),
    })),
  }

  keySubmitting.value = true
  try {
    await batchCreateSecrets(request)
    ElMessage.success(`已创建 ${rows.length} 条密钥`)
    clearKeyDialogDraft('create')
    keyDialogVisible.value = false
    keyDraftRows.value = []
    await loadSecretsForFolder(folder)
  } catch (error) {
    const message = error instanceof ApiError ? error.message : '密钥创建失败'
    ElMessage.error(message)
  } finally {
    keySubmitting.value = false
  }
}

async function updateKey(): Promise<void> {
  const folder = activeSecretFolder.value
  const rowKey = editingKey.value
  const metadata = folder ? secretRowMeta[folder.id]?.[rowKey] : undefined
  if (!folder || !rowKey || !metadata?.groupId) {
    ElMessage.warning('缺少密钥更新所需的 groupId')
    return
  }

  const nextRemark = keyForm.remark.trim()
  if (nextRemark.length > 256) {
    ElMessage.error('说明不能超过 256 个字符')
    return
  }

  const values = Object.entries(metadata.values).flatMap(([envCode, ids]) => {
    const value = keyFormValue(envCode)
    if (value.length > 8192) {
      return []
    }
    if (value === (keyFormBaseline.values[envCode] ?? '')) return []
    return [
      {
        secretId: ids.secretId,
        envCode,
        folderId: ids.folderId,
        value,
      },
    ]
  })

  const invalidEnvironment = environments.value.find(
    (environment) => keyFormValue(environment.code).length > 8192,
  )
  if (invalidEnvironment) {
    ElMessage.error(`${invalidEnvironment.name}值不能超过 8192 个字符`)
    return
  }

  const remarkChanged = nextRemark !== keyFormBaseline.remark.trim()
  if (!remarkChanged && values.length === 0) {
    finishInlineEdit(true)
    ElMessage.info('内容没有变化')
    return
  }

  const commitMsg = keyForm.commitMsg.trim()
  if (!commitMsg) {
    commitMsgInvalid.value = true
    ElMessage.error('请填写版本修改信息')
    return
  }

  const secret: UpdateFolderGroupSecretItemRequest = {
    groupId: metadata.groupId,
    key: rowKey,
  }
  if (remarkChanged) secret.remark = nextRemark
  if (values.length) secret.values = values

  keySubmitting.value = true
  try {
    await updateFolderGroupSecrets({
      commitMsg,
      secrets: [secret],
    })
    ElMessage.success('密钥更新成功')
    finishInlineEdit(true)
    await loadSecretsForFolder(folder)
  } catch (error) {
    const message = error instanceof ApiError ? error.message : '密钥更新失败'
    ElMessage.error(message)
  } finally {
    keySubmitting.value = false
  }
}

function finishInlineEdit(clearDraft: boolean): void {
  expandedKeyEditVisible.value = false
  const rowKey = editingKey.value
  if (!rowKey) return
  if (clearDraft) clearKeyDialogDraft('edit')
  else persistKeyDialogDraft()
  clearSecretValueVisibility(rowKey)
  editingKey.value = ''
  keyDialogMode.value = 'create'
  resetKeyForm()
  resetKeyFormBaseline()
  keySubmitting.value = false
}

function cancelKeyEdit(): void {
  finishInlineEdit(true)
}

function openExpandedKeyEdit(): void {
  if (!editingKey.value) return
  expandedKeyEditVisible.value = true
}

async function loadKeyHistory(row: SecretRow): Promise<void> {
  const folder = activeSecretFolder.value
  const metadata = folder ? secretRowMeta[folder.id]?.[row.key] : undefined
  if (!folder || !metadata?.groupId) {
    ElMessage.warning('当前密钥缺少 groupId，无法查询历史版本')
    return
  }

  const requestSequence = ++historyRequestSequence
  expandedHistoryKey.value = row.key
  historyLoadingKey.value = row.key
  historyLoadFailedKey.value = ''
  historyRows.value = []
  historyData.value = {}
  historyPageNum.value = 1
  historyLoadingMore.value = false

  try {
    const response = await getSecretHistory({
      groupId: metadata.groupId,
      envList: environments.value.map((environment) => environment.code),
      pageNum: 1,
      pageSize: historyPageSize,
    })
    if (requestSequence !== historyRequestSequence || expandedHistoryKey.value !== row.key) return
    historyData.value = mergeSecretHistoryData({}, response)
    historyRows.value = buildSecretHistoryRows(historyData.value)
  } catch (error) {
    if (requestSequence !== historyRequestSequence || expandedHistoryKey.value !== row.key) return
    historyLoadFailedKey.value = row.key
    if (!(error instanceof ApiError)) ElMessage.error('历史版本加载失败')
  } finally {
    if (requestSequence === historyRequestSequence && historyLoadingKey.value === row.key) {
      historyLoadingKey.value = ''
    }
  }
}

async function loadMoreKeyHistory(row: SecretRow): Promise<void> {
  if (!historyHasMore.value || historyLoadingMore.value) return

  const folder = activeSecretFolder.value
  const metadata = folder ? secretRowMeta[folder.id]?.[row.key] : undefined
  if (!folder || !metadata?.groupId) {
    ElMessage.warning('当前密钥缺少 groupId，无法加载更多历史版本')
    return
  }

  const nextPage = historyPageNum.value + 1
  const requestSequence = ++historyRequestSequence
  historyLoadingMore.value = true

  try {
    const response = await getSecretHistory({
      groupId: metadata.groupId,
      envList: environments.value.map((environment) => environment.code),
      pageNum: nextPage,
      pageSize: historyPageSize,
    })
    if (requestSequence !== historyRequestSequence || expandedHistoryKey.value !== row.key) return
    historyData.value = mergeSecretHistoryData(historyData.value, response)
    historyRows.value = buildSecretHistoryRows(historyData.value)
    historyPageNum.value = nextPage
  } catch (error) {
    if (requestSequence !== historyRequestSequence || expandedHistoryKey.value !== row.key) return
    if (!(error instanceof ApiError)) ElMessage.error('更多历史版本加载失败')
  } finally {
    if (requestSequence === historyRequestSequence) historyLoadingMore.value = false
  }
}

function openKeyHistory(row: SecretRow): void {
  if (historyLoadingKey.value) return
  if (expandedHistoryKey.value === row.key) {
    closeKeyHistory()
    return
  }
  void loadKeyHistory(row)
}

function openHistoryVersionDetail(
  row: SecretRow,
  historyRow: SecretHistoryDisplayRow,
  environment: VaultEnvironment,
): void {
  const item = historyItem(historyRow, environment.code)
  if (!item) return

  historyBatchRequestSequence += 1
  historyVersionSelection.value = {
    key: row.key,
    remark: row.comment,
    environment,
    item,
  }
  historyDetailTab.value = 'version'
  historyDetailValueVisible.value =
    !environment.isCheckPerm || isEnvironmentVisible(environment.code)
  historyBatchLoading.value = false
  historyBatchLoadFailed.value = false
  historyBatchLoadedId.value = ''
  historyBatchDetails.value = []
  clearHistoryBatchValueVisibility()
  historyDetailVisible.value = true
  void loadHistoryBatchDetails()
}

async function loadHistoryBatchDetails(): Promise<void> {
  const batchId = historyVersionSelection.value?.item.batchId
  if (!batchId || historyBatchLoading.value) return

  const requestSequence = ++historyBatchRequestSequence
  historyBatchLoading.value = true
  historyBatchLoadFailed.value = false

  try {
    const response = await getSecretBatchDetail({
      batchId,
      envList: environments.value.map((environment) => environment.code),
    })
    if (
      requestSequence !== historyBatchRequestSequence ||
      historyVersionSelection.value?.item.batchId !== batchId
    ) {
      return
    }
    const details = Array.isArray(response) ? response : []
    historyBatchDetails.value = details
    historyBatchLoadedId.value = batchId

    const selection = historyVersionSelection.value
    if (selection) {
      for (const detail of details) {
        const detailedItem = Object.values(detail.versions ?? {}).find(
          (item) => item.id === selection.item.id,
        )
        if (!detailedItem) continue
        historyVersionSelection.value = {
          ...selection,
          remark: detail.remark,
          item: detailedItem,
        }
        break
      }
    }
  } catch (error) {
    if (
      requestSequence !== historyBatchRequestSequence ||
      historyVersionSelection.value?.item.batchId !== batchId
    ) {
      return
    }
    historyBatchDetails.value = []
    historyBatchLoadFailed.value = true
    if (!(error instanceof ApiError)) ElMessage.error('批次详情加载失败')
  } finally {
    if (requestSequence === historyBatchRequestSequence) historyBatchLoading.value = false
  }
}

function switchHistoryDetailTab(tab: HistoryDetailTab): void {
  historyDetailTab.value = tab
  const batchId = historyVersionSelection.value?.item.batchId
  if (
    tab === 'batch' &&
    batchId &&
    historyBatchLoadedId.value !== batchId &&
    !historyBatchLoading.value
  ) {
    void loadHistoryBatchDetails()
  }
}

function resetHistoryVersionDetail(): void {
  historyBatchRequestSequence += 1
  historyVersionSelection.value = null
  historyDetailTab.value = 'version'
  historyDetailValueVisible.value = true
  historyBatchLoading.value = false
  historyBatchLoadFailed.value = false
  historyBatchLoadedId.value = ''
  historyBatchDetails.value = []
  clearHistoryBatchValueVisibility()
}

async function deleteKey(row: SecretRow): Promise<void> {
  const folder = activeSecretFolder.value
  const metadata = folder ? secretRowMeta[folder.id]?.[row.key] : undefined
  if (!folder || !metadata?.groupId) {
    ElMessage.warning('当前密钥缺少 groupId，无法删除')
    return
  }

  try {
    await ElMessageBox.confirm(
      `确定删除密钥“${row.key}”吗？该密钥在所有环境下的值都会被删除。`,
      '删除密钥',
      {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        customClass: 'vault-confirm-message-box',
        confirmButtonClass: 'vault-delete-confirm-button',
      },
    )
  } catch {
    return
  }

  deletingKey.value = row.key
  try {
    await deleteFolderGroupSecret({ groupId: metadata.groupId })
    ElMessage.success('密钥已删除')
    await loadSecretsForFolder(folder)
  } catch (error) {
    const message = error instanceof ApiError ? error.message : '密钥删除失败'
    ElMessage.error(message)
  } finally {
    deletingKey.value = ''
  }
}

function editKey(row: SecretRow): void {
  const folder = activeSecretFolder.value
  const metadata = folder ? secretRowMeta[folder.id]?.[row.key] : undefined
  if (!metadata?.groupId) {
    ElMessage.warning('当前密钥缺少 groupId，无法编辑')
    return
  }

  closeKeyHistory()
  clearSecretValueVisibility()
  keyDialogMode.value = 'edit'
  editingKey.value = row.key
  expandedKeyEditVisible.value = false
  keyForm.key = row.key
  keyForm.remark = row.comment
  keyForm.commitMsg = ''
  commitMsgInvalid.value = false
  keyForm.values = Object.fromEntries(
    environments.value.map((environment) => [environment.code, row[environment.code] ?? '']),
  )
  keyFormBaseline.key = keyForm.key
  keyFormBaseline.remark = keyForm.remark
  keyFormBaseline.values = { ...keyForm.values }
  restoreKeyDialogDraft('edit')
  keySubmitting.value = false
}

function onCreateFolderClosed(): void {
  createFolderFormRef.value?.clearValidate()
  createFolderParent.value = null
}

onMounted(() => {
  restoreFavoriteFolders()
  window.addEventListener('beforeunload', persistKeyDialogDraft)
  void loadScopeOptions()
})

onBeforeUnmount(() => {
  window.clearTimeout(folderSearchTimer)
  persistKeyDialogDraft()
  window.removeEventListener('beforeunload', persistKeyDialogDraft)
})

watch(folderListSearch, () => {
  window.clearTimeout(folderSearchTimer)
  folderSearchTimer = window.setTimeout(() => {
    folderPage.value = 1
    void loadFolders()
  }, 300)
})

watch(createFolderForm, persistCreateFolderDraft, { deep: true })
watch([keyDraftRows, keyForm], persistKeyDialogDraft, { deep: true })
</script>

<template>
  <div class="vault-page">
    <template v-if="!activeFolder">
      <div class="vault-page__toolbar">
        <el-popover
          v-model:visible="cascadeOpen"
          placement="bottom-start"
          :width="336"
          :show-arrow="false"
          trigger="click"
          popper-class="vault-cascade-popper"
        >
          <template #reference>
            <button type="button" class="vault-page__cascade">
              <el-icon><OfficeBuilding /></el-icon>
              <strong>{{ selectedOrg.name }}</strong>
              <el-icon class="vault-page__chevron"><ArrowRight /></el-icon>
              <el-icon><FolderOpened /></el-icon>
              <strong>{{ selectedProject.name }}</strong>
              <el-icon class="vault-page__cascade-down"><ArrowRight /></el-icon>
            </button>
          </template>

          <div class="vault-cascade">
            <el-input
              v-model="cascadeSearch"
              :prefix-icon="Search"
              placeholder="搜索..."
              clearable
            />
            <div class="vault-cascade__tabs">
              <button
                type="button"
                :class="{ 'is-active': cascadeLevel === 'organization' }"
                @click="switchCascadeLevel('organization')"
              >
                组织
                <el-icon v-if="selectedOrgId"><Check /></el-icon>
              </button>
              <button
                type="button"
                :class="{ 'is-active': cascadeLevel === 'project' }"
                @click="switchCascadeLevel('project')"
              >
                项目
                <el-icon v-if="selectedProjectId"><Check /></el-icon>
              </button>
            </div>
            <div class="vault-cascade__list">
              <button
                v-for="item in cascadeItems"
                :key="item.id"
                type="button"
                :class="{
                  'is-selected':
                    cascadeLevel === 'organization'
                      ? item.id === selectedOrgId
                      : item.id === selectedProjectId,
                }"
                @click="selectCascadeItem(item.id)"
              >
                <span>{{ item.name }}</span>
                <el-icon v-if="cascadeLevel === 'organization'"><ArrowRight /></el-icon>
                <el-icon v-else-if="item.id === selectedProjectId" class="vault-cascade__check"
                  ><Check
                /></el-icon>
              </button>
              <div v-if="cascadeItems.length === 0" class="vault-cascade__empty">
                {{ scopeLoading ? '加载中...' : '没有匹配项' }}
              </div>
            </div>
          </div>
        </el-popover>

        <div class="vault-page__toolbar-actions">
          <el-input
            v-model="folderListSearch"
            clearable
            class="vault-page__search"
            placeholder="搜索文件夹..."
          >
            <template #prefix
              ><el-icon><Search /></el-icon
            ></template>
          </el-input>
          <el-tooltip content="新建" placement="bottom">
            <button
              type="button"
              class="vault-round-action vault-round-action--primary"
              :disabled="scopeLoading"
              aria-label="新建"
              @click="openCreateFolder()"
            >
              <el-icon><Plus /></el-icon>
            </button>
          </el-tooltip>
          <el-tooltip :content="favoriteOnly ? '显示全部' : '仅显示收藏'" placement="bottom">
            <button
              type="button"
              class="vault-round-action"
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
              class="vault-round-action"
              :class="{ 'is-managing': managementMode }"
              :aria-pressed="managementMode"
              :aria-label="managementMode ? '退出管理' : '管理卡片'"
              @click="toggleManagementMode"
            >
              <el-icon><Setting /></el-icon>
            </button>
          </el-tooltip>
        </div>
      </div>

      <div v-loading="folderLoading || scopeLoading" class="vault-page__content is-folder-list">
        <div v-if="visibleFolders.length" class="vault-folder-list">
          <div class="vault-folder-scroll">
            <div class="vault-folders">
              <article
                v-for="folder in visibleFolders"
                :key="folder.id"
                class="vault-folder"
                tabindex="0"
                role="button"
                @click="openFolder(folder)"
                @keydown.enter.self="openFolder(folder)"
              >
                <div class="vault-folder__top">
                  <span class="vault-folder__icon" :class="`is-${folder.type}`">
                    <el-icon><component :is="folderMeta(folder.type).icon" /></el-icon>
                  </span>
                  <span class="vault-folder__labels">
                    <span class="vault-folder__tag" :class="`is-${folder.type}`">
                      {{ folderMeta(folder.type).label }}
                    </span>
                    <button
                      type="button"
                      class="vault-folder__favorite"
                      :class="{ 'is-active': folder.favorite }"
                      :aria-label="folder.favorite ? '取消收藏' : '收藏'"
                      @click.stop="toggleFavorite(folder)"
                      @keydown.enter.stop
                    >
                      <el-icon>
                        <StarFilled v-if="folder.favorite" />
                        <Star v-else />
                      </el-icon>
                    </button>
                    <template v-if="managementMode">
                      <el-tooltip content="编辑配置目录" placement="top">
                        <button
                          type="button"
                          class="vault-folder__edit vault-edit-action"
                          :disabled="!!deletingFolderGroupId"
                          :aria-label="`编辑${folder.name}`"
                          @click.stop="openFolderEdit(folder)"
                          @keydown.enter.stop
                        >
                          <el-icon><Edit /></el-icon>
                        </button>
                      </el-tooltip>
                      <el-tooltip content="删除配置目录" placement="top">
                        <button
                          type="button"
                          class="vault-folder__delete vault-delete-action"
                          :disabled="!!deletingFolderGroupId"
                          :aria-label="`删除${folder.name}`"
                          @click.stop="confirmFolderDelete(folder)"
                          @keydown.enter.stop
                        >
                          <el-icon
                            :class="{
                              'is-loading': deletingFolderGroupId === folder.folderGroupId,
                            }"
                          >
                            <Loading v-if="deletingFolderGroupId === folder.folderGroupId" />
                            <Delete v-else />
                          </el-icon>
                        </button>
                      </el-tooltip>
                    </template>
                  </span>
                </div>

                <h2>{{ folder.name }}</h2>
                <p>{{ folder.description }}</p>

                <footer>
                  <span class="vault-folder__owner">
                    <span
                      class="vault-folder__avatar"
                      :style="{ background: ownerColor(folder.owner) }"
                    >
                      {{ folder.owner.slice(0, 1) }}
                    </span>
                    {{ folder.owner }}
                  </span>
                  <span v-if="folder.type === 'groups'">
                    {{ folder.groups ?? '--' }} 个密钥集
                  </span>
                  <span v-else>{{ folder.count ?? '--' }} 个密钥</span>
                </footer>
              </article>
            </div>
          </div>

          <div class="vault-pagination">
            <span>{{
              favoriteOnly
                ? `已收藏 ${visibleFolders.length} 个配置目录`
                : `共 ${folderTotal} 个配置目录`
            }}</span>
            <el-pagination
              v-model:current-page="folderPage"
              background
              layout="prev, pager, next"
              :page-size="folderPageSize"
              :total="favoriteOnly ? visibleFolders.length : folderTotal"
              :hide-on-single-page="favoriteOnly"
              @current-change="changeFolderPage"
            />
          </div>
        </div>

        <div v-else-if="!folderLoading && !scopeLoading" class="vault-empty">
          <el-icon><component :is="favoriteOnly ? Star : FolderOpened" /></el-icon>
          <strong v-if="folderLoadFailed">配置目录加载失败</strong>
          <strong v-else-if="favoriteOnly">暂无收藏的配置目录</strong>
          <strong v-else-if="!selectedProjectId">暂无可用项目</strong>
          <strong v-else>当前项目暂无配置目录</strong>
          <el-button v-if="folderLoadFailed" type="primary" link @click="loadFolders">
            重新加载
          </el-button>
        </div>
      </div>
    </template>

    <template v-else>
      <div class="vault-page__detail-head">
        <button type="button" class="vault-page__back" aria-label="返回" @click="goBack">
          <el-icon><ArrowLeft /></el-icon>
        </button>
        <button type="button" @click="closeDetail">
          {{ selectedOrg.name }}
        </button>
        <el-icon><ArrowRight /></el-icon>
        <button type="button" @click="closeDetail">
          {{ selectedProject.name }}
        </button>
        <el-icon><ArrowRight /></el-icon>
        <button v-if="activeGroupId" type="button" @click="goBack">
          {{ activeFolder.name }}
        </button>
        <el-icon v-if="activeGroupId"><ArrowRight /></el-icon>
        <strong>{{ activeServiceGroup?.name ?? activeFolder.name }}</strong>
      </div>

      <div class="vault-page__detail-toolbar">
        <div class="vault-page__detail-meta">
          <span class="vault-folder__tag" :class="`is-${activeFolder.type}`">
            {{ activeGroupId ? '分组配置' : folderMeta(activeFolder.type).label }}
          </span>
          <span v-if="activeFolder.type === 'groups' && !activeGroupId">
            {{ serviceGroups.length }} 个配置集
          </span>
          <template v-else>
            <span v-if="activeGroupId" class="vault-page__folder-code">
              <span>folder-code：</span>
              <el-tooltip content="点击复制 folder code" placement="top">
                <button
                  type="button"
                  :aria-label="`复制 folder code ${activeServiceGroup?.code || ''}`"
                  :disabled="!activeServiceGroup?.code"
                  @click="copyValue(activeServiceGroup?.code || '')"
                >
                  <code>{{ activeServiceGroup?.code || '--' }}</code>
                  <el-icon><CopyDocument /></el-icon>
                </button>
              </el-tooltip>
            </span>
            <span>{{ activeRows.length }} 个密钥</span>
          </template>
        </div>
        <div
          v-if="activeFolder.type === 'groups' && !activeGroupId"
          class="vault-page__toolbar-actions"
        >
          <el-tooltip content="新建配置集" placement="bottom">
            <button
              type="button"
              class="vault-round-action vault-round-action--primary"
              :disabled="groupLoading"
              aria-label="新建配置集"
              @click="openCreateFolder(activeFolder)"
            >
              <el-icon><Plus /></el-icon>
            </button>
          </el-tooltip>
          <el-tooltip :content="managementMode ? '退出管理' : '管理卡片'" placement="bottom">
            <button
              type="button"
              class="vault-round-action"
              :class="{ 'is-managing': managementMode }"
              :aria-pressed="managementMode"
              :aria-label="managementMode ? '退出管理' : '管理卡片'"
              @click="toggleManagementMode"
            >
              <el-icon><Setting /></el-icon>
            </button>
          </el-tooltip>
        </div>
        <div v-else class="vault-page__toolbar-actions">
          <el-input
            v-model="folderSearch"
            :prefix-icon="Search"
            clearable
            class="vault-page__search"
            placeholder="搜索密钥名..."
          />
          <el-tooltip content="添加密钥" placement="bottom">
            <button
              type="button"
              class="vault-round-action vault-round-action--primary"
              :disabled="environmentLoading || !!editingKey || keySubmitting || !!deletingKey"
              aria-label="添加密钥"
              @click="openKeyDialog"
            >
              <el-icon><Plus /></el-icon>
            </button>
          </el-tooltip>
        </div>
      </div>

      <div
        v-if="activeFolder.type === 'groups' && !activeGroupId"
        v-loading="groupLoading"
        class="vault-page__content"
      >
        <div v-if="serviceGroups.length" class="vault-groups">
          <article
            v-for="group in serviceGroups"
            :key="group.id"
            tabindex="0"
            role="button"
            @click="openServiceGroup(group)"
            @keydown.enter.self="openServiceGroup(group)"
          >
            <span class="vault-folder__icon is-groups"
              ><el-icon><FolderOpened /></el-icon
            ></span>
            <div>
              <h2>{{ group.name }}</h2>
              <p>{{ group.description }}</p>
            </div>
            <span>{{ group.count ?? '--' }} 个密钥</span>
            <span class="vault-groups__actions">
              <template v-if="managementMode">
                <el-tooltip content="编辑配置目录" placement="top">
                  <button
                    type="button"
                    class="vault-groups__edit vault-edit-action"
                    :disabled="!!deletingFolderGroupId"
                    :aria-label="`编辑${group.name}`"
                    @click.stop="openFolderEdit(group)"
                    @keydown.enter.stop
                  >
                    <el-icon><Edit /></el-icon>
                  </button>
                </el-tooltip>
                <el-tooltip content="删除配置目录" placement="top">
                  <button
                    type="button"
                    class="vault-groups__delete vault-delete-action"
                    :disabled="!!deletingFolderGroupId"
                    :aria-label="`删除${group.name}`"
                    @click.stop="confirmFolderDelete(group)"
                    @keydown.enter.stop
                  >
                    <el-icon
                      :class="{ 'is-loading': deletingFolderGroupId === group.folderGroupId }"
                    >
                      <Loading v-if="deletingFolderGroupId === group.folderGroupId" />
                      <Delete v-else />
                    </el-icon>
                  </button>
                </el-tooltip>
              </template>
              <el-icon><ArrowRight /></el-icon>
            </span>
          </article>
        </div>
        <div v-else-if="!groupLoading" class="vault-empty">
          <el-icon><FolderOpened /></el-icon>
          <strong v-if="groupLoadFailed">二级目录加载失败</strong>
          <strong v-else>groups 下暂无二级目录</strong>
          <el-button v-if="groupLoadFailed" type="primary" link @click="reloadGroupFolders">
            重新加载
          </el-button>
        </div>
      </div>

      <div v-else v-loading="secretLoading" class="vault-table-wrap">
        <table
          v-if="activeRows.length"
          class="vault-table"
          :style="{ minWidth: `${secretTableMinWidth}px` }"
        >
          <colgroup>
            <col class="vault-table__column vault-table__column--key" />
            <col
              v-for="environment in environments"
              :key="environment.id || environment.code"
              class="vault-table__column vault-table__column--environment"
            />
            <col class="vault-table__column vault-table__column--comment" />
            <col
              class="vault-table__column vault-table__column--operations"
              :style="{ width: `${operationColumnWidth}px` }"
            />
          </colgroup>
          <thead>
            <tr>
              <th>密钥名称</th>
              <th v-for="environment in environments" :key="environment.code">
                <span class="vault-table__env-heading">
                  <span class="vault-env" :class="`is-${environment.code}`">
                    {{ environment.code.toUpperCase() }}
                  </span>
                  <span class="vault-table__env-name">{{ environment.name }}</span>
                  <button
                    type="button"
                    class="vault-table__env-visibility"
                    :aria-label="`${isEnvironmentVisible(environment.code) ? '隐藏' : '显示'}${environment.name}`"
                    @click="toggleEnvironmentVisibility(environment.code)"
                  >
                    <el-icon>
                      <View v-if="isEnvironmentVisible(environment.code)" />
                      <Hide v-else />
                    </el-icon>
                  </button>
                </span>
              </th>
              <th>说明</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="row in activeRows" :key="row.key">
              <tr
                :class="{
                  'is-editing': editingKey === row.key,
                  'is-history-expanded': expandedHistoryKey === row.key,
                }"
              >
                <td>
                  <span class="vault-table__key"
                    ><el-icon><ElementKey /></el-icon><code>{{ row.key }}</code></span
                  >
                </td>
                <td v-for="environment in environments" :key="environment.code">
                  <div
                    v-if="editingKey === row.key"
                    class="vault-table__edit-value"
                    :class="{ 'has-visibility-action': environment.isCheckPerm }"
                  >
                    <el-input
                      v-model="keyForm.values[environment.code]"
                      class="vault-table__edit-input"
                      :type="isSecretValueVisible(row.key, environment.code) ? 'text' : 'password'"
                      :disabled="keySubmitting"
                      :aria-label="`编辑${environment.name}环境值`"
                    />
                    <span class="vault-table__edit-value-actions">
                      <el-tooltip
                        v-if="environment.isCheckPerm"
                        :content="
                          isSecretValueVisible(row.key, environment.code) ? '隐藏值' : '显示值'
                        "
                        placement="top"
                      >
                        <button
                          type="button"
                          :disabled="keySubmitting"
                          :aria-label="`${isSecretValueVisible(row.key, environment.code) ? '隐藏' : '显示'}当前密钥的${environment.name}环境值`"
                          @click="toggleSecretValueVisibility(row.key, environment.code)"
                        >
                          <el-icon>
                            <View v-if="isSecretValueVisible(row.key, environment.code)" />
                            <Hide v-else />
                          </el-icon>
                        </button>
                      </el-tooltip>
                      <el-tooltip content="展开编辑" placement="top">
                        <button
                          type="button"
                          :disabled="keySubmitting"
                          :aria-label="`展开编辑${environment.name}环境值`"
                          @click="openExpandedKeyEdit"
                        >
                          <el-icon><Maximize2 :stroke-width="1.8" /></el-icon>
                        </button>
                      </el-tooltip>
                    </span>
                  </div>
                  <span v-else class="vault-table__value">
                    <el-tooltip
                      placement="top"
                      :show-after="250"
                      :disabled="!isEnvironmentVisible(environment.code) || !row[environment.code]"
                      popper-class="vault-secret-value-tooltip"
                    >
                      <template #content>
                        <code
                          class="vault-secret-value-tooltip__content"
                          v-text="
                            isEnvironmentVisible(environment.code) ? row[environment.code] : ''
                          "
                        ></code>
                      </template>
                      <code
                        class="vault-table__value-code"
                        v-text="displayValue(row, environment.code)"
                      ></code>
                    </el-tooltip>
                    <span class="vault-table__value-actions">
                      <button
                        type="button"
                        aria-label="复制"
                        :disabled="!row[environment.code]"
                        @click="copyValue(row[environment.code] || '')"
                      >
                        <el-icon><CopyDocument /></el-icon>
                      </button>
                    </span>
                  </span>
                </td>
                <td class="vault-table__comment">
                  <el-input
                    v-if="editingKey === row.key"
                    v-model="keyForm.remark"
                    class="vault-table__edit-input"
                    maxlength="256"
                    :disabled="keySubmitting"
                    aria-label="编辑密钥说明"
                  />
                  <template v-else>{{ row.comment || '—' }}</template>
                </td>
                <td class="vault-table__operations">
                  <template v-if="editingKey === row.key">
                    <el-input
                      v-model="keyForm.commitMsg"
                      class="vault-table__commit-input"
                      :class="{ 'is-error': commitMsgInvalid }"
                      placeholder="请填写版本修改信息"
                      clearable
                      required
                      :disabled="keySubmitting"
                      aria-label="版本修改信息"
                      aria-required="true"
                      @input="commitMsgInvalid = false"
                      @keyup.enter="updateKey"
                    >
                      <template #prefix>
                        <span class="vault-table__commit-required" aria-hidden="true">*</span>
                      </template>
                    </el-input>
                    <el-tooltip content="保存" placement="top">
                      <button
                        type="button"
                        class="is-success"
                        :disabled="keySubmitting"
                        aria-label="保存修改"
                        @click="updateKey"
                      >
                        <el-icon :class="{ 'is-loading': keySubmitting }">
                          <Loading v-if="keySubmitting" />
                          <Check v-else />
                        </el-icon>
                      </button>
                    </el-tooltip>
                    <el-tooltip content="取消" placement="top">
                      <button
                        type="button"
                        :disabled="keySubmitting"
                        aria-label="取消编辑"
                        @click="cancelKeyEdit"
                      >
                        <el-icon><Close /></el-icon>
                      </button>
                    </el-tooltip>
                  </template>
                  <template v-else>
                    <el-tooltip content="编辑" placement="top">
                      <button
                        type="button"
                        class="vault-edit-action"
                        :disabled="
                          !!editingKey || keySubmitting || !!deletingKey || !!historyLoadingKey
                        "
                        aria-label="编辑密钥"
                        @click="editKey(row)"
                      >
                        <el-icon><Edit /></el-icon>
                      </button>
                    </el-tooltip>
                    <el-tooltip
                      :content="expandedHistoryKey === row.key ? '收起历史版本' : '历史版本'"
                      placement="top"
                    >
                      <button
                        type="button"
                        class="is-history"
                        :class="{ 'is-active': expandedHistoryKey === row.key }"
                        :disabled="
                          !!editingKey || keySubmitting || !!deletingKey || !!historyLoadingKey
                        "
                        aria-label="查看密钥历史版本"
                        :aria-expanded="expandedHistoryKey === row.key"
                        @click="openKeyHistory(row)"
                      >
                        <el-icon :class="{ 'is-loading': historyLoadingKey === row.key }">
                          <Loading v-if="historyLoadingKey === row.key" />
                          <History v-else :stroke-width="1.8" />
                        </el-icon>
                      </button>
                    </el-tooltip>
                    <el-tooltip content="删除" placement="top">
                      <button
                        type="button"
                        class="is-danger vault-delete-action"
                        :disabled="
                          !!editingKey || keySubmitting || !!deletingKey || !!historyLoadingKey
                        "
                        aria-label="删除密钥"
                        @click="deleteKey(row)"
                      >
                        <el-icon :class="{ 'is-loading': deletingKey === row.key }">
                          <Loading v-if="deletingKey === row.key" />
                          <Delete v-else />
                        </el-icon>
                      </button>
                    </el-tooltip>
                  </template>
                </td>
              </tr>

              <tr
                v-if="expandedHistoryKey === row.key && historyLoadingKey === row.key"
                class="vault-table__history-state-row"
              >
                <td :colspan="secretTableColumnCount">
                  <div
                    v-loading="true"
                    element-loading-text="正在加载历史版本..."
                    class="vault-table__history-state"
                  ></div>
                </td>
              </tr>
              <tr
                v-else-if="expandedHistoryKey === row.key && historyLoadFailedKey === row.key"
                class="vault-table__history-state-row"
              >
                <td :colspan="secretTableColumnCount">
                  <div class="vault-table__history-state is-error">
                    <span>历史版本加载失败</span>
                    <el-button type="primary" link @click="loadKeyHistory(row)">重新加载</el-button>
                  </div>
                </td>
              </tr>
              <tr
                v-else-if="expandedHistoryKey === row.key && !historyRows.length"
                class="vault-table__history-state-row"
              >
                <td :colspan="secretTableColumnCount">
                  <div class="vault-table__history-state">暂无历史版本</div>
                </td>
              </tr>
              <template v-else-if="expandedHistoryKey === row.key">
                <tr
                  v-for="(historyRow, historyRowIndex) in historyRows"
                  :key="historyRow.id"
                  class="vault-table__history-row"
                  :class="{
                    'is-window-first': historyRow.isWindowFirst,
                    'is-window-last': historyRow.isWindowLast,
                  }"
                >
                  <td class="vault-table__history-time-cell">
                    <time v-if="historyRow.isWindowFirst">{{ historyRow.timeWindow }}</time>
                  </td>
                  <td
                    v-for="environment in environments"
                    :key="environment.code"
                    class="vault-table__history-value-cell"
                  >
                    <button
                      v-if="historyItem(historyRow, environment.code)"
                      type="button"
                      class="vault-table__history-value"
                      :aria-label="`查看${row.key}在${environment.name}环境的 v${historyItem(historyRow, environment.code)?.version} 版本详情`"
                      @click="openHistoryVersionDetail(row, historyRow, environment)"
                    >
                      <span
                        class="vault-table__history-version vault-version-tag"
                        :class="`is-${environment.code}`"
                      >
                        v{{ historyItem(historyRow, environment.code)?.version }}
                      </span>
                      <el-tooltip
                        placement="top"
                        :show-after="250"
                        :disabled="
                          !isEnvironmentVisible(environment.code) ||
                          !historyItem(historyRow, environment.code)?.value
                        "
                        popper-class="vault-secret-value-tooltip"
                      >
                        <template #content>
                          <code
                            class="vault-secret-value-tooltip__content"
                            v-text="historyItem(historyRow, environment.code)?.value"
                          ></code>
                        </template>
                        <code
                          class="vault-table__history-value-code"
                          v-text="displayHistoryValue(historyRow, environment.code)"
                        ></code>
                      </el-tooltip>
                    </button>
                  </td>
                  <td aria-hidden="true"></td>
                  <td class="vault-table__history-load-more-cell">
                    <el-tooltip
                      v-if="historyRowIndex === historyRows.length - 1 && historyHasMore"
                      :content="historyLoadingMore ? '正在加载下一页' : '加载下一页'"
                      placement="top"
                    >
                      <button
                        type="button"
                        class="vault-table__history-load-more"
                        :disabled="historyLoadingMore"
                        aria-label="加载下一页历史版本"
                        @click="loadMoreKeyHistory(row)"
                      >
                        <el-icon :class="{ 'is-loading': historyLoadingMore }">
                          <Loading v-if="historyLoadingMore" />
                          <ArrowDown v-else />
                        </el-icon>
                      </button>
                    </el-tooltip>
                  </td>
                </tr>
              </template>
            </template>
          </tbody>
        </table>
        <div v-else-if="!secretLoading" class="vault-empty">
          <el-icon><ElementKey /></el-icon>
          <strong v-if="secretLoadFailed">密钥加载失败</strong>
          <strong v-else>暂无密钥</strong>
          <el-button v-if="secretLoadFailed" type="primary" link @click="reloadActiveSecrets">
            重新加载
          </el-button>
        </div>
      </div>
    </template>

    <CardEditDialog
      v-model="folderEditDialogVisible"
      title="编辑配置目录"
      :name="editingFolder?.name ?? ''"
      :remark="editingFolder?.remark ?? ''"
      :submitting="folderEditSubmitting"
      @submit="submitFolderEdit"
    />

    <el-dialog
      v-model="historyDetailVisible"
      width="980px"
      class="vault-history-detail-dialog"
      :close-on-click-modal="false"
      destroy-on-close
      align-center
      @closed="resetHistoryVersionDetail"
    >
      <template #header>
        <div class="vault-history-detail-dialog__heading">历史版本</div>
      </template>

      <div v-if="historyVersionSelection" class="vault-history-detail-dialog__body">
        <div class="vault-history-detail-dialog__tabs" role="tablist" aria-label="历史版本详情">
          <button
            type="button"
            role="tab"
            :class="{ 'is-active': historyDetailTab === 'version' }"
            :aria-selected="historyDetailTab === 'version'"
            @click="switchHistoryDetailTab('version')"
          >
            版本详情
          </button>
          <button
            type="button"
            role="tab"
            :class="{ 'is-active': historyDetailTab === 'batch' }"
            :aria-selected="historyDetailTab === 'batch'"
            @click="switchHistoryDetailTab('batch')"
          >
            批次详情
            <el-icon v-if="historyBatchLoading" class="is-loading"><Loading /></el-icon>
          </button>
        </div>

        <section
          v-show="historyDetailTab === 'version'"
          class="vault-history-detail-dialog__version"
          role="tabpanel"
        >
          <div class="vault-history-detail-dialog__summary">
            <div class="vault-history-detail-dialog__version-title">
              <el-icon><History /></el-icon>
              <strong>{{ historyVersionSelection.key }}</strong>
              <span
                class="vault-version-tag"
                :class="`is-${historyVersionSelection.environment.code}`"
              >
                v{{ historyVersionSelection.item.version }}
              </span>
            </div>
            <span class="vault-history-detail-dialog__environment">
              <span class="vault-env" :class="`is-${historyVersionSelection.environment.code}`">
                {{ historyVersionSelection.environment.code.toUpperCase() }}
              </span>
              <strong>{{ historyVersionSelection.environment.name }}</strong>
            </span>
          </div>

          <div class="vault-history-detail-dialog__value-section">
            <div class="vault-history-detail-dialog__section-head">
              <strong>环境值</strong>
              <span class="vault-history-detail-dialog__value-actions">
                <el-tooltip
                  v-if="historyVersionSelection.environment.isCheckPerm"
                  :content="historyDetailValueVisible ? '隐藏值' : '显示值'"
                  placement="top"
                >
                  <button
                    type="button"
                    :aria-label="historyDetailValueVisible ? '隐藏版本值' : '显示版本值'"
                    @click="historyDetailValueVisible = !historyDetailValueVisible"
                  >
                    <el-icon><View v-if="historyDetailValueVisible" /><Hide v-else /></el-icon>
                  </button>
                </el-tooltip>
                <el-tooltip content="复制值" placement="top">
                  <button
                    type="button"
                    aria-label="复制版本值"
                    @click="copyValue(historyVersionSelection.item.value)"
                  >
                    <el-icon><CopyDocument /></el-icon>
                  </button>
                </el-tooltip>
              </span>
            </div>
            <code
              class="vault-history-detail-dialog__value"
              v-text="
                displayHistoryDetailValue(
                  historyVersionSelection.item.value,
                  historyDetailValueVisible,
                )
              "
            ></code>
          </div>

          <dl class="vault-history-detail-dialog__metadata">
            <div>
              <dt>说明</dt>
              <dd>{{ historyVersionSelection.remark || '—' }}</dd>
            </div>
            <div>
              <dt>版本修改信息</dt>
              <dd>{{ historyVersionSelection.item.commitMsg || '—' }}</dd>
            </div>
            <div>
              <dt>修改人</dt>
              <dd>
                {{
                  historyVersionSelection.item.createByName ||
                  historyVersionSelection.item.createBy ||
                  '—'
                }}
              </dd>
            </div>
            <div>
              <dt>修改时间</dt>
              <dd>{{ formatDateTime(historyVersionSelection.item.createAt) || '—' }}</dd>
            </div>
            <div>
              <dt>批次 ID</dt>
              <dd>
                <code>{{ historyVersionSelection.item.batchId || '—' }}</code>
              </dd>
            </div>
            <div>
              <dt>版本 ID</dt>
              <dd>
                <code>{{ historyVersionSelection.item.id || '—' }}</code>
              </dd>
            </div>
          </dl>
        </section>

        <section
          v-show="historyDetailTab === 'batch'"
          v-loading="historyBatchLoading"
          element-loading-text="正在加载批次详情..."
          class="vault-history-detail-dialog__batch"
          role="tabpanel"
        >
          <div v-if="historyBatchLoadFailed" class="vault-history-detail-dialog__state is-error">
            <span>批次详情加载失败</span>
            <el-button type="primary" link @click="loadHistoryBatchDetails">重新加载</el-button>
          </div>
          <div
            v-else-if="!historyBatchLoading && !historyBatchDetails.length"
            class="vault-history-detail-dialog__state"
          >
            暂无批次详情
          </div>
          <div v-else class="vault-history-detail-dialog__batch-list">
            <section
              v-for="detail in historyBatchDetails"
              :key="`${detail.groupId}:${detail.key}`"
              class="vault-history-detail-dialog__batch-secret"
            >
              <header>
                <span>
                  <el-icon><ElementKey /></el-icon>
                  <code>{{ detail.key }}</code>
                </span>
                <p>{{ detail.remark || '暂无说明' }}</p>
              </header>
              <div class="vault-history-detail-dialog__table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>环境</th>
                      <th>版本</th>
                      <th>环境值</th>
                      <th>版本修改信息</th>
                      <th>修改人</th>
                      <th>修改时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="entry in batchVersionEntries(detail)" :key="entry.item.id">
                      <td>
                        <span class="vault-history-detail-dialog__environment">
                          <span class="vault-env" :class="`is-${entry.environment.code}`">
                            {{ entry.environment.code.toUpperCase() }}
                          </span>
                          <strong>{{ entry.environment.name }}</strong>
                        </span>
                      </td>
                      <td>
                        <span
                          class="vault-history-detail-dialog__version-tag vault-version-tag"
                          :class="`is-${entry.environment.code}`"
                        >
                          v{{ entry.item.version }}
                        </span>
                      </td>
                      <td class="vault-history-detail-dialog__batch-value-cell">
                        <div class="vault-history-detail-dialog__batch-value">
                          <el-tooltip
                            placement="top"
                            :show-after="250"
                            :disabled="!isHistoryBatchValueVisible(entry) || !entry.item.value"
                            popper-class="vault-secret-value-tooltip"
                          >
                            <template #content>
                              <code
                                class="vault-secret-value-tooltip__content"
                                v-text="entry.item.value"
                              ></code>
                            </template>
                            <code
                              v-text="
                                displayHistoryDetailValue(
                                  entry.item.value,
                                  isHistoryBatchValueVisible(entry),
                                )
                              "
                            ></code>
                          </el-tooltip>
                          <span class="vault-history-detail-dialog__value-actions">
                            <el-tooltip
                              v-if="entry.environment.isCheckPerm"
                              :content="isHistoryBatchValueVisible(entry) ? '隐藏值' : '显示值'"
                              placement="top"
                            >
                              <button
                                type="button"
                                :aria-label="`${isHistoryBatchValueVisible(entry) ? '隐藏' : '显示'}${entry.environment.name}环境值`"
                                @click="toggleHistoryBatchValue(entry)"
                              >
                                <el-icon>
                                  <View v-if="isHistoryBatchValueVisible(entry)" />
                                  <Hide v-else />
                                </el-icon>
                              </button>
                            </el-tooltip>
                            <el-tooltip content="复制值" placement="top">
                              <button
                                type="button"
                                :aria-label="`复制${entry.environment.name}环境值`"
                                @click="copyValue(entry.item.value)"
                              >
                                <el-icon><CopyDocument /></el-icon>
                              </button>
                            </el-tooltip>
                          </span>
                        </div>
                      </td>
                      <td>{{ entry.item.commitMsg || '—' }}</td>
                      <td>{{ entry.item.createByName || entry.item.createBy || '—' }}</td>
                      <td>{{ formatDateTime(entry.item.createAt) || '—' }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </section>
      </div>

      <template #footer>
        <el-button type="primary" @click="historyDetailVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="keyDialogVisible"
      width="1500px"
      class="vault-key-dialog"
      :close-on-click-modal="false"
      :close-on-press-escape="!keySubmitting"
      :show-close="!keySubmitting"
      align-center
      @closed="persistKeyDialogDraft"
    >
      <template #header>
        <div class="vault-dialog-title">
          <span>添加密钥</span>
        </div>
      </template>

      <div v-if="activeFolder" class="vault-key-context">
        <span class="vault-key-context__label">所属项目 / 配置集</span>
        <div class="vault-key-context__fields">
          <div class="vault-key-context__item">
            <strong>{{ selectedProject.name }}</strong>
          </div>
          <el-icon class="vault-key-context__arrow"><ArrowRight /></el-icon>
          <div class="vault-key-context__item">
            <strong>{{ activeServiceGroup?.name ?? activeFolder.name }}</strong>
          </div>
        </div>
      </div>

      <div class="vault-key-batch">
        <div class="vault-key-batch__toolbar">
          <div>
            <strong>密钥列表</strong>
          </div>
          <el-button
            class="vault-key-add-row"
            :disabled="keySubmitting"
            :icon="Plus"
            @click="addKeyDraftRow"
          >
            添加一行
          </el-button>
        </div>

        <div class="vault-key-table-scroll">
          <div class="vault-key-table" :style="{ '--vault-key-env-count': environments.length }">
            <div class="vault-key-table__row vault-key-table__row--head">
              <span>密钥名称</span>
              <span v-for="environment in environments" :key="environment.code">
                <span class="vault-key-table__env-title">
                  <span class="vault-env" :class="`is-${environment.code}`">
                    {{ environment.code.toUpperCase() }}
                  </span>
                  {{ environment.name }}
                </span>
              </span>
              <span>说明</span>
              <span>操作</span>
            </div>
            <div v-for="(row, index) in keyDraftRows" :key="row.id" class="vault-key-table__row">
              <el-input
                v-model="row.key"
                class="vault-key-table__key-input"
                placeholder="如 DB_HOST"
                autocomplete="off"
                :aria-label="`第 ${index + 1} 行密钥名称`"
              />
              <el-input
                v-for="environment in environments"
                :key="environment.code"
                v-model="row.values[environment.code]"
                :type="environment.isCheckPerm ? 'password' : 'text'"
                :show-password="environment.isCheckPerm"
                :placeholder="`请输入${environment.name}值`"
                :aria-label="`${environment.name}环境值,第 ${index + 1} 行`"
              />
              <el-input
                v-model="row.remark"
                placeholder="可选说明"
                :aria-label="`第 ${index + 1} 行说明`"
              />
              <el-tooltip content="删除此行" placement="top">
                <button
                  type="button"
                  class="vault-key-table__remove vault-delete-action"
                  :disabled="keySubmitting || keyDraftRows.length <= 1"
                  :aria-label="`删除第 ${index + 1} 行`"
                  @click="removeKeyDraftRow(index)"
                >
                  <el-icon><Delete /></el-icon>
                </button>
              </el-tooltip>
            </div>
          </div>
        </div>
      </div>

      <template #footer>
        <el-button :disabled="keySubmitting" @click="keyDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="keySubmitting" @click="createKeys">
          创建 {{ keyDraftRows.length }} 条
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="expandedKeyEditVisible"
      width="960px"
      class="vault-secret-edit-dialog"
      :close-on-click-modal="false"
      :close-on-press-escape="!keySubmitting"
      :show-close="!keySubmitting"
      align-center
    >
      <template #header>
        <div class="vault-secret-edit-dialog__title">
          <el-icon><ElementKey /></el-icon>
          <strong>{{ editingKey }}</strong>
        </div>
      </template>

      <div class="vault-secret-edit-dialog__body">
        <div class="vault-secret-edit-dialog__environment-list">
          <div
            v-for="environment in environments"
            :key="environment.id || environment.code"
            class="vault-secret-edit-dialog__environment-row"
          >
            <div class="vault-secret-edit-dialog__environment-meta">
              <span class="vault-secret-edit-dialog__environment-name">
                <span class="vault-env" :class="`is-${environment.code}`">
                  {{ environment.code.toUpperCase() }}
                </span>
                <strong>{{ environment.name }}</strong>
              </span>
              <el-tooltip
                :content="isSecretValueVisible(editingKey, environment.code) ? '隐藏值' : '显示值'"
                placement="top"
              >
                <button
                  type="button"
                  class="vault-secret-edit-dialog__visibility"
                  :disabled="keySubmitting"
                  :aria-label="`${isSecretValueVisible(editingKey, environment.code) ? '隐藏' : '显示'}当前密钥的${environment.name}环境值`"
                  @click="toggleSecretValueVisibility(editingKey, environment.code)"
                >
                  <el-icon>
                    <View v-if="isSecretValueVisible(editingKey, environment.code)" />
                    <Hide v-else />
                  </el-icon>
                </button>
              </el-tooltip>
            </div>
            <el-input
              v-model="keyForm.values[environment.code]"
              type="textarea"
              :rows="3"
              resize="vertical"
              class="vault-secret-edit-dialog__value-input"
              :class="{ 'is-masked': !isSecretValueVisible(editingKey, environment.code) }"
              :disabled="keySubmitting"
              :aria-label="`编辑${environment.name}环境值`"
            />
          </div>
        </div>

        <div class="vault-secret-edit-dialog__field">
          <label>备注信息</label>
          <el-input
            v-model="keyForm.remark"
            type="textarea"
            :rows="3"
            resize="vertical"
            maxlength="256"
            show-word-limit
            :disabled="keySubmitting"
            aria-label="编辑密钥备注信息"
          />
        </div>
      </div>

      <template #footer>
        <div class="vault-secret-edit-dialog__footer">
          <div class="vault-secret-edit-dialog__commit">
            <label>
              版本修改信息
              <span aria-hidden="true">*</span>
            </label>
            <el-input
              v-model="keyForm.commitMsg"
              :class="{ 'is-error': commitMsgInvalid }"
              placeholder="请填写版本修改信息"
              clearable
              required
              :disabled="keySubmitting"
              aria-label="版本修改信息"
              aria-required="true"
              @input="commitMsgInvalid = false"
              @keyup.enter="updateKey"
            />
          </div>
          <div class="vault-secret-edit-dialog__actions">
            <el-button :disabled="keySubmitting" @click="expandedKeyEditVisible = false">
              收起
            </el-button>
            <el-button type="primary" :loading="keySubmitting" @click="updateKey">
              提交更新
            </el-button>
          </div>
        </div>
      </template>
    </el-dialog>

    <el-dialog
      v-model="createFolderDialogVisible"
      width="760px"
      class="vault-create-folder-dialog"
      :close-on-click-modal="false"
      :close-on-press-escape="!createFolderSubmitting"
      :show-close="!createFolderSubmitting"
      align-center
      @closed="onCreateFolderClosed"
    >
      <template #header>
        <div class="vault-dialog-title">
          <span>新建文件夹</span>
        </div>
      </template>

      <div class="vault-create-folder-dialog__scroll">
        <el-form
          ref="createFolderFormRef"
          :model="createFolderForm"
          :rules="createFolderRules"
          label-position="top"
          require-asterisk-position="right"
        >
          <el-form-item label="所属组织 / 项目" prop="projectId">
            <div class="vault-create-folder-relation">
              <el-select
                v-model="createFolderForm.organizationId"
                placeholder="请选择组织"
                filterable
                :disabled="!!createFolderParent"
                @change="onCreateFolderOrganizationChange"
              >
                <el-option
                  v-for="organization in organizations"
                  :key="organization.id"
                  :label="organization.name"
                  :value="organization.id"
                />
              </el-select>
              <el-icon class="vault-create-folder-relation__arrow"><ArrowRight /></el-icon>
              <el-select
                v-model="createFolderForm.projectId"
                :placeholder="createFolderForm.organizationId ? '请选择项目' : '请先选择组织'"
                filterable
                :disabled="!createFolderForm.organizationId || !!createFolderParent"
              >
                <el-option
                  v-for="project in createFolderProjects"
                  :key="project.id"
                  :label="project.name"
                  :value="project.id"
                />
              </el-select>
            </div>
          </el-form-item>
          <el-form-item v-if="createFolderParent" label="上级目录">
            <el-input :model-value="createFolderParent.name" disabled />
          </el-form-item>
          <el-form-item label="Code" prop="code">
            <el-input
              v-model="createFolderForm.code"
              placeholder="文件夹唯一标识，如 customer-prod"
            />
          </el-form-item>
          <el-form-item label="名称" prop="name">
            <el-input v-model="createFolderForm.name" placeholder="文件夹显示名称" />
          </el-form-item>
          <el-form-item label="管理员" prop="managerId">
            <ManagerSelect
              v-model="createFolderForm.managerId"
              :disabled="createFolderSubmitting"
            />
          </el-form-item>
          <el-form-item label="备注" prop="remark">
            <el-input
              v-model="createFolderForm.remark"
              type="textarea"
              :rows="3"
              placeholder="可选，描述该文件夹的用途"
            />
          </el-form-item>
          <el-form-item label="类型" prop="type">
            <div class="vault-folder-type-options" role="radiogroup" aria-label="文件夹类型">
              <button
                type="button"
                class="vault-folder-type-option"
                :class="{ 'is-selected': createFolderForm.type === 'common' }"
                role="radio"
                :aria-checked="createFolderForm.type === 'common'"
                @click="selectCreateFolderType('common')"
              >
                <span class="vault-folder-type-option__indicator" aria-hidden="true"></span>
                <span>通用</span>
              </button>
              <button
                type="button"
                class="vault-folder-type-option"
                :class="{ 'is-selected': createFolderForm.type === 'customer' }"
                role="radio"
                :aria-checked="createFolderForm.type === 'customer'"
                @click="selectCreateFolderType('customer')"
              >
                <span class="vault-folder-type-option__indicator" aria-hidden="true"></span>
                <span>用户</span>
              </button>
            </div>
          </el-form-item>
        </el-form>
      </div>

      <template #footer>
        <el-button :disabled="createFolderSubmitting" @click="createFolderDialogVisible = false">
          取消
        </el-button>
        <el-button type="primary" :loading="createFolderSubmitting" @click="createFolder">
          创建
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style lang="scss" scoped>
.vault-page {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  color: var(--v-text-primary);

  &__toolbar,
  &__detail-head,
  &__detail-toolbar {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: space-between;
    min-width: 0;
    background: var(--v-surface-bg);
    border-bottom: 1px solid var(--v-divider);
  }

  &__toolbar {
    min-height: 60px;
    padding: 0 24px;
  }

  &__cascade {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    max-width: min(650px, 62vw);
    height: 36px;
    padding: 0 12px;
    border: 1px solid var(--v-surface-border);
    border-radius: 9px;
    background: var(--v-surface-bg);
    color: var(--v-text-secondary);
    font: inherit;
    font-size: 13px;
    cursor: pointer;
    box-shadow: none;

    strong {
      color: var(--v-text-primary);
      font-weight: 600;
      white-space: nowrap;
    }
  }

  &__chevron {
    color: var(--v-text-tertiary);
    font-size: 12px;
  }

  &__cascade-down {
    margin-left: 1px;
    transform: rotate(90deg);
    color: var(--v-text-tertiary);
    font-size: 11px;
  }

  &__toolbar-actions,
  &__detail-meta {
    display: flex;
    align-items: center;
  }

  &__toolbar-actions {
    gap: 10px;
  }

  &__add-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-width: 112px;
    height: 32px;
    padding: 0 14px;
    border: 0;
    border-radius: 8px;
    background: #2563eb;
    box-shadow: 0 4px 10px rgba(37, 99, 235, 0.18);
    color: #fff;
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    line-height: 1;
    cursor: pointer;
    transition:
      background 0.15s ease,
      box-shadow 0.15s ease,
      transform 0.15s ease;

    &:hover {
      background: #1d4ed8;
      box-shadow: 0 5px 12px rgba(37, 99, 235, 0.25);
    }

    &:active {
      transform: translateY(1px);
    }

    &:disabled {
      background: #93b4f4;
      box-shadow: none;
      cursor: not-allowed;
    }

    .el-icon {
      font-size: 15px;
    }
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

  &__content {
    flex: 1;
    min-height: 0;
    padding: 20px 24px 28px;
    overflow: auto;
    background: var(--v-app-bg);

    &.is-folder-list {
      overflow-x: hidden;
    }
  }

  &__detail-head {
    justify-content: flex-start;
    gap: 8px;
    min-height: 46px;
    padding: 0 22px;
    color: var(--v-text-tertiary);
    font-size: 13px;

    > button:not(.vault-page__back) {
      max-width: 220px;
      padding: 0;
      overflow: hidden;
      border: 0;
      background: transparent;
      color: var(--v-text-secondary);
      font: inherit;
      text-overflow: ellipsis;
      white-space: nowrap;
      cursor: pointer;

      &:hover {
        color: #2563eb;
      }
    }

    > .el-icon {
      flex: 0 0 auto;
      font-size: 11px;
    }

    strong {
      overflow: hidden;
      color: var(--v-text-primary);
      font-weight: 600;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  &__back {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: var(--v-text-secondary);
    cursor: pointer;

    &:hover {
      background: var(--v-surface-row-hover);
      color: var(--v-text-primary);
    }
  }

  &__detail-toolbar {
    min-height: 55px;
    padding: 0 22px;
    background: var(--v-app-bg);
  }

  &__detail-meta {
    gap: 10px;
    color: var(--v-text-secondary);
    font-size: 13px;
  }

  &__folder-code {
    display: inline-flex;
    min-width: 0;
    align-items: center;

    > span {
      flex: 0 0 auto;
    }

    button {
      display: inline-flex;
      min-width: 0;
      align-items: center;
      gap: 5px;
      padding: 0;
      border: 0;
      background: transparent;
      color: var(--v-text-primary);
      cursor: pointer;
      font: inherit;

      &:hover,
      &:focus-visible {
        color: rgb(23, 93, 251);
        outline: none;
      }

      &:disabled {
        color: var(--v-text-tertiary);
        cursor: default;
      }

      .el-icon {
        flex: 0 0 auto;
        font-size: 13px;
      }
    }

    code {
      overflow: hidden;
      color: inherit;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-weight: 600;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
}

.vault-round-action {
  display: inline-flex;
  width: 32px;
  height: 32px;
  flex: 0 0 32px;
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
    border-color: #f59e0b;
    background: rgba(245, 158, 11, 0.08);
    color: #f59e0b;
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

  &:disabled,
  &.is-disabled {
    cursor: not-allowed;
    opacity: 0.48;
  }

  .el-icon {
    font-size: 16px;
  }
}

.vault-create-folder-dialog__scroll {
  max-height: calc(90vh - 121px);
  min-height: 0;
  padding: 18px 22px 20px;
  overflow-y: auto;
}

.vault-dialog-title {
  display: flex;
  align-items: center;
  min-height: 28px;
  color: var(--v-text-primary);
  font-size: 18px;
  font-weight: 700;
  line-height: 1.4;
}

.vault-key-dialog {
  --el-dialog-border-radius: var(--v-radius-dialog);
  --el-dialog-padding-primary: 0;
  width: min(1500px, calc(100vw - 32px)) !important;
  max-width: calc(100vw - 32px);
  max-height: 90vh;
  margin: auto;
  padding: 0;
  border: 1px solid var(--v-surface-border);
  border-radius: var(--v-radius-dialog) !important;
  overflow: hidden;
  background: var(--v-surface-bg);
  box-shadow: var(--v-shadow-lg);

  :deep(.el-dialog__header) {
    min-height: 56px;
    margin-right: 0;
    padding: 0 22px;
    display: flex;
    align-items: center;
    border-bottom: 1px solid var(--v-divider);
  }

  :deep(.el-dialog__headerbtn) {
    top: 10px;
    right: 13px;
    width: 36px;
    height: 36px;
    border-radius: 9px;

    &:hover {
      background: var(--v-surface-bg-subtle);
    }
  }

  :deep(.el-dialog__close) {
    color: var(--v-text-tertiary);
    font-size: 18px;
  }

  :deep(.el-dialog__body) {
    min-height: 0;
    padding: 18px 22px 20px;
    overflow: hidden;
  }

  :deep(.el-dialog__footer) {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
    padding: 14px 22px;
    background: var(--v-surface-bg);
    border-top: 1px solid var(--v-divider);
  }

  :deep(.el-button) {
    min-width: 58px;
    height: 32px;
    margin-left: 0;
    padding: 0 16px;
    border-radius: var(--v-radius-dialog-action);
    font-size: 13px;
    font-weight: 600;

    &.el-button--primary {
      border-color: rgb(23, 93, 251);
      background: rgb(23, 93, 251);
      box-shadow: 0 3px 8px rgba(23, 93, 251, 0.24);

      &:hover,
      &:focus-visible {
        border-color: rgb(18, 76, 214);
        background: rgb(18, 76, 214);
      }
    }
  }

  :deep(.el-form-item) {
    margin-bottom: 16px;
  }

  :deep(.el-form-item__label) {
    height: auto;
    margin-bottom: 7px;
    color: var(--v-text-primary);
    font-size: 13px;
    font-weight: 600;
    line-height: 1.4;
  }

  :deep(.el-input__wrapper) {
    min-height: 36px;
    border-radius: 9px !important;
    background: var(--v-surface-bg-subtle);
    box-shadow: 0 0 0 1px var(--v-surface-border) inset;
  }

  :deep(.el-textarea__inner) {
    min-height: 72px !important;
    padding: 10px 12px;
    border-radius: 9px;
    background: var(--v-surface-bg-subtle);
    box-shadow: 0 0 0 1px var(--v-surface-border) inset;
    resize: vertical;
  }
}

.vault-key-context {
  width: 50%;
  min-width: 0;
  margin-bottom: 16px;

  &__fields {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 18px minmax(0, 1fr);
    align-items: center;
    gap: 10px;
    width: 100%;
  }

  &__item {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    min-width: 0;
    height: 36px;
    padding: 0 12px;
    border: 1px solid var(--v-surface-border);
    border-radius: 9px;
    background: var(--v-surface-bg-subtle);
  }

  &__label {
    display: block;
    margin-bottom: 7px;
    color: var(--v-text-primary);
    font-size: 13px;
    font-weight: 600;
    line-height: 1.4;
  }

  &__item strong {
    display: block;
    width: 100%;
    min-width: 0;
    color: var(--v-text-primary);
    font-family: inherit;
    font-size: 13px;
    font-weight: 600;
    line-height: 1.4;
  }

  &__arrow {
    flex: 0 0 auto;
    color: var(--v-text-tertiary);
    font-size: 14px;
  }

  strong {
    overflow: hidden;
    color: var(--v-text-primary);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.vault-key-context__arrow {
  align-self: center;
}

.vault-key-context__item strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vault-key-batch {
  min-width: 0;

  &__toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 10px;

    > div {
      display: flex;
      align-items: baseline;
      gap: 10px;
      min-width: 0;
    }

    strong {
      color: var(--v-text-primary);
      font-size: 14px;
      font-weight: 600;
    }

    .el-button {
      flex: 0 0 auto;
    }

    :deep(.vault-key-add-row) {
      height: 32px;
      margin-left: 0;
      padding: 0 16px;
      border-color: rgb(23, 93, 251);
      border-radius: var(--v-radius-dialog-action) !important;
      color: rgb(23, 93, 251);
      font-size: 13px;
      font-weight: 600;

      &:hover,
      &:focus-visible {
        border-color: rgb(18, 76, 214);
        background: rgba(23, 93, 251, 0.06);
        color: rgb(18, 76, 214);
      }
    }
  }
}

.vault-key-table-scroll {
  max-height: min(52vh, 480px);
  overflow: auto;
  border: 1px solid var(--v-surface-border);
  border-radius: 9px;
}

.vault-key-table {
  --vault-key-env-count: 4;
  min-width: max-content;
  background: var(--v-surface-bg);

  &__row {
    display: grid;
    grid-template-columns:
      minmax(190px, 1.1fr) repeat(var(--vault-key-env-count), minmax(180px, 1fr))
      minmax(240px, 1.2fr) 44px;
    align-items: center;
    gap: 8px;
    min-height: 58px;
    padding: 8px 10px;
    border-top: 1px solid var(--v-divider);

    &:first-child {
      border-top: 0;
    }

    &--head {
      position: sticky;
      z-index: 1;
      top: 0;
      min-height: 44px;
      padding-top: 6px;
      padding-bottom: 6px;
      border-top: 0;
      background: var(--v-surface-bg-subtle);
      color: var(--v-text-secondary);
      font-size: 12px;
      font-weight: 600;
    }

    > .el-input {
      min-width: 0;
    }

    :deep(.el-input__wrapper) {
      min-height: 36px;
      border-radius: 9px !important;
      background: var(--v-surface-bg-subtle);
      box-shadow: 0 0 0 1px var(--v-surface-border) inset;
    }
  }

  &__env-title {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
  }

  &__remove {
    display: inline-flex;
    width: 30px;
    height: 30px;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: #ef4444;
    cursor: pointer;

    &:hover:not(:disabled) {
      background: rgba(220, 38, 38, 0.08);
      color: #ef4444;
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.35;
    }
  }
}

.vault-create-folder-relation {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 18px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  width: 100%;

  .el-select {
    width: 100%;
  }

  &__arrow {
    color: var(--v-text-tertiary);
    font-size: 14px;
  }
}

.vault-folder-type-options {
  display: flex;
  align-items: center;
  gap: 18px;
}

.vault-folder-type-option {
  display: inline-flex;
  width: auto;
  height: 24px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--v-text-secondary);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  transition: color 0.15s ease;

  &:hover:not(:disabled) {
    color: rgb(23, 93, 251);

    .vault-folder-type-option__indicator {
      border-color: rgb(23, 93, 251);
    }
  }

  &.is-selected {
    color: rgb(23, 93, 251);

    .vault-folder-type-option__indicator {
      border-color: rgb(23, 93, 251);

      &::after {
        background: rgb(23, 93, 251);
      }
    }
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.42;
  }

  &__indicator {
    position: relative;
    display: inline-flex;
    width: 16px;
    height: 16px;
    flex: 0 0 16px;
    align-items: center;
    justify-content: center;
    border: 1.5px solid var(--v-surface-border);
    border-radius: 50%;
    background: var(--v-surface-bg);
    transition: border-color 0.15s ease;

    &::after {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: transparent;
      content: '';
    }
  }
}

.vault-folder-list {
  width: 100%;
  min-width: 0;
}

.vault-folder-scroll {
  width: 100%;
  padding-bottom: 4px;
  overflow-x: auto;
}

.vault-folders {
  display: flex;
  align-items: stretch;
  width: max-content;
  min-width: 100%;
  gap: 14px;
}

.vault-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 45px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--v-divider);

  > span {
    color: var(--v-text-secondary);
    font-size: 12px;
  }
}

.vault-folder {
  display: flex;
  width: 252px;
  min-width: 252px;
  height: 183px;
  min-height: 183px;
  flex: 0 0 252px;
  flex-direction: column;
  padding: 16px 16px 0;
  border: 1px solid var(--v-surface-border);
  border-radius: 16px;
  background: var(--v-surface-bg);
  box-shadow: none;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    transform 0.15s ease;

  &:hover,
  &:focus-visible {
    border-color: var(--el-color-primary-light-5);
    box-shadow: var(--v-shadow-md);
    outline: none;
    transform: translateY(-1px);

    .vault-folder__favorite:not(.is-active) {
      opacity: 1;
    }
  }

  &__top,
  &__labels,
  &__owner,
  footer {
    display: flex;
    align-items: center;
  }

  &__top {
    justify-content: space-between;
    margin-bottom: 12px;
  }

  &__labels {
    gap: 7px;
  }

  &__icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    font-size: 18px;

    &.is-customer {
      background: #eff6ff;
      color: #2563eb;
    }

    &.is-global {
      background: #ecfdf5;
      color: #059669;
    }

    &.is-common {
      background: #f0f9ff;
      color: #0284c7;
    }

    &.is-groups {
      background: #faf5ff;
      color: #9333ea;
    }

    &.is-unknown {
      background: var(--v-surface-bg-subtle);
      color: var(--v-text-tertiary);
    }
  }

  &__tag {
    display: inline-flex;
    align-items: center;
    height: 22px;
    padding: 0 8px;
    border: 1px solid;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;

    &.is-customer {
      border-color: #bfdbfe;
      background: #eff6ff;
      color: #2563eb;
    }

    &.is-global {
      border-color: #a7f3d0;
      background: #ecfdf5;
      color: #059669;
    }

    &.is-common {
      border-color: #bae6fd;
      background: #f0f9ff;
      color: #0284c7;
    }

    &.is-groups {
      border-color: #ddd6fe;
      background: #f5f3ff;
      color: #7c3aed;
    }

    &.is-unknown {
      border-color: var(--v-divider);
      background: var(--v-surface-bg-subtle);
      color: var(--v-text-secondary);
    }
  }

  &__favorite {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: 0;
    background: transparent;
    color: #94a3b8;
    cursor: pointer;
    transition:
      color 0.15s ease,
      transform 0.15s ease;

    &:hover {
      color: #f59e0b;
      transform: scale(1.08);
    }

    &.is-active {
      opacity: 1;
      color: #f59e0b;
    }
  }

  &__edit,
  &__delete {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: #176dfb;
    cursor: pointer;
    transition: background 0.15s ease;

    &:disabled {
      cursor: not-allowed;
      opacity: 0.4;
    }
  }

  &__edit {
    color: #176dfb;

    &:hover:not(:disabled),
    &:focus-visible:not(:disabled) {
      background: rgba(23, 109, 251, 0.08);
      outline: none;
    }
  }

  &__delete {
    color: var(--v-color-danger);

    &:hover:not(:disabled),
    &:focus-visible:not(:disabled) {
      background: rgba(220, 38, 38, 0.08);
      color: var(--v-color-danger);
      outline: none;
    }
  }

  h2 {
    margin: 0 0 7px;
    overflow: hidden;
    color: var(--v-text-primary);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 14px;
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  p {
    display: -webkit-box;
    min-height: 36px;
    margin: 0 0 12px;
    overflow: hidden;
    color: var(--v-text-secondary);
    font-size: 11.5px;
    line-height: 1.55;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  footer {
    min-height: 44px;
    justify-content: space-between;
    margin-top: auto;
    border-top: 1px solid var(--v-divider);
    color: var(--v-text-secondary);
    font-size: 10px;
  }

  &__owner {
    gap: 6px;
  }

  &__avatar {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    color: #fff;
    font-size: 9px;
    font-weight: 650;
  }
}

.vault-empty {
  display: flex;
  min-height: 260px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--v-text-tertiary);

  > .el-icon {
    font-size: 38px;
  }

  strong {
    color: var(--v-text-secondary);
    font-size: 14px;
  }

  button {
    padding: 0;
    border: 0;
    background: transparent;
    color: #2563eb;
    cursor: pointer;
  }
}

.vault-table-wrap {
  flex: 1;
  min-height: 0;
  overflow: auto;
  background: var(--v-surface-bg);
}

.vault-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;

  &__column--key {
    width: 230px;
  }

  &__column--environment {
    width: 220px;
  }

  &__column--comment {
    width: 220px;
  }

  &__column--operations {
    width: 120px;
  }

  th,
  td {
    height: 46px;
    padding: 0 22px;
    border-bottom: 1px solid var(--v-divider);
    text-align: left;
    vertical-align: middle;
  }

  th {
    height: 39px;
    background: var(--v-surface-bg-subtle);
    color: var(--v-text-secondary);
    font-size: 12px;
    font-weight: 600;
  }

  td {
    color: var(--v-text-primary);
    font-size: 13px;
  }

  tbody tr:hover {
    background: var(--v-surface-bg-subtle);

    .vault-table__value-actions {
      opacity: 1;
    }
  }

  tbody tr.is-editing {
    background: var(--el-color-primary-light-9);
  }

  tbody tr.is-history-expanded td {
    border-bottom: 0;
  }

  &__history-state-row {
    td {
      height: auto;
      padding: 0;
      border-top: 1px dashed var(--v-surface-border);
      border-bottom: 1px dashed var(--v-surface-border);
      background: var(--v-surface-bg-subtle);
    }
  }

  &__history-state {
    display: flex;
    min-height: 76px;
    align-items: center;
    justify-content: center;
    gap: 6px;
    color: var(--v-text-tertiary);
    font-size: 12px;

    &.is-error {
      color: var(--v-text-secondary);
    }
  }

  &__history-row {
    background: var(--v-surface-bg-subtle);

    td {
      height: 42px;
      padding-top: 7px;
      padding-bottom: 7px;
      border-bottom: 0;
    }

    td.vault-table__history-value-cell {
      border-bottom: 1px solid var(--v-divider);
    }

    &.is-window-first td {
      padding-top: 12px;
    }

    &.is-window-first td:is(.vault-table__history-time-cell, .vault-table__history-value-cell) {
      border-top: 1px solid var(--v-divider);
    }

    &.is-window-last td {
      padding-bottom: 12px;
    }

    &.is-window-last td.vault-table__history-value-cell {
      border-bottom: 1px solid var(--v-divider);
    }

    &:hover {
      background: var(--v-surface-row-hover);
    }
  }

  &__history-time-cell {
    vertical-align: top !important;

    time {
      display: block;
      margin-left: 21px;
      color: var(--v-text-secondary);
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 11px;
      font-weight: 600;
      line-height: 20px;
      white-space: nowrap;
    }
  }

  &__history-value-cell {
    vertical-align: top !important;
  }

  &__history-load-more-cell {
    vertical-align: bottom !important;
  }

  &__history-load-more {
    width: 28px;
    height: 28px;
    margin-left: auto;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(23, 109, 251, 0.22);
    border-radius: 50%;
    background: var(--v-surface-bg);
    color: #176dfb;
    cursor: pointer;

    &:hover:not(:disabled),
    &:focus-visible {
      border-color: #176dfb;
      background: rgba(23, 109, 251, 0.08);
      outline: none;
    }

    &:disabled {
      cursor: wait;
      opacity: 0.65;
    }
  }

  &__history-value {
    width: 100%;
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 7px;
    padding: 2px 4px;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: inherit;
    font: inherit;
    line-height: 20px;
    text-align: left;
    cursor: pointer;

    &:hover,
    &:focus-visible {
      background: rgba(23, 109, 251, 0.07);
      outline: none;

      .vault-table__history-value-code {
        color: #176dfb;
      }
    }
  }

  &__history-version {
    display: inline-flex;
    height: 18px;
    flex: 0 0 auto;
    align-items: center;
    padding: 0 5px;
    border: 1px solid var(--vault-version-tag-border, var(--v-surface-border));
    border-radius: 4px;
    background: var(--vault-version-tag-bg, var(--v-surface-bg));
    color: var(--vault-version-tag-color, var(--v-text-tertiary));
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 10px;
  }

  &__history-value-code {
    display: block;
    min-width: 0;
    overflow: hidden;
    color: var(--v-text-secondary);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 12px;
    letter-spacing: 0;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__key,
  &__value,
  &__value-actions,
  &__operations {
    display: flex;
    align-items: center;
  }

  &__key {
    min-width: 0;
    gap: 8px;

    .el-icon {
      flex: 0 0 auto;
      color: var(--v-text-secondary);
      transform: rotate(-35deg);
    }

    code {
      overflow: hidden;
      color: var(--v-text-primary);
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 13px;
      font-weight: 600;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  &__value {
    min-width: 0;
    justify-content: space-between;
    gap: 8px;

    &-code {
      display: block;
      min-width: 0;
      overflow: hidden;
      color: var(--v-text-secondary);
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 13px;
      letter-spacing: 0;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  &__comment {
    color: var(--v-text-secondary);
    font-size: 12px;
  }

  &__edit-input {
    width: 100%;

    :deep(.el-input__wrapper) {
      min-height: 34px;
      border-radius: 7px;
      background: var(--v-surface-bg);
      box-shadow: 0 0 0 1px var(--v-surface-border) inset;

      &.is-focus {
        box-shadow: 0 0 0 1px var(--el-color-primary) inset;
      }
    }
  }

  &__edit-value {
    position: relative;
    min-width: 0;

    .vault-table__edit-input :deep(.el-input__wrapper) {
      padding-right: 38px;
    }

    &.has-visibility-action .vault-table__edit-input :deep(.el-input__wrapper) {
      padding-right: 66px;
    }
  }

  &__edit-value-actions {
    position: absolute;
    top: 4px;
    right: 5px;
    z-index: 1;
    display: inline-flex;
    align-items: center;
    gap: 1px;

    button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 26px;
      height: 26px;
      padding: 0;
      border: 0;
      border-radius: 5px;
      background: transparent;
      color: #176dfb;
      cursor: pointer;

      &:hover:not(:disabled) {
        background: rgba(23, 109, 251, 0.08);
      }

      &:disabled {
        cursor: not-allowed;
        opacity: 0.4;
      }

      .el-icon {
        font-size: 14px;
      }
    }
  }

  &__env-heading {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 4px;
  }

  &__env-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__env-visibility {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    flex: 0 0 24px;
    padding: 0;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: var(--v-text-secondary);
    cursor: pointer;

    &:hover {
      background: var(--v-surface-row-hover);
      color: rgb(23, 93, 251);
    }
  }

  &__value-actions {
    flex: 0 0 auto;
    gap: 1px;
    opacity: 0;
    transition: opacity 0.15s ease;

    button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 25px;
      height: 25px;
      padding: 0;
      border: 0;
      border-radius: 5px;
      background: transparent;
      color: var(--v-text-secondary);
      cursor: pointer;

      &:hover {
        background: var(--v-surface-row-hover);
        color: #2563eb;
      }

      &:disabled {
        cursor: not-allowed;
        opacity: 0.35;
      }
    }
  }

  &__operations {
    gap: 6px;

    .vault-table__commit-input {
      min-width: 0;
      flex: 1 1 260px;

      :deep(.el-input__wrapper) {
        min-height: 34px;
        border-radius: 7px;
        background: var(--v-surface-bg);
        box-shadow: 0 0 0 1px var(--v-surface-border) inset;

        &.is-focus {
          box-shadow: 0 0 0 1px var(--el-color-primary) inset;
        }
      }

      &.is-error :deep(.el-input__wrapper) {
        box-shadow: 0 0 0 1px var(--el-color-danger) inset;
      }
    }

    .vault-table__commit-required {
      color: var(--el-color-danger);
      font-size: 14px;
      line-height: 1;
    }

    button {
      display: inline-flex;
      width: 30px;
      height: 30px;
      align-items: center;
      justify-content: center;
      padding: 0;
      border: 1px solid transparent;
      border-radius: 6px;
      background: transparent;
      color: var(--v-text-secondary);
      cursor: pointer;
      transition:
        color 0.15s ease,
        border-color 0.15s ease,
        background 0.15s ease;

      .el-icon {
        display: inline-flex;
        font-size: 16px;
      }

      &:hover:not(:disabled) {
        border-color: var(--el-color-primary-light-7);
        background: var(--el-color-primary-light-9);
        color: var(--el-color-primary);
      }

      &:disabled {
        cursor: not-allowed;
        opacity: 0.4;
      }

      &.is-success {
        color: var(--el-color-success);

        &:hover:not(:disabled) {
          border-color: var(--el-color-success-light-7);
          background: var(--el-color-success-light-9);
          color: var(--el-color-success-dark-2);
        }
      }

      &.is-history {
        color: #d97706;

        .el-icon,
        :deep(svg) {
          color: #d97706;
        }

        &:hover:not(:disabled) {
          border-color: rgba(217, 119, 6, 0.24);
          background: rgba(217, 119, 6, 0.08);
          color: #d97706;
        }

        &.is-active {
          border-color: rgba(217, 119, 6, 0.28);
          background: rgba(217, 119, 6, 0.1);
        }
      }

      &.is-danger {
        color: #ef4444;

        &:hover:not(:disabled) {
          border-color: var(--el-color-danger-light-7);
          background: var(--el-color-danger-light-9);
          color: #ef4444;
        }
      }
    }
  }
}

.vault-env {
  display: inline-flex;
  align-items: center;
  height: 20px;
  margin-right: 5px;
  padding: 0 6px;
  border-radius: 4px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 10px;

  &.is-dev {
    background: #ecfeff;
    color: #0891b2;
  }

  &.is-test {
    background: #fffbeb;
    color: #d97706;
  }

  &.is-sim {
    background: #f5f3ff;
    color: #7c3aed;
  }

  &.is-prod {
    background: #fff1f2;
    color: #ef4444;
  }
}

.vault-version-tag {
  box-sizing: border-box;
  border: 1px solid transparent;

  &.is-dev {
    --vault-version-tag-border: #a5f3fc;
    --vault-version-tag-bg: #ecfeff;
    --vault-version-tag-color: #0891b2;
    border-color: #a5f3fc;
    background: #ecfeff;
    color: #0891b2;
  }

  &.is-test {
    --vault-version-tag-border: #fde68a;
    --vault-version-tag-bg: #fffbeb;
    --vault-version-tag-color: #d97706;
    border-color: #fde68a;
    background: #fffbeb;
    color: #d97706;
  }

  &.is-sim {
    --vault-version-tag-border: #ddd6fe;
    --vault-version-tag-bg: #f5f3ff;
    --vault-version-tag-color: #7c3aed;
    border-color: #ddd6fe;
    background: #f5f3ff;
    color: #7c3aed;
  }

  &.is-prod {
    --vault-version-tag-border: #fecdd3;
    --vault-version-tag-bg: #fff1f2;
    --vault-version-tag-color: #ef4444;
    border-color: #fecdd3;
    background: #fff1f2;
    color: #ef4444;
  }
}

.vault-groups {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 320px));
  justify-content: start;
  gap: 14px;

  article {
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr) auto 52px;
    align-items: center;
    gap: 12px;
    min-height: 100px;
    padding: 16px;
    border: 1px solid var(--v-surface-border);
    border-radius: 12px;
    background: var(--v-surface-bg);
    color: var(--v-text-secondary);
    cursor: pointer;

    &:hover,
    &:focus-visible {
      border-color: #c4b5fd;
      box-shadow: var(--v-shadow-md);
      outline: none;
    }

    h2 {
      margin: 0 0 5px;
      overflow: hidden;
      color: var(--v-text-primary);
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 14px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    p {
      display: -webkit-box;
      overflow: hidden;
      margin: 0;
      color: var(--v-text-secondary);
      font-size: 12px;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      line-height: 1.5;
    }

    > span:not(.vault-folder__icon) {
      font-size: 12px;
      white-space: nowrap;
    }
  }

  &__actions {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
    color: var(--v-text-tertiary);
  }

  &__edit,
  &__delete {
    width: 26px;
    height: 26px;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 0;
    border-radius: 50%;
    background: transparent;
    cursor: pointer;

    &:disabled {
      cursor: not-allowed;
      opacity: 0.4;
    }
  }

  &__edit {
    color: #176dfb;

    &:hover:not(:disabled),
    &:focus-visible:not(:disabled) {
      background: rgba(23, 109, 251, 0.08);
      outline: none;
    }
  }

  &__delete {
    color: var(--v-color-danger);

    &:hover:not(:disabled),
    &:focus-visible:not(:disabled) {
      background: rgba(220, 38, 38, 0.08);
      color: var(--v-color-danger);
      outline: none;
    }
  }
}

:global(.vault-secret-value-tooltip.el-popper) {
  max-width: min(520px, calc(100vw - 32px));
}

:global(.vault-secret-value-tooltip .vault-secret-value-tooltip__content) {
  display: block;
  max-height: 280px;
  overflow: auto;
  color: inherit;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  line-height: 1.55;
  overflow-wrap: anywhere;
  user-select: text;
  white-space: pre-wrap;
}

:global(.vault-cascade-popper.el-popper) {
  padding: 10px 0 8px;
  border: 1px solid var(--v-surface-border);
  border-radius: 8px;
  background: var(--v-surface-bg);
  box-shadow: var(--v-shadow-md);
}

.vault-cascade {
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

  &__tabs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    border-top: 1px solid var(--v-divider);
    border-bottom: 1px solid var(--v-divider);

    button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      height: 38px;
      border: 0;
      border-bottom: 2px solid transparent;
      background: transparent;
      color: var(--v-text-secondary);
      font: inherit;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;

      &.is-active {
        border-bottom-color: #2563eb;
        color: #2563eb;
        font-weight: 600;
      }

      .el-icon {
        color: #16a34a;
      }
    }
  }

  &__list {
    max-height: 270px;
    padding: 6px 8px 0;
    overflow: auto;

    button {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      min-height: 38px;
      padding: 4px 8px;
      border: 0;
      border-radius: 5px;
      background: transparent;
      color: var(--v-text-primary);
      font: inherit;
      font-size: 13px;
      text-align: left;
      cursor: pointer;

      &:hover,
      &.is-selected {
        background: var(--v-surface-bg-subtle);
        color: var(--el-color-primary);
      }
    }
  }

  &__check {
    color: #16a34a;
  }

  &__empty {
    padding: 24px 0;
    color: var(--v-text-tertiary);
    font-size: 12px;
    text-align: center;
  }
}

@media (max-width: 600px) {
  .vault-groups {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 820px) {
  .vault-create-folder-dialog__scroll {
    padding: 16px;
  }

  .vault-create-folder-relation {
    grid-template-columns: 1fr;

    &__arrow {
      display: none;
    }
  }

  .vault-page {
    &__toolbar {
      align-items: stretch;
      flex-direction: column;
      gap: 10px;
      padding-top: 12px;
      padding-bottom: 12px;
    }

    &__toolbar-actions {
      justify-content: flex-end;
    }

    &__detail-toolbar {
      align-items: stretch;
      flex-direction: column;
      gap: 10px;
      padding-top: 12px;
      padding-bottom: 12px;
    }

    &__toolbar-actions {
      width: 100%;
    }

    &__search {
      flex: 1;
      width: auto;
    }

    &__content {
      padding: 14px 16px 22px;
    }
  }

  .vault-folders {
    width: 100%;
    min-width: 0;
    flex-direction: column;
  }

  .vault-folder-scroll {
    padding-bottom: 0;
    overflow: visible;
  }

  .vault-folder {
    width: 100%;
    min-width: 0;
    height: 183px;
    min-height: 183px;
    flex-basis: auto;
  }

  .vault-key-context {
    width: 100%;
  }
}

@media (max-width: 600px) {
  .vault-key-context {
    &__fields {
      grid-template-columns: 1fr;
    }

    &__arrow {
      display: none;
    }
  }

  .vault-page {
    &__cascade {
      width: 100%;
      max-width: none;

      strong {
        overflow: hidden;
        text-overflow: ellipsis;
      }
    }

    &__detail-head {
      padding: 0 12px;

      > button:not(.vault-page__back):first-of-type {
        display: none;
      }
    }
  }

  .vault-folder footer {
    align-items: flex-start;
    flex-direction: column;
    gap: 8px;
  }

  .vault-table__operations button {
    width: 26px;
    height: 26px;
    align-items: center;
    justify-content: center;

    .el-icon {
      display: inline-flex;
    }

    span {
      display: none;
    }
  }
}
</style>

<style lang="scss">
/* Element Plus teleports dialogs to body, so the shell/footer overrides must be global. */
.vault-key-dialog.el-dialog {
  --el-dialog-border-radius: var(--v-radius-dialog);
  --el-dialog-padding-primary: 0;
  width: 1500px !important;
  max-width: calc(100vw - 32px) !important;
  max-height: 90vh;
  margin: auto;
  padding: 0 !important;
  overflow: hidden;
  border: 1px solid var(--v-surface-border) !important;
  border-radius: var(--v-radius-dialog) !important;
  background: var(--v-surface-bg);
  box-shadow: var(--v-shadow-lg) !important;

  .el-dialog__header {
    min-height: 56px;
    margin: 0;
    padding: 0 22px;
    display: flex;
    align-items: center;
    border-bottom: 1px solid var(--v-divider);
  }

  .el-dialog__headerbtn {
    top: 10px;
    right: 13px;
    width: 36px;
    height: 36px;
    border-radius: 9px;

    &:hover {
      background: var(--v-surface-bg-subtle);
    }
  }

  .el-dialog__body {
    min-height: 0;
    padding: 18px 22px 20px;
    overflow: hidden;
  }

  .el-dialog__footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
    padding: 14px 22px;
    border-top: 1px solid var(--v-divider);
    background: var(--v-surface-bg);
  }

  .el-dialog__footer .el-button {
    min-width: 58px;
    height: 32px;
    margin-left: 0;
    padding: 0 16px;
    border-radius: var(--v-radius-dialog-action) !important;
    font-size: 13px;
    font-weight: 600;
  }

  .el-dialog__footer .el-button--primary {
    border-color: rgb(23, 93, 251) !important;
    background: rgb(23, 93, 251) !important;
    box-shadow: 0 3px 8px rgba(23, 93, 251, 0.24) !important;
    color: #fff !important;

    &:hover,
    &:focus-visible {
      border-color: rgb(18, 76, 214) !important;
      background: rgb(18, 76, 214) !important;
    }
  }

  .el-dialog__body .el-input__wrapper {
    min-height: 36px;
    border-radius: 9px !important;
    background: var(--v-surface-bg-subtle);
    box-shadow: 0 0 0 1px var(--v-surface-border) inset;
  }

  .el-dialog__body .el-textarea__inner {
    min-height: 72px !important;
    border-radius: 9px;
    background: var(--v-surface-bg-subtle);
    box-shadow: 0 0 0 1px var(--v-surface-border) inset;
  }

  .vault-key-add-row {
    height: 32px;
    margin-left: 0;
    padding: 0 16px;
    border-color: rgb(23, 93, 251) !important;
    border-radius: var(--v-radius-dialog-action) !important;
    color: rgb(23, 93, 251) !important;
    font-size: 13px;
    font-weight: 600;

    &:hover,
    &:focus-visible {
      border-color: rgb(18, 76, 214) !important;
      background: rgba(23, 93, 251, 0.06) !important;
      color: rgb(18, 76, 214) !important;
    }
  }
}

.vault-history-detail-dialog.el-dialog {
  --el-dialog-border-radius: var(--v-radius-dialog);
  --el-dialog-padding-primary: 0;
  width: 980px !important;
  max-width: calc(100vw - 32px) !important;
  max-height: 90vh;
  margin: auto;
  padding: 0 !important;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--v-surface-border) !important;
  border-radius: var(--v-radius-dialog) !important;
  background: var(--v-surface-bg);
  box-shadow: var(--v-shadow-lg) !important;

  .el-dialog__header {
    min-height: 58px;
    flex: 0 0 auto;
    margin: 0;
    padding: 0 22px;
    display: flex;
    align-items: center;
    border-bottom: 1px solid var(--v-divider);
  }

  .el-dialog__headerbtn {
    top: 11px;
    right: 13px;
    width: 36px;
    height: 36px;
    border-radius: 9px;

    &:hover {
      background: var(--v-surface-bg-subtle);
    }
  }

  .el-dialog__body {
    display: flex;
    min-height: 0;
    flex: 1 1 auto;
    padding: 0;
    overflow: hidden;
  }

  .el-dialog__footer {
    min-height: 60px;
    flex: 0 0 auto;
    padding: 14px 22px;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    border-top: 1px solid var(--v-divider);
    background: var(--v-surface-bg);
  }

  .el-dialog__footer .el-button {
    min-width: 58px;
    height: 32px;
    margin-left: 0;
    padding: 0 16px;
    border-radius: var(--v-radius-dialog-action) !important;
    font-size: 13px;
    font-weight: 600;
  }

  .el-dialog__footer .el-button--primary {
    border-color: #176dfb;
    background: #176dfb;
    color: #fff;
    box-shadow: 0 3px 8px rgba(23, 109, 251, 0.24);

    &:hover,
    &:focus-visible {
      border-color: #125bd6;
      background: #125bd6;
    }
  }

  .vault-history-detail-dialog__heading {
    color: var(--v-text-primary);
    font-size: 14px;
    font-weight: 600;
  }

  .vault-history-detail-dialog__version-title {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 10px;

    > .el-icon {
      flex: 0 0 auto;
      color: #d97706;
      font-size: 19px;
    }

    strong {
      overflow: hidden;
      color: var(--v-text-primary);
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 15px;
      font-weight: 700;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    > span {
      height: 22px;
      flex: 0 0 auto;
      padding: 0 7px;
      display: inline-flex;
      align-items: center;
      border: 1px solid var(--vault-version-tag-border, #fde68a);
      border-radius: 5px;
      background: var(--vault-version-tag-bg, #fffbeb);
      color: var(--vault-version-tag-color, #b45309);
      font-size: 11px;
      font-weight: 700;
    }
  }

  .vault-history-detail-dialog__body {
    width: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .vault-history-detail-dialog__tabs {
    min-height: 44px;
    flex: 0 0 44px;
    padding: 0 22px;
    display: flex;
    align-items: flex-end;
    gap: 24px;
    border-bottom: 1px solid var(--v-divider);
    background: var(--v-surface-bg-subtle);

    button {
      height: 44px;
      padding: 0 2px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border: 0;
      border-bottom: 2px solid transparent;
      background: transparent;
      color: var(--v-text-secondary);
      font: inherit;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;

      &:hover,
      &:focus-visible,
      &.is-active {
        color: #176dfb;
        outline: none;
      }

      &.is-active {
        border-bottom-color: #176dfb;
      }
    }
  }

  .vault-history-detail-dialog__version,
  .vault-history-detail-dialog__batch {
    min-height: 0;
    flex: 1 1 auto;
    padding: 20px 22px 24px;
    overflow-y: auto;
  }

  .vault-history-detail-dialog__summary {
    min-height: 32px;
    display: flex;
    align-items: center;
    gap: 12px;

    > .vault-history-detail-dialog__environment {
      flex: 0 0 auto;
      margin-left: auto;
    }
  }

  .vault-history-detail-dialog__environment {
    display: inline-flex;
    min-width: 0;
    align-items: center;
    gap: 8px;

    strong {
      overflow: hidden;
      color: var(--v-text-primary);
      font-size: 12px;
      font-weight: 600;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .vault-history-detail-dialog__version-tag {
    height: 22px;
    padding: 0 7px;
    display: inline-flex;
    align-items: center;
    border: 1px solid var(--vault-version-tag-border, var(--v-surface-border));
    border-radius: 5px;
    background: var(--vault-version-tag-bg, var(--v-surface-bg-subtle));
    color: var(--vault-version-tag-color, var(--v-text-secondary));
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
  }

  .vault-history-detail-dialog__value-section {
    margin-top: 16px;
    overflow: hidden;
    border: 1px solid var(--v-surface-border);
    border-radius: 8px;
    background: var(--v-surface-bg-subtle);
  }

  .vault-history-detail-dialog__section-head {
    min-height: 40px;
    padding: 0 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid var(--v-divider);

    > strong {
      color: var(--v-text-secondary);
      font-size: 12px;
      font-weight: 600;
    }
  }

  .vault-history-detail-dialog__value-actions {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 2px;

    button {
      width: 28px;
      height: 28px;
      padding: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 0;
      border-radius: 6px;
      background: transparent;
      color: #176dfb;
      cursor: pointer;

      &:hover,
      &:focus-visible {
        background: rgba(23, 109, 251, 0.08);
        outline: none;
      }
    }
  }

  .vault-history-detail-dialog__value {
    min-height: 96px;
    max-height: 240px;
    padding: 14px;
    display: block;
    overflow: auto;
    color: var(--v-text-primary);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 13px;
    line-height: 1.6;
    overflow-wrap: anywhere;
    user-select: text;
    white-space: pre-wrap;
  }

  .vault-history-detail-dialog__metadata {
    margin: 18px 0 0;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    column-gap: 28px;

    > div {
      min-width: 0;
      padding: 11px 0;
      display: grid;
      grid-template-columns: 112px minmax(0, 1fr);
      gap: 10px;
      border-bottom: 1px solid var(--v-divider);
    }

    dt,
    dd {
      min-width: 0;
      margin: 0;
      font-size: 12px;
      line-height: 1.55;
    }

    dt {
      color: var(--v-text-tertiary);
    }

    dd {
      color: var(--v-text-primary);
      overflow-wrap: anywhere;

      code {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 11px;
      }
    }
  }

  .vault-history-detail-dialog__batch {
    min-height: 340px;
  }

  .vault-history-detail-dialog__state {
    min-height: 300px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    color: var(--v-text-tertiary);
    font-size: 12px;

    &.is-error {
      color: var(--v-text-secondary);
    }
  }

  .vault-history-detail-dialog__batch-list {
    display: grid;
    gap: 14px;
  }

  .vault-history-detail-dialog__batch-secret {
    overflow: hidden;
    border: 1px solid var(--v-surface-border);
    border-radius: 8px;
    background: var(--v-surface-bg);

    > header {
      min-height: 48px;
      padding: 8px 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      border-bottom: 1px solid var(--v-divider);
      background: var(--v-surface-bg-subtle);

      > span {
        display: flex;
        min-width: 0;
        align-items: center;
        gap: 8px;

        .el-icon {
          flex: 0 0 auto;
          color: #176dfb;
          transform: rotate(-35deg);
        }

        code {
          overflow: hidden;
          color: var(--v-text-primary);
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 12px;
          font-weight: 700;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      }

      p {
        max-width: 45%;
        margin: 0;
        overflow: hidden;
        color: var(--v-text-secondary);
        font-size: 11px;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }
  }

  .vault-history-detail-dialog__table-wrap {
    overflow-x: auto;

    table {
      width: 100%;
      min-width: 920px;
      border-collapse: collapse;
      table-layout: fixed;
    }

    th,
    td {
      padding: 10px 12px;
      border-bottom: 1px solid var(--v-divider);
      color: var(--v-text-primary);
      font-size: 11px;
      line-height: 1.5;
      text-align: left;
      vertical-align: top;
    }

    th {
      background: var(--v-surface-bg-subtle);
      color: var(--v-text-tertiary);
      font-weight: 600;
    }

    th:nth-child(1) {
      width: 120px;
    }

    th:nth-child(2) {
      width: 62px;
    }

    th:nth-child(3) {
      width: 350px;
    }

    th:nth-child(4) {
      width: 140px;
    }

    th:nth-child(5) {
      width: 90px;
    }

    th:nth-child(6) {
      width: 150px;
    }

    tbody tr:last-child td {
      border-bottom: 0;
    }
  }

  .vault-history-detail-dialog__batch-value-cell {
    min-width: 0;
  }

  .vault-history-detail-dialog__batch-value {
    display: flex;
    min-width: 0;
    align-items: flex-start;
    gap: 4px;

    > code {
      display: -webkit-box;
      min-width: 0;
      flex: 1 1 auto;
      overflow: hidden;
      color: var(--v-text-primary);
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 11px;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 3;
      overflow-wrap: anywhere;
      white-space: pre-wrap;
    }

    .vault-history-detail-dialog__value-actions {
      flex: 0 0 auto;
      flex-wrap: nowrap;
      margin-top: 0;
      white-space: nowrap;
    }
  }

  @media (max-width: 700px) {
    .vault-history-detail-dialog__summary {
      align-items: flex-start;
      flex-wrap: wrap;

      > .vault-history-detail-dialog__environment {
        width: 100%;
        margin-left: 0;
      }
    }

    .vault-history-detail-dialog__metadata {
      grid-template-columns: 1fr;
    }

    .vault-history-detail-dialog__batch-secret > header {
      align-items: flex-start;
      flex-direction: column;
      gap: 5px;

      p {
        max-width: 100%;
      }
    }
  }
}

.vault-secret-edit-dialog.el-dialog {
  --el-dialog-border-radius: var(--v-radius-dialog);
  --el-dialog-padding-primary: 0;
  width: 960px !important;
  max-width: calc(100vw - 32px) !important;
  max-height: 90vh;
  margin: auto;
  padding: 0 !important;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--v-surface-border) !important;
  border-radius: var(--v-radius-dialog) !important;
  background: var(--v-surface-bg);
  box-shadow: var(--v-shadow-lg) !important;

  .el-dialog__header {
    flex: 0 0 auto;
    min-height: 58px;
    margin: 0;
    padding: 0 22px;
    display: flex;
    align-items: center;
    border-bottom: 1px solid var(--v-divider);
  }

  .el-dialog__headerbtn {
    top: 11px;
    right: 13px;
    width: 36px;
    height: 36px;
    border-radius: 9px;

    &:hover {
      background: var(--v-surface-bg-subtle);
    }
  }

  .el-dialog__body {
    display: flex;
    flex: 1 1 auto;
    min-height: 0;
    padding: 0;
    overflow: hidden;
  }

  .el-dialog__footer {
    flex: 0 0 auto;
    padding: 14px 22px;
    border-top: 1px solid var(--v-divider);
    background: var(--v-surface-bg);
  }

  .vault-secret-edit-dialog__title {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 10px;
    color: var(--v-text-primary);

    .el-icon {
      flex: 0 0 auto;
      color: #176dfb;
      font-size: 19px;
      transform: rotate(-35deg);
    }

    strong {
      overflow: hidden;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 16px;
      font-weight: 700;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .vault-secret-edit-dialog__body {
    width: 100%;
    min-height: 0;
    padding: 4px 22px 20px;
    overflow-y: auto;
  }

  .vault-secret-edit-dialog__environment-row {
    display: grid;
    grid-template-columns: 170px minmax(0, 1fr);
    align-items: start;
    gap: 18px;
    padding: 16px 0;
    border-bottom: 1px solid var(--v-divider);
  }

  .vault-secret-edit-dialog__environment-meta {
    display: flex;
    min-width: 0;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding-top: 5px;
  }

  .vault-secret-edit-dialog__environment-name {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 7px;

    strong {
      overflow: hidden;
      color: var(--v-text-primary);
      font-size: 12px;
      font-weight: 600;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .vault-secret-edit-dialog__visibility {
    width: 28px;
    height: 28px;
    flex: 0 0 28px;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--v-text-secondary);
    cursor: pointer;

    &:hover:not(:disabled) {
      background: rgba(23, 109, 251, 0.08);
      color: #176dfb;
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.4;
    }
  }

  .el-textarea__inner {
    min-height: 86px !important;
    padding: 10px 12px;
    border-radius: 9px;
    background: var(--v-surface-bg-subtle);
    color: var(--v-text-primary);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 13px;
    line-height: 1.55;
    overflow-wrap: anywhere;
    box-shadow: 0 0 0 1px var(--v-surface-border) inset;

    &:focus {
      box-shadow: 0 0 0 1px #176dfb inset;
    }
  }

  .vault-secret-edit-dialog__value-input.is-masked .el-textarea__inner {
    -webkit-text-security: disc;
  }

  .vault-secret-edit-dialog__field {
    display: grid;
    grid-template-columns: 170px minmax(0, 1fr);
    align-items: start;
    gap: 18px;
    padding-top: 18px;

    > label {
      padding-top: 8px;
      color: var(--v-text-primary);
      font-size: 12px;
      font-weight: 600;
    }
  }

  .vault-secret-edit-dialog__footer {
    width: 100%;
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 18px;
  }

  .vault-secret-edit-dialog__commit {
    display: grid;
    min-width: 0;
    flex: 1 1 auto;
    grid-template-columns: 170px minmax(0, 1fr);
    align-items: center;
    gap: 18px;
    text-align: left;

    label {
      display: block;
      margin-bottom: 0;
      color: var(--v-text-primary);
      font-size: 12px;
      font-weight: 600;

      span {
        color: #ef4444;
      }
    }

    .el-input__wrapper {
      min-height: 36px;
      border-radius: 9px;
      background: var(--v-surface-bg-subtle);
      box-shadow: 0 0 0 1px var(--v-surface-border) inset;

      &.is-focus {
        box-shadow: 0 0 0 1px #176dfb inset;
      }
    }

    .is-error .el-input__wrapper {
      box-shadow: 0 0 0 1px #ef4444 inset;
    }
  }

  .vault-secret-edit-dialog__actions {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 10px;

    .el-button {
      min-width: 72px;
      height: 36px;
      margin: 0;
      padding: 0 16px;
      border-radius: var(--v-radius-dialog-action);
      font-size: 13px;
      font-weight: 600;
    }

    .el-button--primary {
      border-color: #176dfb;
      background: #176dfb;
      color: #fff;
      box-shadow: 0 3px 8px rgba(23, 109, 251, 0.24);

      &:hover,
      &:focus-visible {
        border-color: #125bd6;
        background: #125bd6;
      }
    }
  }

  @media (max-width: 700px) {
    .vault-secret-edit-dialog__environment-row,
    .vault-secret-edit-dialog__field {
      grid-template-columns: 1fr;
      gap: 8px;
    }

    .vault-secret-edit-dialog__footer {
      align-items: stretch;
      flex-direction: column;
    }

    .vault-secret-edit-dialog__commit {
      width: 100%;
      min-width: 0;
      flex-basis: auto;
      grid-template-columns: 1fr;
      gap: 6px;
    }

    .vault-secret-edit-dialog__actions {
      justify-content: flex-end;
    }
  }
}
</style>

<style lang="scss">
.vault-create-folder-dialog.el-dialog {
  --el-dialog-border-radius: var(--v-radius-dialog);
  --el-dialog-padding-primary: 0;
  max-width: calc(100vw - 32px);
  max-height: 90vh;
  margin: auto;
  padding: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--v-surface-border);
  border-radius: var(--v-radius-dialog);
  background: var(--v-surface-bg);
  box-shadow: var(--v-shadow-lg);

  .el-dialog__header {
    display: flex;
    align-items: center;
    min-height: 56px;
    margin: 0;
    padding: 0 22px;
    border-bottom: 1px solid var(--v-divider);
  }

  .el-dialog__headerbtn {
    top: 10px;
    right: 13px;
    width: 36px;
    height: 36px;
    border-radius: 9px;

    &:hover {
      background: var(--v-surface-bg-subtle);
    }
  }

  .el-dialog__close {
    color: var(--v-text-tertiary);
    font-size: 18px;
  }

  .el-dialog__body {
    min-height: 0;
    padding: 0;
    overflow: hidden;
    color: var(--v-text-primary);
  }

  .el-dialog__footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
    padding: 14px 22px;
    border-top: 1px solid var(--v-divider);
    background: var(--v-surface-bg);
  }

  .el-button {
    min-width: 58px;
    height: 32px;
    margin-left: 0;
    padding: 0 16px;
    border-radius: var(--v-radius-dialog-action);
    font-size: 13px;
    font-weight: 600;

    &.el-button--primary {
      border-color: rgb(23, 93, 251);
      background: rgb(23, 93, 251);
      box-shadow: 0 3px 8px rgba(23, 93, 251, 0.24);

      &:hover,
      &:focus-visible {
        border-color: rgb(18, 76, 214);
        background: rgb(18, 76, 214);
      }
    }
  }

  .el-form-item {
    margin-bottom: 16px;

    &:last-child {
      margin-bottom: 0;
    }
  }

  .el-form-item__label {
    height: auto;
    margin-bottom: 7px;
    color: var(--v-text-primary);
    font-size: 13px;
    font-weight: 600;
    line-height: 1.4;
  }

  .el-input__wrapper,
  .el-select__wrapper {
    min-height: 36px;
    border-radius: 9px;
    background: var(--v-surface-bg-subtle);
    box-shadow: 0 0 0 1px var(--v-surface-border) inset;
  }

  .el-textarea__inner {
    min-height: 72px !important;
    padding: 10px 12px;
    border-radius: 9px;
    background: var(--v-surface-bg-subtle);
    box-shadow: 0 0 0 1px var(--v-surface-border) inset;
    resize: vertical;
  }

  .vault-dialog-title {
    min-height: 20px;
    font-size: 14px;
  }
}
</style>
