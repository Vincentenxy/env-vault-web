<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, type Component, watch } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { FolderOpen, Globe, KeyRound } from '@lucide/vue'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CopyDocument,
  Delete,
  Edit,
  FolderOpened,
  Hide,
  Key as ElementKey,
  OfficeBuilding,
  Plus,
  Search,
  Star,
  StarFilled,
  View,
} from '@element-plus/icons-vue'
import { copyToClipboard } from '@/utils/copy'
import { listEnvironments } from '@/api/env'
import { getOrganizationsWithProjects } from '@/api/organization'
import { createSecretFolder, listProjectFolders } from '@/api/folder'
import {
  listSecretsByFolderGroup,
  updateFolderGroupSecrets,
  type FolderGroupSecret,
} from '@/api/secret'
import { ApiError } from '@/types/api'
import type { Folder } from '@/types/folder'

type FolderType = 'customer' | 'global' | 'groups' | 'common' | 'unknown'
type CreateFolderType = 'common' | 'customer'
type CascadeLevel = 'organization' | 'project'
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
  code: string
  name: string
  isCheckPerm: boolean
}

interface ServiceGroup {
  id: string
  name: string
  description: string
  count: number
}

const organizations = ref<OrganizationOption[]>([])
const projects = ref<ProjectOption[]>([])
const folders = ref<VaultFolder[]>([])
const secretRows = reactive<Record<string, SecretRow[]>>({})
const secretRowMeta = reactive<Record<string, Record<string, SecretRowMeta>>>({})
const serviceGroups: ServiceGroup[] = []
const groupRows = reactive<Record<string, SecretRow[]>>({})

const selectedOrgId = ref('')
const selectedProjectId = ref('')
const cascadeLevel = ref<CascadeLevel>('organization')
const cascadeSearch = ref('')
const cascadeOpen = ref(false)
const folderListSearch = ref('')
const folderSearch = ref('')
const favoriteOnly = ref(false)
const folderPage = ref(1)
const folderPageSize = 6
const folderTotal = ref(0)
const scopeLoading = ref(false)
const folderLoading = ref(false)
const folderLoadFailed = ref(false)
const secretLoading = ref(false)
const secretLoadFailed = ref(false)
const defaultEnvironments: VaultEnvironment[] = [
  { code: 'dev', name: '开发环境', isCheckPerm: false },
  { code: 'test', name: '测试环境', isCheckPerm: false },
  { code: 'sim', name: '仿真环境', isCheckPerm: true },
  { code: 'prod', name: '生产环境', isCheckPerm: true },
]
const activeFolderId = ref('')
const activeGroupId = ref('')
const environments = ref<VaultEnvironment[]>(defaultEnvironments.map((item) => ({ ...item })))
const visibleEnvironments = reactive<Record<string, boolean>>({
  dev: true,
  test: true,
  sim: false,
  prod: false,
})
const keyDialogVisible = ref(false)
const keyDialogMode = ref<'create' | 'edit'>('create')
const editingKey = ref('')
const keySubmitting = ref(false)
const keyForm = reactive({ key: '', remark: '', dev: '', test: '', sim: '', prod: '' })
const createFolderDialogVisible = ref(false)
const createFolderSubmitting = ref(false)
const createFolderFormRef = ref<FormInstance>()
const createFolderForm = reactive({
  organizationId: '',
  projectId: '',
  type: 'customer' as CreateFolderType,
  code: '',
  name: '',
  remark: '',
})
const favoriteFolderIds = new Set<string>()
let folderRequestSequence = 0
let folderSearchTimer: number | undefined
const favoriteFolderStorageKey = 'env-vault:secret:favorite-folders'
let secretRequestSequence = 0

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
  return 'env-vault:secret:create-folder-draft'
}

function clearCreateFolderForm(): void {
  createFolderForm.organizationId = ''
  createFolderForm.projectId = ''
  createFolderForm.type = 'customer'
  createFolderForm.code = ''
  createFolderForm.name = ''
  createFolderForm.remark = ''
}

function isCommonFolderCode(code: string): boolean {
  const normalized = code.trim().toLowerCase()
  return normalized === 'global' || normalized === 'groups'
}

const canCreateCommonFolder = computed(() => isCommonFolderCode(createFolderForm.code))

function selectCreateFolderType(type: CreateFolderType): void {
  if (type === 'common' && !canCreateCommonFolder.value) return
  createFolderForm.type = type
  createFolderFormRef.value?.clearValidate('type')
}

function restoreCreateFolderDraft(): void {
  clearCreateFolderForm()
  createFolderForm.organizationId = selectedOrgId.value
  createFolderForm.projectId = selectedProjectId.value
  if (typeof window === 'undefined') return

  const raw = window.localStorage.getItem(createFolderDraftKey())
  if (!raw) return
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
    createFolderForm.remark = typeof value.remark === 'string' ? value.remark : ''
    const draftType = value.type === 'common' || value.type === 'customer' ? value.type : 'customer'
    createFolderForm.type =
      draftType === 'common' && canCreateCommonFolder.value ? 'common' : 'customer'
  } catch {
    window.localStorage.removeItem(createFolderDraftKey())
  }
}

function persistCreateFolderDraft(): void {
  if (typeof window === 'undefined') return
  const isEmpty = !createFolderForm.code && !createFolderForm.name && !createFolderForm.remark
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
const visibleFolders = computed(() =>
  favoriteOnly.value ? folders.value.filter((folder) => folder.favorite) : folders.value,
)
const activeRows = computed(() => {
  const rows = activeGroupId.value
    ? (groupRows[activeGroupId.value] ?? [])
    : (secretRows[activeFolderId.value] ?? [])
  const keyword = folderSearch.value.trim().toLowerCase()
  return keyword ? rows.filter((row) => row.key.toLowerCase().includes(keyword)) : rows
})
const cascadeItems = computed(() => {
  const keyword = cascadeSearch.value.trim().toLowerCase()
  const items =
    cascadeLevel.value === 'organization' ? organizations.value : availableProjects.value
  return items.filter((item) => !keyword || item.name.toLowerCase().includes(keyword))
})
const activeServiceGroup = computed(
  () => serviceGroups.find((item) => item.id === activeGroupId.value) ?? null,
)

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
  return {
    id,
    projectId,
    // 文件夹自身 id 与跨环境聚合用的 groupId 不同,查询 secret 时不能回退到 id。
    folderGroupId: firstString(raw.groupId, raw.folderGroupId, raw.folder_group_id),
    code: firstString(raw.code, raw.name) || id,
    name: firstString(raw.name, raw.code) || '未命名配置目录',
    type: inferFolderType(folder),
    description: firstString(raw.remark, raw.comment, raw.description) || '暂无目录说明',
    owner:
      firstString(raw.updatedByLabel, raw.createdByLabel, raw.ownerName, raw.owner) || '待补充',
    count: firstNumber(raw.secretCount, raw.secretsCount, raw.keyCount, raw.count),
    groups: firstNumber(raw.groupCount, raw.groupsCount),
    favorite: favoriteFolderIds.has(id),
  }
}

function resetEnvironmentVisibility(): void {
  Object.keys(visibleEnvironments).forEach((code) => {
    delete visibleEnvironments[code]
  })
  environments.value.forEach((environment) => {
    visibleEnvironments[environment.code] = !environment.isCheckPerm
  })
}

async function loadProjectEnvironments(projectId: string): Promise<void> {
  if (!projectId) {
    environments.value = defaultEnvironments.map((item) => ({ ...item }))
    resetEnvironmentVisibility()
    return
  }

  try {
    const response = await listEnvironments({ projectId, pageNum: 1, pageSize: 100 })
    const nextEnvironments = response.list
      .filter((environment) => firstString(environment.code))
      .map((environment) => ({
        code: firstString(environment.code),
        name: firstString(environment.name, environment.code),
        isCheckPerm: environment.isCheckPerm === true,
      }))
    environments.value = nextEnvironments.length
      ? nextEnvironments
      : defaultEnvironments.map((item) => ({ ...item }))
  } catch {
    // 环境接口尚未补齐时仍保留设计稿中的四列占位。
    environments.value = defaultEnvironments.map((item) => ({ ...item }))
  }
  resetEnvironmentVisibility()
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
  if (activeFolder.value) void loadSecretsForFolder(activeFolder.value)
}

async function loadFolders(): Promise<void> {
  const projectId = selectedProjectId.value
  const requestSequence = ++folderRequestSequence
  activeFolderId.value = ''
  activeGroupId.value = ''
  folderLoadFailed.value = false

  if (!projectId) {
    folders.value = []
    folderTotal.value = 0
    return
  }

  folderLoading.value = true
  try {
    const response = await listProjectFolders({
      pageNum: folderPage.value,
      pageSize: folderPageSize,
      projectId,
      code: null,
      name: folderListSearch.value.trim() || null,
    })
    if (requestSequence !== folderRequestSequence) return
    folders.value = response.list.map((folder, index) => mapFolder(folder, projectId, index))
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

function openCreateFolder(): void {
  restoreCreateFolderDraft()
  createFolderFormRef.value?.clearValidate()
  createFolderDialogVisible.value = true
}

async function createFolder(): Promise<void> {
  const valid = await createFolderFormRef.value?.validate().catch(() => false)
  if (!valid || !createFolderForm.projectId) return

  createFolderSubmitting.value = true
  try {
    const organizationId = createFolderForm.organizationId
    const projectId = createFolderForm.projectId
    await createSecretFolder({
      projectId,
      code: createFolderForm.code.trim(),
      name: createFolderForm.name.trim(),
      remark: createFolderForm.remark.trim() || undefined,
      type: createFolderForm.type,
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
    await loadFolders()
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
  activeFolderId.value = folder.id
  activeGroupId.value = ''
  folderSearch.value = ''
  void loadSecretsForFolder(folder)
}

function goBack(): void {
  if (activeGroupId.value) {
    activeGroupId.value = ''
    folderSearch.value = ''
    return
  }
  activeFolderId.value = ''
  folderSearch.value = ''
}

function closeDetail(): void {
  activeFolderId.value = ''
  activeGroupId.value = ''
}

function toggleFavorite(folder: VaultFolder): void {
  folder.favorite = !folder.favorite
  if (folder.favorite) favoriteFolderIds.add(folder.id)
  else favoriteFolderIds.delete(folder.id)
  persistFavoriteFolders()
}

function isEnvironmentVisible(code: string): boolean {
  return visibleEnvironments[code] !== false
}

function displayValue(row: SecretRow, code: string): string {
  if (!isEnvironmentVisible(code)) return '••••••••'
  return row[code] || '—'
}

function toggleEnvironmentVisibility(code: string): void {
  visibleEnvironments[code] = !isEnvironmentVisible(code)
}

async function copyValue(value: string): Promise<void> {
  const copied = await copyToClipboard(value)
  ElMessage[copied ? 'success' : 'warning'](
    copied ? '已复制到剪贴板' : '复制失败，请检查浏览器权限',
  )
}

function resetKeyForm(): void {
  keyForm.key = ''
  keyForm.remark = ''
  keyForm.dev = ''
  keyForm.test = ''
  keyForm.sim = ''
  keyForm.prod = ''
}

function openKeyDialog(): void {
  keyDialogMode.value = 'create'
  editingKey.value = ''
  resetKeyForm()
  keyDialogVisible.value = true
}

function createKey(): void {
  const key = keyForm.key.trim()
  if (!key || !activeFolder.value) {
    ElMessage.warning('请输入密钥名称')
    return
  }
  const target = activeGroupId.value
    ? (groupRows[activeGroupId.value] ??= [])
    : (secretRows[activeFolder.value.id] ??= [])
  target.push({
    key,
    comment: keyForm.remark,
    dev: keyForm.dev,
    test: keyForm.test,
    sim: keyForm.sim,
    prod: keyForm.prod,
  })
  activeFolder.value.count = (activeFolder.value.count ?? 0) + 1
  keyDialogVisible.value = false
  ElMessage.success('密钥已创建')
}

function keyFormValue(environmentCode: string): string {
  const value = keyForm[environmentCode as keyof typeof keyForm]
  return typeof value === 'string' ? value : ''
}

async function updateKey(): Promise<void> {
  const folder = activeFolder.value
  const rowKey = editingKey.value
  const metadata = folder ? secretRowMeta[folder.id]?.[rowKey] : undefined
  if (!folder || !rowKey || !metadata?.groupId) {
    ElMessage.warning('缺少密钥更新所需的 groupId')
    return
  }

  const values = Object.entries(metadata.values).map(([envCode, ids]) => ({
    secretId: ids.secretId,
    envCode,
    folderId: ids.folderId,
    value: keyFormValue(envCode),
  }))

  keySubmitting.value = true
  try {
    await updateFolderGroupSecrets({
      commitMsg: 'secret update',
      secrets: [
        {
          groupId: metadata.groupId,
          key: rowKey,
          remark: keyForm.remark,
          commitMsg: 'secret update',
          values,
        },
      ],
    })
    ElMessage.success('密钥更新成功')
    keyDialogVisible.value = false
    await loadSecretsForFolder(folder)
  } catch (error) {
    const message = error instanceof ApiError ? error.message : '密钥更新失败'
    ElMessage.error(message)
  } finally {
    keySubmitting.value = false
  }
}

function submitKey(): void {
  if (keyDialogMode.value === 'edit') {
    void updateKey()
    return
  }
  createKey()
}

function deleteKey(row: SecretRow): void {
  const target = activeGroupId.value
    ? groupRows[activeGroupId.value]
    : secretRows[activeFolderId.value]
  const index = target?.indexOf(row) ?? -1
  if (index >= 0) target?.splice(index, 1)
  if (activeFolder.value?.count && activeFolder.value.count > 0) activeFolder.value.count -= 1
  ElMessage.success('密钥已删除')
}

function editKey(row: SecretRow): void {
  const folder = activeFolder.value
  const metadata = folder ? secretRowMeta[folder.id]?.[row.key] : undefined
  if (!metadata?.groupId) {
    ElMessage.warning('当前密钥缺少 groupId，无法编辑')
    return
  }

  keyDialogMode.value = 'edit'
  editingKey.value = row.key
  keyForm.key = row.key
  keyForm.remark = row.comment
  keyForm.dev = row.dev ?? ''
  keyForm.test = row.test ?? ''
  keyForm.sim = row.sim ?? ''
  keyForm.prod = row.prod ?? ''
  keySubmitting.value = false
  keyDialogVisible.value = true
}

function onCreateFolderClosed(): void {
  createFolderFormRef.value?.clearValidate()
}

onMounted(() => {
  restoreFavoriteFolders()
  void loadScopeOptions()
})

onBeforeUnmount(() => {
  window.clearTimeout(folderSearchTimer)
})

watch(folderListSearch, () => {
  window.clearTimeout(folderSearchTimer)
  folderSearchTimer = window.setTimeout(() => {
    folderPage.value = 1
    void loadFolders()
  }, 300)
})

watch(createFolderForm, persistCreateFolderDraft, { deep: true })
watch(canCreateCommonFolder, (canCreate) => {
  if (!canCreate && createFolderForm.type === 'common') {
    createFolderForm.type = 'customer'
  }
})
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
              @click="openCreateFolder"
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
                @keydown.enter="openFolder(folder)"
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
                    >
                      <el-icon>
                        <StarFilled v-if="folder.favorite" />
                        <Star v-else />
                      </el-icon>
                    </button>
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
                  <span v-if="folder.type === 'groups'"
                    >{{ folder.groups ?? '--' }} 个分组 · {{ folder.count ?? '--' }} 个密钥</span
                  >
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
        <button v-if="activeGroupId" type="button" @click="activeGroupId = ''">
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
          <span>{{ activeRows.length }} 个密钥</span>
        </div>
        <div class="vault-page__toolbar-actions">
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
              aria-label="添加密钥"
              @click="openKeyDialog"
            >
              <el-icon><Plus /></el-icon>
            </button>
          </el-tooltip>
        </div>
      </div>

      <div v-if="activeFolder.type === 'groups' && !activeGroupId" class="vault-page__content">
        <div class="vault-groups">
          <article
            v-for="group in serviceGroups"
            :key="group.id"
            tabindex="0"
            role="button"
            @click="activeGroupId = group.id"
            @keydown.enter="activeGroupId = group.id"
          >
            <span class="vault-folder__icon is-groups"
              ><el-icon><FolderOpened /></el-icon
            ></span>
            <div>
              <h2>{{ group.name }}</h2>
              <p>{{ group.description }}</p>
            </div>
            <span>{{ group.count }} 个密钥</span>
            <el-icon><ArrowRight /></el-icon>
          </article>
        </div>
      </div>

      <div v-else v-loading="secretLoading" class="vault-table-wrap">
        <table v-if="activeRows.length" class="vault-table">
          <thead>
            <tr>
              <th>密钥名称</th>
              <th v-for="environment in environments" :key="environment.code">
                <span class="vault-table__env-heading">
                  <span class="vault-env" :class="`is-${environment.code}`">
                    {{ environment.code.toUpperCase() }}
                  </span>
                  <span>{{ environment.name }}</span>
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
            <tr v-for="row in activeRows" :key="row.key">
              <td>
                <span class="vault-table__key"
                  ><el-icon><ElementKey /></el-icon><code>{{ row.key }}</code></span
                >
              </td>
              <td v-for="environment in environments" :key="environment.code">
                <span class="vault-table__value">
                  <code>{{ displayValue(row, environment.code) }}</code>
                  <span class="vault-table__value-actions">
                    <button
                      type="button"
                      aria-label="复制"
                      :disabled="!isEnvironmentVisible(environment.code) || !row[environment.code]"
                      @click="copyValue(row[environment.code] || '')"
                    >
                      <el-icon><CopyDocument /></el-icon>
                    </button>
                  </span>
                </span>
              </td>
              <td class="vault-table__comment">{{ row.comment || '—' }}</td>
              <td class="vault-table__operations">
                <button type="button" @click="editKey(row)">
                  <el-icon><Edit /></el-icon><span>编辑</span>
                </button>
                <button type="button" class="is-danger" @click="deleteKey(row)">
                  <el-icon><Delete /></el-icon><span>删除</span>
                </button>
              </td>
            </tr>
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

    <el-dialog
      v-model="keyDialogVisible"
      width="760px"
      class="vault-key-dialog"
      :close-on-click-modal="false"
    >
      <template #header>
        <div class="vault-dialog-title">
          <span>{{ keyDialogMode === 'edit' ? '编辑密钥' : '新建密钥' }}</span>
        </div>
      </template>

      <div v-if="activeFolder" class="vault-key-context">
        <span>配置目录</span>
        <strong>{{ activeFolder.name }}</strong>
        <span class="vault-folder__tag" :class="`is-${activeFolder.type}`">
          {{ folderMeta(activeFolder.type).label }}
        </span>
      </div>

      <el-form label-position="top">
        <el-form-item label="密钥名称" required>
          <el-input
            v-model="keyForm.key"
            :disabled="keyDialogMode === 'edit'"
            placeholder="例如 database.password"
          />
        </el-form-item>
        <el-form-item label="备注">
          <el-input
            v-model="keyForm.remark"
            type="textarea"
            :rows="2"
            placeholder="可选，描述该密钥的用途"
          />
        </el-form-item>
        <div class="vault-key-env-grid">
          <el-form-item label="DEV 开发环境">
            <el-input v-model="keyForm.dev" show-password placeholder="请输入开发环境值" />
          </el-form-item>
          <el-form-item label="TEST 测试环境">
            <el-input v-model="keyForm.test" show-password placeholder="请输入测试环境值" />
          </el-form-item>
          <el-form-item label="SIM 仿真环境">
            <el-input v-model="keyForm.sim" show-password placeholder="请输入仿真环境值" />
          </el-form-item>
          <el-form-item label="PROD 生产环境">
            <el-input v-model="keyForm.prod" show-password placeholder="请输入生产环境值" />
          </el-form-item>
        </div>
      </el-form>
      <template #footer>
        <el-button :disabled="keySubmitting" @click="keyDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="keySubmitting" @click="submitKey">
          {{ keyDialogMode === 'edit' ? '保存' : '创建' }}
        </el-button>
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
                :disabled="!createFolderForm.organizationId"
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
          <el-form-item label="Code" prop="code">
            <el-input
              v-model="createFolderForm.code"
              placeholder="文件夹唯一标识，如 customer-prod"
            />
          </el-form-item>
          <el-form-item label="名称" prop="name">
            <el-input v-model="createFolderForm.name" placeholder="文件夹显示名称" />
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
                :disabled="!canCreateCommonFolder"
                title="仅 global 或 groups 文件夹可选择通用类型"
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
  --el-dialog-border-radius: 24px;
  --el-dialog-padding-primary: 0;
  border-radius: 24px;
  overflow: hidden;
  box-shadow: 0 18px 46px rgba(15, 23, 42, 0.2);

  :deep(.el-dialog__header) {
    min-height: 56px;
    margin-right: 0;
    padding: 18px 24px;
    border-bottom: 1px solid var(--v-divider);
  }

  :deep(.el-dialog__headerbtn) {
    top: 14px;
    right: 16px;
    width: 32px;
    height: 32px;
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
    padding: 22px 30px 20px;
  }

  :deep(.el-dialog__footer) {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    padding: 14px 30px;
    background: var(--v-surface-bg);
    border-top: 1px solid var(--v-divider);
  }

  :deep(.el-button) {
    min-width: 76px;
    height: 36px;
    margin-left: 0;
    border-radius: 10px;
    font-weight: 600;
  }

  :deep(.el-form-item) {
    margin-bottom: 20px;
  }

  :deep(.el-form-item__label) {
    height: auto;
    margin-bottom: 8px;
    color: var(--v-text-primary);
    font-size: 15px;
    font-weight: 600;
    line-height: 1.4;
  }

  :deep(.el-input__wrapper) {
    min-height: 44px;
    border-radius: 14px !important;
    background: #f7fafc;
    box-shadow: 0 0 0 1px #dce5ef inset;
  }

  :deep(.el-textarea__inner) {
    min-height: 72px;
    padding: 10px 12px;
    border: 0;
    border-radius: 14px;
    background: #f7fafc;
    box-shadow: 0 0 0 1px #dce5ef inset;
    resize: vertical;
  }
}

.vault-key-context {
  display: flex;
  align-items: center;
  min-height: 42px;
  gap: 8px;
  margin-bottom: 20px;
  padding: 0 14px;
  border: 1px solid #dce5ef;
  border-radius: 14px;
  background: #f7fafc;
  color: var(--v-text-secondary);
  font-size: 13px;

  strong {
    overflow: hidden;
    color: var(--v-text-primary);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .vault-folder__tag {
    margin-left: auto;
  }
}

.vault-key-env-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
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
  min-width: 1480px;
  border-collapse: collapse;
  table-layout: fixed;

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

  th:first-child,
  td:first-child {
    width: 23%;
  }

  th:nth-child(2),
  td:nth-child(2),
  th:nth-child(3),
  td:nth-child(3),
  th:nth-child(4),
  td:nth-child(4),
  th:nth-child(5),
  td:nth-child(5) {
    width: 16%;
  }

  th:nth-last-child(2),
  td:nth-last-child(2) {
    width: 12%;
  }

  th:last-child,
  td:last-child {
    width: 130px;
  }

  tbody tr:hover {
    background: var(--v-surface-bg-subtle);

    .vault-table__value-actions {
      opacity: 1;
    }
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

    > code {
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

  &__env-heading {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
  }

  &__env-visibility {
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
    gap: 10px;

    button {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 0;
      border: 0;
      background: transparent;
      color: #2563eb;
      font: inherit;
      font-size: 12px;
      cursor: pointer;

      .el-icon {
        display: none;
      }

      &.is-danger {
        color: #ef4444;
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

.vault-groups {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;

  article {
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr) auto 18px;
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
      color: var(--v-text-primary);
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 14px;
    }

    p {
      margin: 0;
      color: var(--v-text-secondary);
      font-size: 12px;
      line-height: 1.5;
    }

    > span:not(.vault-folder__icon) {
      font-size: 12px;
      white-space: nowrap;
    }
  }
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

@media (max-width: 1050px) {
  .vault-groups {
    grid-template-columns: 1fr;
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

  .vault-key-env-grid {
    grid-template-columns: 1fr;
    gap: 0;
  }
}

@media (max-width: 600px) {
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
.vault-create-folder-dialog.el-dialog {
  --el-dialog-border-radius: 16px;
  --el-dialog-padding-primary: 0;
  max-width: calc(100vw - 32px);
  max-height: 90vh;
  margin: auto;
  padding: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--v-surface-border);
  border-radius: 16px;
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
    border-radius: 16px;
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
