<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import {
  ArrowLeft,
  Check,
  CircleClose,
  Delete,
  Document,
  Edit,
  Folder as FolderIcon,
  InfoFilled,
  Key as KeyIcon,
  Plus,
  Refresh,
} from '@element-plus/icons-vue'
import { useEnvStore } from '@/stores/env'
import { useOrganizationStore } from '@/stores/organization'
import { useProjectStore } from '@/stores/project'
import { useSecretStore } from '@/stores/secret'
import { ApiError } from '@/types/api'
import { updateSecrets } from '@/api/secret'
import { withApiCall } from '@/composables/use-api-call'
import { formatDateTime } from '@/utils/format'
import { getEnvProjectId } from '@/utils/env'
import { usePermission } from '@/composables/use-permission'
import { Permission } from '@/constants/permission'
import { listProjectFolderTree, createFolder, deleteFolder, updateFolder } from '@/api/folder'
import type { Environment } from '@/types/env'
import type { FolderLevel, FolderNode } from '@/types/folder'
import type { Project } from '@/types/project'
import type {
  SecretAcrossEnvs,
  SecretAcrossEnvsEntry,
  UpdateSecretsRequest as UpdateSecretsReq,
  BatchCreateSecretsRequest,
  BatchCreateSecretValue,
} from '@/api/secret'
import ManagerSelect from '@/components/ManagerSelect.vue'
import { useManagerSelection } from '@/composables/use-manager-selection'
import {
  isValidKeyPattern,
  matchesKeyPattern,
  resolveCreateKeyPattern,
  type CreateKeyPatternMode,
  type EditKeyPatternMode,
} from '@/utils/secret-key-pattern'

const route = useRoute()
const router = useRouter()
const envStore = useEnvStore()
const orgStore = useOrganizationStore()
const projectStore = useProjectStore()
const secretStore = useSecretStore()
const { has, rbac } = usePermission()
const { resolveManagerId } = useManagerSelection()

const projectId = computed<string>(() => String(route.params.projectId ?? ''))
const orgId = computed<string>(() => String(route.query.orgId ?? ''))

// ==================== 当前项目 ====================
const project = ref<Project | null>(null)
const projectLoading = ref(false)

async function loadProject(): Promise<void> {
  if (!projectId.value || !orgId.value) return
  projectLoading.value = true
  try {
    const p = await projectStore.fetchOne({ id: projectId.value, parentId: orgId.value })
    project.value = p
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : '加载项目失败'
    ElMessage.error(msg)
  } finally {
    projectLoading.value = false
  }
}

// ==================== env 列表(只用作"列头"展示)================
const envOptions = computed<Environment[]>(() =>
  envStore.items.filter((e) => getEnvProjectId(e) === projectId.value),
)

// ==================== folder 树(由 /folder/list 组合)================
//
// 旧版本:每个 env 一棵树(treesByEnv),顶部多选 env 控制显示哪些树。
// 新版本:一次拿整个 project 下的 folder 树,每个节点带 envList,
// 客户端把它扁平化成表格(env 列上打勾),不再需要 per-env 数据。
const folderTree = ref<FolderNode[]>([])
const folderTreeLoading = ref(false)

/** 当前选中的 folder 节点(扁平表行 / 详情都看它) */
const selectedFolderNode = ref<FolderNode | null>(null)

/** 视图模式:list = 列表 + 默认折叠 L2;detail = 全屏展示详情 */
type ViewMode = 'list' | 'detail'
const viewMode = ref<ViewMode>('list')

/** L1 行展开状态 —— 默认全部折叠,点箭头展开/收起 */
const expandedRowIds = ref<Set<string>>(new Set())

function toggleRowExpand(folderId: string): void {
  if (expandedRowIds.value.has(folderId)) {
    expandedRowIds.value.delete(folderId)
  } else {
    expandedRowIds.value.add(folderId)
  }
  expandedRowIds.value = new Set(expandedRowIds.value)
}

/** 扁平化后的所有 folder 节点(L1 始终展示;L2 仅在父 L1 展开后才出现) */
interface FlatFolderRow {
  node: FolderNode
  /** 1 = L1,2 = L2 */
  depth: 1 | 2
  /** L2 的父 L1 code(展示用) */
  parentCode?: string
}
const flatFolders = computed<FlatFolderRow[]>(() => {
  const out: FlatFolderRow[] = []
  for (const l1 of folderTree.value) {
    out.push({ node: l1, depth: 1 })
    // 默认折叠:仅当 L1 在 expandedRowIds 中时,才把它的 L2 children 渲染出来
    if (expandedRowIds.value.has(l1.id)) {
      for (const l2 of l1.subFolders ?? []) {
        out.push({ node: l2, depth: 2, parentCode: l1.code })
      }
    }
  }
  return out
})

/** 按 id 在整棵 tree 里递归找节点 */
function findFolderNode(
  list: FolderNode[],
  id: string,
): { node: FolderNode; parent: FolderNode | null } | null {
  for (const n of list) {
    if (n.id === id) return { node: n, parent: null }
    if (n.subFolders?.length) {
      const r = findFolderNode(n.subFolders, id)
      if (r) return { node: r.node, parent: r.parent ?? n }
    }
  }
  return null
}

/** 拉取整个项目的 folder 树(新接口一次拿全) */
async function loadFolderTree(): Promise<void> {
  if (!projectId.value) return
  folderTreeLoading.value = true
  try {
    const resp = await listProjectFolderTree({ projectId: projectId.value })
    const bindProjectEnvironments = (nodes: FolderNode[]): FolderNode[] =>
      nodes.map((node) => ({
        ...node,
        envList: envOptions.value.map((environment) => ({
          id: environment.id,
          code: environment.code,
        })),
        subFolders: bindProjectEnvironments(node.subFolders ?? []),
      }))
    folderTree.value = bindProjectEnvironments(resp.folderList ?? [])
    // 校验:之前选中的节点如果不在新树里,清掉
    if (
      selectedFolderNode.value &&
      !findFolderNode(folderTree.value, selectedFolderNode.value.id)
    ) {
      selectedFolderNode.value = null
      activeTab.value = 'secrets'
    }
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : '加载目录失败'
    ElMessage.error(msg)
  } finally {
    folderTreeLoading.value = false
  }
}

function onTreeNodeClick(node: FolderNode): void {
  selectedFolderNode.value = node
  // 切到 info tab,展示详情;同时按需刷新 secret
  activeTab.value = 'secrets'
  viewMode.value = 'detail'
  void loadSecretsOfCurrent()
}

function onFlatRowClick(row: FlatFolderRow): void {
  selectedFolderNode.value = row.node
  activeTab.value = 'secrets'
  viewMode.value = 'detail'
  void loadSecretsOfCurrent()
}

function onBackToList(): void {
  viewMode.value = 'list'
}

function isFolderInEnv(node: FolderNode, envId: string): boolean {
  return node.envList?.some((b) => b.id === envId) ?? false
}

/** 给 detail-panel 用的面包屑:project → [L1] → [L2] */
const folderBreadcrumb = computed<Array<{ id: string; name: string; kind: 'l1' | 'l2' }>>(() => {
  if (!selectedFolderNode.value) return []
  const found = findFolderNode(folderTree.value, selectedFolderNode.value.id)
  if (!found) return []
  const out: Array<{ id: string; name: string; kind: 'l1' | 'l2' }> = []
  // 父是 L1
  if (found.parent) {
    out.push({ id: found.parent.id, name: found.parent.name, kind: 'l1' })
  }
  out.push({ id: found.node.id, name: found.node.name, kind: 'l2' })
  return out
})

/**
 * 当前选中目录的 L2 子目录列表。
 * 抽成 computed 是为了让 el-table 的 data 始终是 FolderNode[],
 * 避免因为 `selectedFolderNode.subFolders` 是 `FolderNode[] | undefined`
 * 而让 el-table 把 row 推断成 DefaultRow,从而影响 env 列的 row.node
 * 类型检查。L2 自身没有 subFolders,这里直接返回 []。
 */
const currentSubfolders = computed<FolderNode[]>(() => {
  if (!selectedFolderNode.value) return []
  return selectedFolderNode.value.subFolders ?? []
})

// ==================== Tab ====================
// 顺序:secrets → subfolders(仅 L1 可建 L2)→ info
type TabKey = 'secrets' | 'subfolders' | 'info'
const activeTab = ref<TabKey>('secrets')

// ==================== Secret 列表(走 /secret/list 接口)====================
//
// 新接口一次拿一个 key 在 4 个 env 上的值(与新增/编辑弹窗的"一行 key + 4 个
// env 输入框"视觉一致),与旧接口(单行单 env)并存,这里只用新接口。
// 离开 folder / 切 folder 时清掉旧数据,避免误显示。
const ACROSS_ENVS: string[] = ['dev', 'test', 'sim', 'prod']

async function loadSecretsOfCurrent(): Promise<void> {
  if (!selectedFolderNode.value || !projectId.value) {
    secretStore.clear()
    return
  }
  try {
    await secretStore.fetchAcrossEnvs({
      projectId: projectId.value,
      folderCode: selectedFolderNode.value.code,
      key: '', // 空 = 该 folder 下所有
      envList: ACROSS_ENVS,
    })
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : '加载密钥失败'
    ElMessage.error(msg)
  }
}

// 新接口一次性返回所有 key,不分页(后续若需要分页,这里加 pageNum/pageSize)
function onSecretPageChange(_pageNum: number, _pageSize: number): void {
  // 新接口不分页,刷新只调 fetchAcrossEnvs
  void loadSecretsOfCurrent()
}

// ==================== 创建 folder ====================
/**
 * 新的入参格式(对齐 rbac 反馈):
 *  - level=1: 不传 parentCode;envList 至少 1 项
 *  - level=2: 必传 parentCode(父 L1 folder 的 code);envList 至少 1 项
 *
 * 弹窗里所有字段都可改,点击"+ 顶级 / + 子目录"只是预填。
 * 创建成功后,所有命中的 env 树都刷新,level=2 场景下父 L1 自动展开。
 */
const createFolderDialogVisible = ref(false)
const createFolderSubmitting = ref(false)
const createFolderFormRef = ref<FormInstance>()

const createFolderForm = reactive<{
  level: FolderLevel
  envList: string[]
  parentCode: string
  code: string
  name: string
  managerId: string
  comment: string
  keyPatternMode: CreateKeyPatternMode
  customKeyPattern: string
}>({
  level: 1,
  envList: [],
  parentCode: '',
  code: '',
  name: '',
  managerId: '',
  comment: '',
  keyPatternMode: 'none',
  customKeyPattern: '',
})

const createFolderRules: FormRules<typeof createFolderForm> = {
  level: [{ required: true, message: '请选择级别', trigger: 'change' }],
  envList: [
    {
      required: true,
      validator: (_rule, value: string[], cb) => {
        if (!value || value.length === 0) cb(new Error('请至少选择一个 env'))
        else cb()
      },
      trigger: 'change',
    },
  ],
  parentCode: [
    {
      validator: (_rule, value: string, cb) => {
        if (createFolderForm.level === 2 && !value.trim()) {
          cb(new Error('level=2 时必须填写父级 code'))
        } else {
          cb()
        }
      },
      trigger: 'blur',
    },
    {
      pattern: /^[a-z0-9]+(-[a-z0-9]+)*$/,
      message: '仅小写字母、数字、中横线',
      trigger: 'blur',
    },
  ],
  code: [
    { required: true, message: '请输入 code', trigger: 'blur' },
    {
      pattern: /^[a-z0-9]+(-[a-z0-9]+)*$/,
      message: '仅小写字母、数字、中横线',
      trigger: 'blur',
    },
    { max: 32, message: '长度不能超过 32', trigger: 'blur' },
  ],
  name: [
    { required: true, message: '请输入名称', trigger: 'blur' },
    { max: 64, message: '长度不能超过 64', trigger: 'blur' },
  ],
  comment: [{ max: 256, message: '长度不能超过 256', trigger: 'blur' }],
  customKeyPattern: [
    {
      validator: (_rule, value: string, callback) => {
        if (createFolderForm.keyPatternMode !== 'custom') {
          callback()
        } else if (!value) {
          callback(new Error('请输入自定义表达式'))
        } else if (!isValidKeyPattern(value)) {
          callback(new Error('表达式格式不正确'))
        } else {
          callback()
        }
      },
      trigger: 'blur',
    },
  ],
}

const PRESET_FOLDERS: Array<{ code: string; name: string }> = [
  { code: 'globals', name: 'Globals' },
  { code: 'services', name: 'Services' },
  { code: 'infra', name: 'Infrastructure' },
]

function resetCreateFolderForm(): void {
  createFolderForm.level = 1
  createFolderForm.envList = []
  createFolderForm.parentCode = ''
  createFolderForm.code = ''
  createFolderForm.name = ''
  createFolderForm.managerId = ''
  createFolderForm.comment = ''
  createFolderForm.keyPatternMode = 'none'
  createFolderForm.customKeyPattern = ''
  createFolderFormRef.value?.clearValidate()
}

function fillFromPreset(preset: (typeof PRESET_FOLDERS)[number]): void {
  createFolderForm.code = preset.code
  createFolderForm.name = preset.name
}

/**
 * 顶级 + 按钮:envList 预填当前 project 的所有 env(L1 默认铺满)。
 * 用户在弹窗里可以删减。
 */
function openCreateRootFolder(): void {
  if (!has(Permission.FolderCreate)) {
    ElMessage.warning('当前账号没有 folder:create 权限')
    return
  }
  resetCreateFolderForm()
  createFolderForm.level = 1
  createFolderForm.envList = envOptions.value.map((e) => e.id)
  createFolderDialogVisible.value = true
}

/**
 * L1 folder 上 + 按钮:parentCode 预填该 folder.code,envList 预填该 folder 实际所在的 env。
 * 用户在弹窗里可以扩缩(典型场景:把同一个子目录同时铺到其它 env 下)。
 */
function openCreateChildFolder(parent: FolderNode): void {
  if (!has(Permission.FolderCreate)) {
    ElMessage.warning('当前账号没有 folder:create 权限')
    return
  }
  resetCreateFolderForm()
  createFolderForm.level = 2
  // parent.envList 是 FolderEnvBinding[];createFolderForm.envList 只需 env id
  createFolderForm.envList = parent.envList.map((b) => b.id)
  createFolderForm.parentCode = parent.code
  createFolderDialogVisible.value = true
}

async function onCreateFolderSubmit(): Promise<void> {
  if (!createFolderFormRef.value) return
  const valid = await createFolderFormRef.value.validate().catch(() => false)
  if (!valid) return
  createFolderSubmitting.value = true
  try {
    const managerId = await resolveManagerId(createFolderForm.managerId)
    if (!managerId) {
      ElMessage.error('无法获取当前用户，请选择管理员后重试')
      return
    }
    await createFolder({
      level: createFolderForm.level,
      code: createFolderForm.code,
      name: createFolderForm.name,
      managerId,
      envList: [...createFolderForm.envList],
      parentCode: createFolderForm.level === 2 ? createFolderForm.parentCode.trim() : undefined,
      comment: createFolderForm.comment || undefined,
      keyPattern: resolveCreateKeyPattern(
        createFolderForm.keyPatternMode,
        createFolderForm.customKeyPattern,
      ),
    })
    ElMessage.success('创建成功')
    createFolderDialogVisible.value = false
    // 新数据模型下,一次 listByProject 拿全,直接全量刷新
    await loadFolderTree()
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : '创建失败'
    ElMessage.error(msg)
  } finally {
    createFolderSubmitting.value = false
  }
}

// ==================== 删除 folder ====================
async function onDeleteFolder(folder: FolderNode): Promise<void> {
  // 函数级最后一道闸门:确认弹窗出现前先把没权限的拦截掉,免得无谓打扰用户
  if (!has(Permission.FolderDelete)) {
    ElMessage.warning('当前账号没有 folder:delete 权限')
    return
  }
  try {
    await ElMessageBox.confirm(
      `确定要删除目录 "${folder.name} (${folder.code})" 吗?\n该目录及其下所有密钥(覆盖 envList 中所有 env)都会被软删除。`,
      '删除目录',
      {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        customClass: 'vault-confirm-message-box',
        confirmButtonClass: 'vault-delete-confirm-button',
      },
    )
  } catch {
    return // 取消
  }
  if (!folder.folderGroupId) {
    ElMessage.error('当前目录缺少 groupId，无法删除')
    return
  }
  try {
    await deleteFolder({ groupId: folder.folderGroupId })
    ElMessage.success('删除成功')
    // 选中被删 → 清空
    if (selectedFolderNode.value?.id === folder.id) {
      selectedFolderNode.value = null
      activeTab.value = 'secrets'
    }
    // 全量刷新 folder 树
    await loadFolderTree()
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : '删除失败'
    ElMessage.error(msg)
  }
}

// ==================== 编辑 folder ====================
//
// code 创建后不可改(folder 在 env 下的稳定标识,改名需要走 create+delete 流程)。
// 本期允许修改 name(必填)和 comment(可清空)。
const editFolderDialogVisible = ref(false)
const editFolderSubmitting = ref(false)
const editFolderFormRef = ref<FormInstance>()

const editFolderForm = reactive<{
  groupId: string
  code: string
  name: string
  comment: string
  keyPatternMode: EditKeyPatternMode
  keyPattern: string
}>({
  groupId: '',
  code: '',
  name: '',
  comment: '',
  keyPatternMode: 'none',
  keyPattern: '',
})

const editFolderRules: FormRules<typeof editFolderForm> = {
  code: [
    { required: true, message: '缺少 code', trigger: 'change' },
    {
      pattern: /^[a-z0-9]+(-[a-z0-9]+)*$/,
      message: '仅小写字母、数字、中横线',
      trigger: 'change',
    },
  ],
  name: [
    { required: true, message: '请输入名称', trigger: 'blur' },
    { max: 64, message: '长度不能超过 64', trigger: 'blur' },
  ],
  comment: [{ max: 256, message: '长度不能超过 256', trigger: 'blur' }],
  keyPattern: [
    {
      validator: (_rule, value: string, callback) => {
        if (editFolderForm.keyPatternMode === 'none') {
          callback()
        } else if (!value) {
          callback(new Error('请输入自定义表达式'))
        } else if (!isValidKeyPattern(value)) {
          callback(new Error('表达式格式不正确'))
        } else {
          callback()
        }
      },
      trigger: 'blur',
    },
  ],
}

function resetEditFolderForm(): void {
  editFolderForm.groupId = ''
  editFolderForm.code = ''
  editFolderForm.name = ''
  editFolderForm.comment = ''
  editFolderForm.keyPatternMode = 'none'
  editFolderForm.keyPattern = ''
  editFolderFormRef.value?.clearValidate()
}

function openEditFolder(folder: FolderNode): void {
  editFolderForm.groupId = folder.folderGroupId
  editFolderForm.code = folder.code
  editFolderForm.name = folder.name
  editFolderForm.comment = folder.comment ?? ''
  editFolderForm.keyPatternMode = folder.keyPattern ? 'custom' : 'none'
  editFolderForm.keyPattern = folder.keyPattern
  editFolderFormRef.value?.clearValidate()
  editFolderDialogVisible.value = true
}

async function onEditFolderSubmit(): Promise<void> {
  if (!editFolderFormRef.value) return
  // 函数级最后一道闸门:即使 UI 状态被绕过(脚本/DOM/调试器),也拒绝提交
  if (!has(Permission.FolderUpdate)) {
    ElMessage.warning('当前账号没有 folder:update 权限')
    return
  }
  const valid = await editFolderFormRef.value.validate().catch(() => false)
  if (!valid) return
  if (!editFolderForm.groupId) {
    ElMessage.error('当前配置目录缺少 groupId，无法更新')
    return
  }
  editFolderSubmitting.value = true
  try {
    await updateFolder({
      groupId: editFolderForm.groupId,
      name: editFolderForm.name.trim(),
      remark: editFolderForm.comment.trim(),
      keyPattern: editFolderForm.keyPatternMode === 'none' ? '' : editFolderForm.keyPattern,
    })
    ElMessage.success('更新成功')
    editFolderDialogVisible.value = false
    // 全量刷新(简单可靠)
    await loadFolderTree()
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : '更新失败'
    ElMessage.error(msg)
  } finally {
    editFolderSubmitting.value = false
  }
}

// ==================== Env 排序 ====================
//
// 二级表格的 env 列排序规则:
//   - 优先使用后端返回的 SecretAcrossEnvsEntry.sortOrder 升序
//   - 没有 sortOrder 时,fallback 到前端默认顺序(dev/test/sim/prod)
const ENV_DEFAULT_ORDER: Record<string, number> = {
  dev: 0,
  test: 1,
  sim: 2,
  prod: 3,
}

/** 从 SecretAcrossEnvs row 中提取所有 env entry,按 sortOrder 或默认顺序排序 */
function getSortedEnvEntries(
  row: SecretAcrossEnvs,
): Array<{ envCode: string; entry: SecretAcrossEnvsEntry }> {
  const out: Array<{ envCode: string; entry: SecretAcrossEnvsEntry }> = []
  for (const k of Object.keys(row)) {
    if (k === 'key' || k === 'projectCode' || k === 'comment' || k === 'sortOrder') continue
    const v = row[k]
    if (v && typeof v === 'object' && 'value' in v) {
      out.push({ envCode: k, entry: v as SecretAcrossEnvsEntry })
    }
  }
  out.sort((a, b) => {
    const ao = a.entry.sortOrder ?? ENV_DEFAULT_ORDER[a.envCode] ?? 999
    const bo = b.entry.sortOrder ?? ENV_DEFAULT_ORDER[b.envCode] ?? 999
    return ao - bo
  })
  return out
}

// ==================== 行内新建 secret ====================
//
// 去掉旧版的批量创建弹窗,改为表格底部常驻新建行。
// folder 锁定为当前 selectedFolderNode,secret 创建到项目的所有 env。
const newSecretCreating = ref(false)
const newSecretSubmitting = ref(false)

const newSecretForm = reactive<{
  key: string
  comment: string
  values: Record<string, string>
}>({
  key: '',
  comment: '',
  values: {},
})

/** 当前 folder 挂载的 env codes(按 sortOrder 或默认顺序排好),新建/列表共用 */
const currentEnvCodes = computed<string[]>(() => {
  if (!selectedFolderNode.value) return []
  return selectedFolderNode.value.envList
    .map((b) => envOptions.value.find((e) => e.id === b.id)?.code)
    .filter((c): c is string => !!c)
    .sort((a, b) => {
      const ao = ENV_DEFAULT_ORDER[a] ?? 999
      const bo = ENV_DEFAULT_ORDER[b] ?? 999
      return ao - bo
    })
})

function openNewSecretRow(): void {
  if (!has(Permission.SecretCreate)) {
    ElMessage.warning('当前账号没有 secret:create 权限')
    return
  }
  if (!selectedFolderNode.value) {
    ElMessage.warning('请先选择一个目录')
    return
  }
  if (currentEnvCodes.value.length === 0) {
    ElMessage.warning('当前项目没有可用环境,无法创建 secret')
    return
  }
  const vals: Record<string, string> = {}
  for (const envCode of currentEnvCodes.value) {
    vals[envCode] = ''
  }
  newSecretForm.key = ''
  newSecretForm.comment = ''
  newSecretForm.values = vals
  newSecretCreating.value = true
}

function cancelNewSecret(): void {
  newSecretCreating.value = false
  newSecretForm.key = ''
  newSecretForm.comment = ''
  newSecretForm.values = {}
}

async function submitNewSecret(): Promise<void> {
  const k = newSecretForm.key.trim()
  if (!k) {
    ElMessage.error('key 不能为空')
    return
  }
  if (!matchesKeyPattern(k, selectedFolderNode.value?.keyPattern ?? '')) {
    ElMessage.error(`key "${k}" 不符合当前配置目录的校验表达式`)
    return
  }
  if ((newSecretForm.comment ?? '').length > 256) {
    ElMessage.error('说明长度不能超过 256')
    return
  }
  for (const [envCode, val] of Object.entries(newSecretForm.values)) {
    if (val.length > 8192) {
      ElMessage.error(`${envCode} value 长度不能超过 8192`)
      return
    }
  }

  if (!selectedFolderNode.value) return
  const picked = selectedFolderNode.value
  if (!picked.folderGroupId) {
    ElMessage.error('当前配置集缺少 folderGroupId,无法创建 secret')
    return
  }
  newSecretSubmitting.value = true
  try {
    const envBindingByCode = new Map(picked.envList.map((b) => [b.code, b]))
    const values: BatchCreateSecretValue[] = []
    for (const envCode of currentEnvCodes.value) {
      const value = newSecretForm.values[envCode] ?? ''
      const binding = envBindingByCode.get(envCode)
      if (binding) {
        values.push({ envId: binding.id, value })
      }
    }
    const req: BatchCreateSecretsRequest = {
      secretList: [
        {
          folderGroupId: picked.folderGroupId,
          key: k,
          remark: newSecretForm.comment?.trim() ?? '',
          values,
        },
      ],
    }
    await secretStore.batchCreate(req)
    ElMessage.success('创建成功')
    cancelNewSecret()
    void loadSecretsOfCurrent()
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : '创建失败'
    ElMessage.error(msg)
  } finally {
    newSecretSubmitting.value = false
  }
}

// ==================== 查看 secret 明文(4-env 一次性)====================
//
// 旧版有个 reveal 对话框,会展开 4 env 的全量明文 + 复制 + 警告;
// 现改为"每个 env 单元格自带小眼睛 toggle",查看/隐藏就地在行内完成,
// 整组 reveal 弹窗成为死代码,连同 openReveal / copyRevealValue 等一并移除。
// 复制明文改走浏览器自带的 select + copy,或后续在单元格再加 copy 按钮。

// ==================== 行内编辑 secret ====================
//
// 彻底避开嵌套 el-table expand slot 内的 v-model 响应追踪问题：
// 1) 编辑值统一放在组件顶级 ref<Record<string,string>> 中,
//    key = ${rowKey}_${envCode}, 值读取和写入都不依赖 slot 作用域里的响应式。
// 2) 模板中使用原生 <input type="password"> + :value + @input,
//    完全避免 el-input 内部 v-model 在深层 slot 中的失效问题。
// 3) 原始快照单独保存为普通对象（非响应式），只用于 save 时的 diff。
const _editingRowKey = ref<string | null>(null)
const _editingComment = ref('')
const _editingOriginalComment = ref('')
/** key = `${rowKey}_${envCode}` → 当前输入值 */
const _editingValues = ref<Record<string, string>>({})
/** key = `${rowKey}_${envCode}` → secret entry id */
let _editingEnvIds: Record<string, string> = {}
/** 编辑行对应的 envCode 列表 */
let _editingEnvCodes: string[] = []
const _editingSubmitting = ref(false)

function editingValueKey(rowKey: string, envCode: string): string {
  return `${rowKey}_${envCode}`
}

function isRowEditing(rowKey: string): boolean {
  return _editingRowKey.value === rowKey
}

function startEditRow(row: SecretAcrossEnvs): void {
  if (!has(Permission.SecretUpdate)) {
    ElMessage.warning('当前账号没有 secret:update 权限')
    return
  }
  const entries = getSortedEnvEntries(row)
  _editingRowKey.value = row.key
  _editingComment.value = row.comment ?? ''
  _editingOriginalComment.value = row.comment ?? ''

  const vals: Record<string, string> = {}
  const originals: Record<string, string> = {}
  const ids: Record<string, string> = {}
  const codes: string[] = []
  for (const { envCode, entry } of entries) {
    const v = entry.value ?? ''
    const k = editingValueKey(row.key, envCode)
    vals[k] = v
    originals[k] = v
    ids[k] = entry.id ?? ''
    codes.push(envCode)
  }
  _editingValues.value = vals
  _editingEnvIds = ids
  _editingEnvCodes = codes
  _editingSubmitting.value = false
}

/** 模板中 @input 调用，直接修改 ref 的 Record 属性 */
function onEditValueInput(rowKey: string, envCode: string, e: Event): void {
  const target = e.target as HTMLInputElement | null
  if (!target) return
  const k = editingValueKey(rowKey, envCode)
  _editingValues.value = { ..._editingValues.value, [k]: target.value }
}

/** 模板中 @input 调用，更新说明 */
function onEditCommentInput(e: Event): void {
  const target = e.target as HTMLInputElement | null
  if (target) {
    _editingComment.value = target.value
  }
}

function cancelEditRow(): void {
  _editingRowKey.value = null
  _editingComment.value = ''
  _editingOriginalComment.value = ''
  _editingValues.value = {}
  _editingEnvIds = {}
  _editingEnvCodes = []
  _editingSubmitting.value = false
}

async function saveEditRow(): Promise<void> {
  const rowKey = _editingRowKey.value
  if (rowKey === null) return
  if (!has(Permission.SecretUpdate)) {
    ElMessage.warning('当前账号没有 secret:update 权限')
    return
  }

  // 构造新接口请求体：key + comment + 所有 env 的 {id, value} 数组(全量提交)
  const values: Array<{ id: string; value: string }> = []
  for (const envCode of _editingEnvCodes) {
    const k = editingValueKey(rowKey, envCode)
    const id = _editingEnvIds[k] ?? ''
    if (id) {
      values.push({ id, value: _editingValues.value[k] ?? '' })
    }
  }

  _editingSubmitting.value = true
  try {
    const req: UpdateSecretsReq = {
      key: rowKey,
      comment: _editingComment.value,
      values,
    }
    await withApiCall(() => updateSecrets(req))
    ElMessage.success('保存成功')
    cancelEditRow()
    void loadSecretsOfCurrent()
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : '保存失败'
    ElMessage.error(msg)
  } finally {
    _editingSubmitting.value = false
  }
}

// ==================== 整体刷新 ====================
async function refreshAll(): Promise<void> {
  // 新数据模型:一次刷新整棵 folder 树
  await loadFolderTree()
  // 同时清掉详情侧状态 + 切回 LIST 视图 —— 否则仅清 selectedFolderNode
  // 之后 DETAIL 视图的 v-if 会变 false,但 LIST 视图的 v-show="viewMode === 'list'"
  // 仍受旧的 viewMode 控制,如果用户原本在 detail 视图就会"两个视图都不渲染"
  // → 整片空白。
  selectedFolderNode.value = null
  viewMode.value = 'list'
  activeTab.value = 'secrets'
  secretStore.clear()
}

function onBack(): void {
  router.push({ name: 'ProjectList' })
}

// ==================== 初始化 ====================
onMounted(async () => {
  if (!projectId.value) {
    ElMessage.error('缺少 projectId')
    onBack()
    return
  }

  // org list 用于 rbac scope(项目详情接口要求 parentId=orgId)
  if (orgStore.items.length === 0) {
    try {
      await orgStore.fetchList({ pageNum: 1, pageSize: 100 })
    } catch {
      // ignore
    }
  }
  await loadProject()

  // 拉项目下所有 env
  try {
    await envStore.fetchList({ projectId: projectId.value })
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : '加载环境失败'
    ElMessage.error(msg)
  }

  // 新数据模型:一次拉全 project 下的 folder 树
  await loadFolderTree()
})

// project 切换 → rbac scope
watch(
  () => projectId.value,
  (pid) => {
    if (pid) void rbac.setCurrentScope({ scopeType: 'project', scopeId: pid })
  },
  { immediate: true },
)
</script>

<template>
  <div class="proj-detail">
    <!-- Header -->
    <header class="proj-header">
      <div class="proj-header__left">
        <div class="proj-header__title-block">
          <h1 class="proj-header__title">
            {{ project?.name ?? '加载中...' }}
            <code v-if="project" class="proj-header__code">{{ project.code }}</code>
          </h1>
          <p v-if="project?.comment" class="proj-header__desc">{{ project.comment }}</p>
        </div>
      </div>
      <div class="proj-header__actions">
        <el-button :icon="Refresh" :disabled="!projectId" @click="refreshAll"> 刷新 </el-button>
      </div>
    </header>

    <div v-if="envOptions.length === 0" class="proj-detail__hint">
      <el-icon><CircleClose /></el-icon>
      <span>当前项目还没有环境,请到「环境管理」页创建。</span>
    </div>

    <template v-else>
      <!-- =============== LIST 视图(默认)=============== -->
      <div v-show="viewMode === 'list'" class="proj-detail__body proj-detail__body--list">
        <main v-loading="folderTreeLoading" class="folder-list">
          <header class="folder-list__head">
            <div>
              <h2 class="folder-list__title">目录</h2>
              <p class="folder-list__desc">
                L1 顶级目录 + L2 子目录,按 env 列打勾;点击行查看详情。
              </p>
            </div>
            <el-button
              type="primary"
              size="small"
              :icon="Plus"
              :disabled="envOptions.length === 0 || !has(Permission.FolderCreate)"
              :title="!has(Permission.FolderCreate) ? '当前账号没有 folder:create 权限' : ''"
              @click="openCreateRootFolder"
            >
              新建顶级
            </el-button>
          </header>
          <el-table
            :data="flatFolders"
            class="folder-list__table"
            :empty-text="
              folderTree.length === 0 ? '该项目下暂无目录,点击上方「新建顶级」创建' : '暂无数据'
            "
            @row-click="onFlatRowClick"
          >
            <!--
              名称列承担了原 Code 列的展示职责:
                [toggle]  [folder-icon]  name  (code)
              - L1 行的展开/收起按钮(原放在 Code 列,这里随列合并一起搬过来,
                避免被压成不可点的窄条)
              - L2 行的占位:与 L1 的 toggle 同尺寸,保持 folder icon 视觉对齐
              - code 跟在 name 后用括号包起来,作为次要标识
            -->
            <el-table-column label="名称" min-width="280">
              <template #default="{ row }">
                <div class="folder-list__name-cell">
                  <span
                    v-if="row.depth === 1"
                    class="folder-list__toggle"
                    :class="{
                      'is-disabled': !row.node.subFolders?.length,
                      'is-expanded': expandedRowIds.has(row.node.id),
                    }"
                    @click.stop="row.node.subFolders?.length && toggleRowExpand(row.node.id)"
                  >
                    <span class="folder-list__toggle-icon">
                      {{ expandedRowIds.has(row.node.id) ? '−' : '+' }}
                    </span>
                  </span>
                  <span v-else class="folder-list__toggle folder-list__toggle--placeholder" />
                  <el-icon class="folder-list__code-icon"><FolderIcon /></el-icon>
                  <span class="folder-list__name-text">{{ row.node.name }}</span>
                  <code v-if="row.node.code" class="folder-list__code-suffix">
                    ({{ row.node.code }})
                  </code>
                </div>
              </template>
            </el-table-column>
            <el-table-column prop="node.comment" label="说明" min-width="200" show-overflow-tooltip>
              <template #default="{ row }">
                <span class="muted">{{ row.node.comment || '—' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="子目录" width="80" align="center">
              <template #default="{ row }">
                <el-tag
                  v-if="row.depth === 1 && row.node.subFolders?.length"
                  size="small"
                  effect="plain"
                  type="info"
                >
                  {{ row.node.subFolders.length }}
                </el-tag>
                <span v-else class="muted">—</span>
              </template>
            </el-table-column>
            <el-table-column
              v-for="env in envOptions"
              :key="env.id"
              :label="env.name"
              min-width="90"
              align="center"
            >
              <template #default="{ row }">
                <el-icon
                  v-if="isFolderInEnv(row.node, env.id)"
                  class="env-check"
                  :title="`已挂载到 ${env.name}`"
                >
                  <Check />
                </el-icon>
                <span v-else class="env-check__off" :title="`未挂载到 ${env.name}`">—</span>
              </template>
            </el-table-column>
          </el-table>
        </main>
      </div>

      <!-- =============== DETAIL 视图(选中某 folder 后切到这里,隐藏列表)=============== -->
      <div
        v-if="selectedFolderNode"
        v-show="viewMode === 'detail'"
        class="proj-detail__body proj-detail__body--detail"
      >
        <aside class="detail-panel detail-panel--full">
          <!--
            原「返回目录列表」按钮整组移除:
            面包屑的 project 项是唯一的返回入口(点它切回 LIST 视图),
            不再需要独立的返回按钮占一行。
          -->

          <!-- 未选目录 -->
          <section v-if="!selectedFolderNode" class="detail-empty">
            <el-icon class="detail-empty__icon"><Document /></el-icon>
            <h2>选择一个目录查看详情</h2>
            <p>从上方目录树或目录列表中点选,即可查看其基础信息、env 挂载情况与子目录。</p>
          </section>

          <template v-else>
            <header class="detail-head">
              <nav class="crumb">
                <!--
                  面包屑结构:project / folder / folder
                  - project 项点击 → 切到 LIST 视图(项目下的目录列表),
                    这才是「根目录」的含义 —— 当前项目页面的目录树顶层
                  - 每个 folder 项点击 → 跳到该层级的 folder 详情
                  - 路径分隔符统一用「/」,更接近传统文件系统路径的视觉
                -->
                <span
                  class="crumb__item crumb__item--root"
                  :title="'返回目录列表(项目下的目录树顶层)'"
                  @click="onBackToList"
                >
                  <el-icon><FolderIcon /></el-icon>
                  {{ project?.name ?? '项目' }}
                  <!--
                    "返回根目录"的视觉提示 ↩ —— 独立 ✎ 返回按钮移除后,
                    project 项是唯一的返回入口,加个小箭头让"这是个可点的
                    跳转"更明确,避免用户误以为是普通 label。
                  -->
                  <el-icon class="crumb__back-hint"><ArrowLeft /></el-icon>
                </span>
                <template v-for="c in folderBreadcrumb" :key="c.id">
                  <span class="crumb__sep">/</span>
                  <span
                    class="crumb__item"
                    :class="{
                      'crumb__item--l1': c.kind === 'l1',
                      'crumb__item--current': c.id === selectedFolderNode.id,
                    }"
                    :title="`跳到 ${c.name}`"
                    @click="
                      onTreeNodeClick(findFolderNode(folderTree, c.id)?.node ?? selectedFolderNode)
                    "
                  >
                    {{ c.name }}
                  </span>
                </template>
              </nav>
              <el-tabs v-model="activeTab" class="detail-tabs">
                <el-tab-pane name="secrets">
                  <template #label>
                    <span class="detail-tabs__label">
                      <el-icon><KeyIcon /></el-icon>
                      Secrets
                    </span>
                  </template>
                </el-tab-pane>
                <el-tab-pane name="subfolders">
                  <template #label>
                    <span class="detail-tabs__label">
                      <el-icon><FolderIcon /></el-icon>
                      子目录
                    </span>
                  </template>
                </el-tab-pane>
                <el-tab-pane name="info">
                  <template #label>
                    <span class="detail-tabs__label">
                      <el-icon><InfoFilled /></el-icon>
                      Folder 基础信息
                    </span>
                  </template>
                </el-tab-pane>
              </el-tabs>
            </header>

            <!-- Info Tab -->
            <section v-show="activeTab === 'info'" class="tab-pane">
              <div class="tab-pane__bar">
                <div class="tab-pane__title">
                  {{ selectedFolderNode.name }}
                  <el-tag
                    :type="selectedFolderNode.subFolders ? 'primary' : 'info'"
                    size="small"
                    effect="light"
                    class="tab-pane__level-tag"
                  >
                    L{{ selectedFolderNode.subFolders ? 1 : 2 }}
                  </el-tag>
                </div>
                <div class="tab-pane__actions">
                  <el-button
                    type="primary"
                    plain
                    size="small"
                    :icon="Edit"
                    class="vault-edit-action"
                    :disabled="!has(Permission.FolderUpdate)"
                    :title="!has(Permission.FolderUpdate) ? '当前账号没有 folder:update 权限' : ''"
                    @click="openEditFolder(selectedFolderNode)"
                  >
                    编辑目录
                  </el-button>
                  <el-button
                    type="danger"
                    size="small"
                    :icon="Delete"
                    class="folder-delete-button vault-delete-action"
                    :disabled="!has(Permission.FolderDelete)"
                    :title="!has(Permission.FolderDelete) ? '当前账号没有 folder:delete 权限' : ''"
                    @click="onDeleteFolder(selectedFolderNode)"
                  >
                    删除目录
                  </el-button>
                </div>
              </div>

              <el-descriptions :column="2" border>
                <el-descriptions-item label="Code">
                  <code class="mono">{{ selectedFolderNode.code }}</code>
                </el-descriptions-item>
                <el-descriptions-item label="名称">
                  {{ selectedFolderNode.name }}
                </el-descriptions-item>
                <el-descriptions-item label="层级">
                  L{{ selectedFolderNode.subFolders ? 1 : 2 }}
                </el-descriptions-item>
                <el-descriptions-item label="挂载 env">
                  <span v-if="selectedFolderNode.envList.length === 0" class="muted">—</span>
                  <el-tag
                    v-for="binding in selectedFolderNode.envList"
                    :key="binding.id"
                    size="small"
                    effect="plain"
                    class="env-tag"
                    :title="`${binding.code} 环境`"
                  >
                    {{ envOptions.find((e) => e.id === binding.id)?.name ?? binding.code }}
                  </el-tag>
                </el-descriptions-item>
                <el-descriptions-item label="子目录" :span="2">
                  <span v-if="!selectedFolderNode.subFolders?.length" class="muted">—</span>
                  <span v-else>
                    <el-tag
                      v-for="c in selectedFolderNode.subFolders"
                      :key="c.id"
                      size="small"
                      effect="plain"
                      class="env-tag env-tag--clickable"
                      @click="onTreeNodeClick(c)"
                    >
                      {{ c.name }} ({{ c.code }})
                    </el-tag>
                  </span>
                </el-descriptions-item>
                <el-descriptions-item label="说明" :span="2">
                  {{ selectedFolderNode.comment || '—' }}
                </el-descriptions-item>
                <el-descriptions-item label="ID" :span="2">
                  <span class="mono mono--id">{{ selectedFolderNode.id }}</span>
                </el-descriptions-item>
              </el-descriptions>
            </section>

            <!-- Subfolders Tab:展示当前 L1 目录下的 L2 子目录,允许反复创建多个 -->
            <section v-show="activeTab === 'subfolders'" class="tab-pane">
              <div class="tab-pane__bar">
                <div class="tab-pane__title">
                  子目录
                  <span class="tab-pane__count">
                    {{ selectedFolderNode.subFolders?.length ?? 0 }}
                  </span>
                </div>
                <div class="tab-pane__actions">
                  <!--
                    L1 目录(有 subFolders 字段)才允许在它下面挂 L2;
                    L2 目录不能继续往下挂,所以隐藏按钮。
                  -->
                  <el-button
                    v-if="selectedFolderNode.subFolders"
                    type="primary"
                    size="small"
                    :icon="Plus"
                    :disabled="!has(Permission.FolderCreate)"
                    :title="!has(Permission.FolderCreate) ? '当前账号没有 folder:create 权限' : ''"
                    @click="openCreateChildFolder(selectedFolderNode)"
                  >
                    新建子目录
                  </el-button>
                </div>
              </div>

              <el-table
                v-if="currentSubfolders.length"
                :data="currentSubfolders"
                class="subfolder-table"
                empty-text="该目录下还没有子目录,点击右上「新建子目录」开始"
                @row-click="onTreeNodeClick"
              >
                <!-- 名称列合成 name(code) 格式:icon + name + (code) -->
                <el-table-column label="名称" min-width="220">
                  <template #default="{ row }">
                    <div class="folder-list__name-cell">
                      <el-icon class="folder-list__code-icon"><FolderIcon /></el-icon>
                      <span class="folder-list__name-text">{{ row.name }}</span>
                      <code v-if="row.code" class="folder-list__code-suffix">
                        ({{ row.code }})
                      </code>
                    </div>
                  </template>
                </el-table-column>
                <el-table-column prop="comment" label="说明" min-width="200" show-overflow-tooltip>
                  <template #default="{ row }">
                    <span class="muted">{{ row.comment || '—' }}</span>
                  </template>
                </el-table-column>
                <el-table-column
                  v-for="env in envOptions"
                  :key="env.id"
                  :label="env.name"
                  min-width="80"
                  align="center"
                >
                  <template #default="{ row }">
                    <!--
                      el-table 内部对 data 数组的泛型推断在我们这版 Element Plus
                      下会退化成 DefaultRow,而我们这里 :data 绑定的就是
                      currentSubfolders: FolderNode[],这里手动断言以满足
                      isFolderInEnv 的入参类型。
                    -->
                    <el-icon
                      v-if="isFolderInEnv(row as FolderNode, env.id)"
                      class="env-check"
                      :title="`已挂载到 ${env.name}`"
                    >
                      <Check />
                    </el-icon>
                    <span v-else class="env-check__off" :title="`未挂载到 ${env.name}`">—</span>
                  </template>
                </el-table-column>
              </el-table>

              <div v-else class="subfolder-empty">
                <el-icon class="subfolder-empty__icon"><FolderIcon /></el-icon>
                <p v-if="!selectedFolderNode.subFolders">
                  当前为 L2 子目录,系统最多支持 2 级目录,无法再挂载下一级。
                </p>
                <p v-else>该 L1 目录下还没有子目录,点击右上「新建子目录」开始创建。</p>
              </div>
            </section>

            <!-- Secrets Tab -->
            <section v-show="activeTab === 'secrets'" class="tab-pane">
              <div class="tab-pane__bar">
                <div class="tab-pane__title">
                  当前目录密钥
                  <span class="tab-pane__count">{{ secretStore.acrossEnvsItems.length }}</span>
                </div>
                <div class="tab-pane__actions">
                  <el-button
                    type="primary"
                    size="small"
                    :icon="Plus"
                    :disabled="
                      !newSecretCreating &&
                      (selectedFolderNode.envList.length === 0 || !has(Permission.SecretCreate))
                    "
                    :title="!has(Permission.SecretCreate) ? '当前账号没有 secret:create 权限' : ''"
                    @click="openNewSecretRow"
                  >
                    新建密钥
                  </el-button>
                </div>
              </div>

              <el-table
                v-loading="secretStore.acrossEnvsLoading"
                :data="secretStore.acrossEnvsItems"
                row-key="key"
                class="secret-table"
                empty-text="该目录下还没有密钥,点击右上「新建密钥」开始"
              >
                <el-table-column type="expand">
                  <template #default="{ row }">
                    <!-- 二级表格:每个 env 一行 -->
                    <el-table
                      :data="getSortedEnvEntries(row as SecretAcrossEnvs)"
                      size="small"
                      class="secret-sub-table"
                    >
                      <el-table-column label="环境" width="100">
                        <template #default="{ row: subRow }">
                          <el-tag size="small" effect="plain">{{ subRow.envCode }}</el-tag>
                        </template>
                      </el-table-column>
                      <el-table-column label="值" min-width="320">
                        <template #default="{ row: subRow }">
                          <!-- 编辑态 -->
                          <div
                            v-if="isRowEditing((row as SecretAcrossEnvs).key)"
                            class="secret-sub-value"
                          >
                            <input
                              class="editing-input"
                              :value="
                                _editingValues[
                                  editingValueKey((row as SecretAcrossEnvs).key, subRow.envCode)
                                ] ?? ''
                              "
                              @input="
                                (e: Event) =>
                                  onEditValueInput((row as SecretAcrossEnvs).key, subRow.envCode, e)
                              "
                              :placeholder="`${subRow.envCode} 新值`"
                            />
                          </div>
                          <!-- 展示态 -->
                          <div v-else-if="subRow.entry.value" class="secret-sub-value">
                            <el-input
                              :model-value="subRow.entry.value"
                              type="text"
                              readonly
                              size="small"
                              :rows="1"
                              placeholder="—"
                            />
                          </div>
                          <span v-else class="muted">—</span>
                        </template>
                      </el-table-column>
                      <el-table-column label="版本" width="80" align="center">
                        <template #default="{ row: subRow }">
                          <el-tag size="small" effect="light" type="info">
                            v{{ subRow.entry.version }}
                          </el-tag>
                        </template>
                      </el-table-column>
                      <el-table-column label="更新时间" min-width="160">
                        <template #default="{ row: subRow }">
                          <span class="muted">{{ formatDateTime(subRow.entry.updatedAt) }}</span>
                        </template>
                      </el-table-column>
                    </el-table>
                  </template>
                </el-table-column>
                <el-table-column prop="key" label="Key" min-width="200" show-overflow-tooltip>
                  <template #default="{ row }">
                    <span class="secret-key">
                      <el-icon class="secret-key__icon"><KeyIcon /></el-icon>
                      {{ (row as SecretAcrossEnvs).key }}
                    </span>
                  </template>
                </el-table-column>
                <el-table-column label="说明" min-width="200" show-overflow-tooltip>
                  <template #default="{ row }">
                    <!-- 编辑态 -->
                    <input
                      v-if="isRowEditing((row as SecretAcrossEnvs).key)"
                      class="editing-input editing-comment-input"
                      :value="_editingComment"
                      @input="onEditCommentInput"
                      placeholder="说明"
                    />
                    <span v-else class="muted">{{ (row as SecretAcrossEnvs).comment || '—' }}</span>
                  </template>
                </el-table-column>
                <el-table-column label="操作" width="150" fixed="right">
                  <template #default="{ row }">
                    <template v-if="isRowEditing((row as SecretAcrossEnvs).key)">
                      <el-button
                        link
                        size="small"
                        type="primary"
                        :loading="_editingSubmitting"
                        @click="saveEditRow"
                      >
                        保存
                      </el-button>
                      <el-button link size="small" @click="cancelEditRow">取消</el-button>
                    </template>
                    <el-button
                      v-else
                      link
                      size="small"
                      type="primary"
                      :icon="Edit"
                      class="vault-edit-action"
                      :disabled="!has(Permission.SecretUpdate)"
                      @click="startEditRow(row as SecretAcrossEnvs)"
                    >
                      编辑
                    </el-button>
                  </template>
                </el-table-column>
              </el-table>

              <!-- 新建密钥行(表格底部) -->
              <div v-if="newSecretCreating" class="tab-pane__new-secret">
                <div class="new-secret-card">
                  <div class="new-secret-card__header">
                    <el-icon class="secret-key__icon"><Plus /></el-icon>
                    <span class="new-secret-card__title">新建密钥</span>
                    <el-tag size="small" type="info" effect="plain">
                      目录: {{ selectedFolderNode?.code ?? '' }}
                    </el-tag>
                  </div>
                  <div class="new-secret-card__body">
                    <div class="new-secret-card__row">
                      <el-input
                        v-model="newSecretForm.key"
                        placeholder="例如 DATABASE_URL"
                        :prefix-icon="KeyIcon"
                        class="new-secret-card__key-input"
                      />
                      <el-input
                        v-model="newSecretForm.comment"
                        type="textarea"
                        :rows="1"
                        :autosize="{ minRows: 1, maxRows: 3 }"
                        placeholder="说明(可选)"
                        class="new-secret-card__comment-input"
                      />
                    </div>
                    <!-- 新建 env 值:与上方展示框一致的列表布局 -->
                    <el-table
                      :data="currentEnvCodes.map((code) => ({ envCode: code }))"
                      size="small"
                      class="new-secret-card__env-table"
                    >
                      <el-table-column label="环境" width="100">
                        <template #default="{ row: envRow }">
                          <el-tag size="small" effect="plain">{{ envRow.envCode }}</el-tag>
                        </template>
                      </el-table-column>
                      <el-table-column label="值">
                        <template #default="{ row: envRow }">
                          <el-input
                            v-model="newSecretForm.values[envRow.envCode]"
                            :placeholder="`${envRow.envCode} 的值`"
                            autocomplete="new-password"
                          />
                        </template>
                      </el-table-column>
                    </el-table>
                  </div>
                  <div class="new-secret-card__footer">
                    <el-button
                      type="primary"
                      size="small"
                      :loading="newSecretSubmitting"
                      @click="submitNewSecret"
                    >
                      保存
                    </el-button>
                    <el-button size="small" @click="cancelNewSecret">取消</el-button>
                  </div>
                </div>
              </div>

              <div class="secret-pager">
                <el-pagination
                  background
                  layout="total, prev, pager, next, sizes"
                  :total="secretStore.total"
                  :current-page="secretStore.lastQuery.pageNum ?? 1"
                  :page-size="secretStore.lastQuery.pageSize ?? 20"
                  :page-sizes="[10, 20, 50, 100]"
                  @current-change="
                    (p: number) => onSecretPageChange(p, secretStore.lastQuery.pageSize ?? 20)
                  "
                  @size-change="(s: number) => onSecretPageChange(1, s)"
                />
              </div>
            </section>
          </template>
        </aside>
      </div>
    </template>

    <!-- 新建 folder Dialog -->
    <el-dialog
      v-model="createFolderDialogVisible"
      width="560px"
      :close-on-click-modal="false"
      :title="createFolderForm.level === 1 ? '新建顶级目录' : '新建子目录'"
    >
      <el-form
        ref="createFolderFormRef"
        :model="createFolderForm"
        :rules="createFolderRules"
        label-position="top"
      >
        <el-form-item label="级别" prop="level">
          <el-radio-group v-model="createFolderForm.level">
            <el-radio-button :value="1">level=1 (env 下顶级)</el-radio-button>
            <el-radio-button :value="2">level=2 (子目录)</el-radio-button>
          </el-radio-group>
        </el-form-item>

        <el-form-item v-if="createFolderForm.level === 2" label="父级 code" prop="parentCode">
          <el-input
            v-model="createFolderForm.parentCode"
            placeholder="父 level=1 folder 的 code,例如 payment"
          />
        </el-form-item>

        <el-form-item label="应用到 env" prop="envList">
          <el-select
            v-model="createFolderForm.envList"
            multiple
            collapse-tags
            collapse-tags-tooltip
            filterable
            placeholder="选择要创建到的 env(可多选)"
            style="width: 100%"
          >
            <el-option
              v-for="e in envOptions"
              :key="e.id"
              :label="`${e.name} (${e.code})`"
              :value="e.id"
            />
          </el-select>
          <div class="form-hint">
            该 folder 会按 envList 在所选 env 下各自创建一份。
            <span v-if="createFolderForm.level === 2">
              对每个 env,后端会按 parentCode 找对应的 L1 父节点挂载。
            </span>
          </div>
        </el-form-item>

        <el-form-item label="Code" prop="code">
          <el-input v-model="createFolderForm.code" placeholder="例如 globals / services" />
        </el-form-item>
        <el-form-item label="名称" prop="name">
          <el-input v-model="createFolderForm.name" placeholder="Globals" />
        </el-form-item>
        <el-form-item label="管理员" prop="managerId">
          <ManagerSelect v-model="createFolderForm.managerId" :disabled="createFolderSubmitting" />
        </el-form-item>
        <el-form-item v-if="!createFolderForm.code && createFolderForm.level === 1" label="预设">
          <div class="presets">
            <el-button
              v-for="p in PRESET_FOLDERS"
              :key="p.code"
              size="small"
              plain
              @click="fillFromPreset(p)"
            >
              {{ p.code }}
            </el-button>
          </div>
        </el-form-item>
        <el-form-item label="说明" prop="comment">
          <el-input v-model="createFolderForm.comment" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="Secret Key 校验">
          <el-radio-group
            v-model="createFolderForm.keyPatternMode"
            @change="createFolderFormRef?.clearValidate('customKeyPattern')"
          >
            <el-radio-button value="none">不校验</el-radio-button>
            <el-radio-button value="uppercase">大写/数字/下划线</el-radio-button>
            <el-radio-button value="lowercase">小写/数字/中横线</el-radio-button>
            <el-radio-button value="custom">自定义</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item
          v-if="createFolderForm.keyPatternMode === 'custom'"
          label="自定义表达式"
          prop="customKeyPattern"
        >
          <el-input v-model="createFolderForm.customKeyPattern" placeholder="^[A-Z][A-Z0-9_]*$" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createFolderDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="createFolderSubmitting" @click="onCreateFolderSubmit">
          创建
        </el-button>
      </template>
    </el-dialog>

    <!-- 编辑 folder Dialog -->
    <el-dialog
      v-model="editFolderDialogVisible"
      width="480px"
      :close-on-click-modal="false"
      title="编辑目录"
      @closed="resetEditFolderForm"
    >
      <el-form
        ref="editFolderFormRef"
        :model="editFolderForm"
        :rules="editFolderRules"
        label-position="top"
      >
        <el-form-item label="Code" prop="code">
          <!--
            code 是 env 下的稳定标识,创建后不可改 — 这里写死 disabled
            (不受权限影响,任何人都不能改)
          -->
          <el-input
            v-model="editFolderForm.code"
            disabled
            placeholder="code 在 env 下是稳定标识,不可修改"
          />
        </el-form-item>
        <el-form-item label="名称" prop="name">
          <el-input
            v-model="editFolderForm.name"
            :disabled="!has(Permission.FolderUpdate)"
            placeholder="Globals"
          />
        </el-form-item>
        <el-form-item label="说明" prop="comment">
          <el-input
            v-model="editFolderForm.comment"
            type="textarea"
            :rows="2"
            :disabled="!has(Permission.FolderUpdate)"
            placeholder="可清空"
          />
        </el-form-item>
        <el-form-item label="Key 校验">
          <el-radio-group
            v-model="editFolderForm.keyPatternMode"
            :disabled="!has(Permission.FolderUpdate)"
            @change="editFolderFormRef?.clearValidate('keyPattern')"
          >
            <el-radio-button value="none">关闭校验</el-radio-button>
            <el-radio-button value="custom">自定义表达式</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item
          v-if="editFolderForm.keyPatternMode === 'custom'"
          label="表达式"
          prop="keyPattern"
        >
          <el-input
            v-model="editFolderForm.keyPattern"
            :disabled="!has(Permission.FolderUpdate)"
            placeholder="^[A-Z][A-Z0-9_]*$"
          />
        </el-form-item>
        <p v-if="!has(Permission.FolderUpdate)" class="form-hint">
          当前账号没有 <code>folder:update</code> 权限,无法修改名称/说明。
        </p>
      </el-form>
      <template #footer>
        <el-button @click="editFolderDialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="editFolderSubmitting"
          :disabled="!has(Permission.FolderUpdate)"
          @click="onEditFolderSubmit"
        >
          保存
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style lang="scss" scoped>
.proj-detail {
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
    padding: 48px;
    color: var(--v-text-tertiary);
    font-size: 13px;
    background: var(--v-surface-bg);
    border: 1px dashed var(--v-surface-border);
    border-radius: var(--v-radius-lg);
  }

  &__body {
    display: grid;
    grid-template-columns: 320px 1fr;
    gap: 16px;
    min-height: 520px;
  }
}

// ---------------- 顶部:project header ----------------
.proj-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;

  &__left {
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }

  &__title-block {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  &__title {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0;
    font-size: 22px;
    font-weight: 600;
    color: var(--v-text-primary);
  }

  &__code {
    font-family: var(--el-font-family-monospace, ui-monospace, monospace);
    font-size: 13px;
    color: var(--v-text-secondary);
    background: var(--v-surface-bg-subtle);
    padding: 2px 8px;
    border-radius: var(--v-radius-sm);
    font-weight: 500;
  }

  &__desc {
    margin: 0;
    color: var(--v-text-secondary);
    font-size: 13px;
  }

  &__actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }
}

// ---------------- 主体:list / detail 两种视图 ----------------
//
// 旧:list + detail 同时左右展示(grid 1.4fr / 1fr)
// 新:list / detail 互斥,通过 viewMode 切换;list 视图只有列表一栏,
//     detail 视图详情独立占满一行,带"返回目录列表"按钮
.proj-detail__body {
  &--list {
    display: block; // 列表独占,无需 grid
  }

  &--detail {
    display: block;
  }
}

.detail-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;

  &--full {
    width: 100%;
  }
}

// 原 .detail-back 样式块(顶部"返回目录列表"按钮)已随按钮删除,
// 这里不再需要。面包屑的 project 项是唯一的返回入口。

// 列表内的展开/收起箭头按钮
// 目录树展开/收起按钮:圆形 + 始终可见的边框
// 三态:default(浅边)、hover(主题色边 + 浅底)、expanded(主题色实底 + 白字)
// disabled(无 L2 时):仍然可见,只是 opacity 0.35,不交互
//
// 实现:用纯文本字符 + 而非 el-icon / SVG。原因:el-icon 的 SVG 在
// el-table td 里会受 `display: inline-flex` 父容器、`overflow: hidden` 的单元格、
// `1em` 尺寸继承 等一系列 CSS 规则影响,实际渲染容易只露出左半边;
// 换成 `+` / `−` 字符就完全可控,任何浏览器 / 字体都能稳定显示。
.folder-list__toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  line-height: 1;
  border-radius: 50%;
  border: 1px solid var(--v-surface-border);
  background: var(--v-surface-bg);
  color: var(--v-text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
  user-select: none;
  vertical-align: middle;

  // L2 行占位:透明、无边框,只用来占空间让 folder icon 对齐
  &--placeholder {
    border-color: transparent;
    background: transparent;
    cursor: default;
    pointer-events: none;
  }

  // hover(仅在可点击状态下)
  &:hover:not(.is-disabled) {
    border-color: var(--el-color-primary);
    background: var(--el-color-primary-light-9);
    color: var(--el-color-primary);
  }

  // 已展开状态
  &.is-expanded {
    border-color: var(--el-color-primary);
    background: var(--el-color-primary);
    color: #fff;

    &:hover:not(.is-disabled) {
      background: var(--el-color-primary-light-3);
      border-color: var(--el-color-primary-light-3);
      color: #fff;
    }
  }

  // 无 L2(禁用态):仍可见,只是变淡、不响应
  &.is-disabled {
    opacity: 0.35;
    cursor: default;
  }
}

.folder-list__toggle-icon {
  display: block;
  font-size: 16px;
  font-weight: 600;
  line-height: 1;
  // + 字符的字形重心略偏上,加 margin-top 微调让视觉居中
  margin-top: -1px;
  color: inherit;
}

.folder-list {
  background: var(--v-surface-bg);
  border: 1px solid var(--v-surface-border);
  border-radius: var(--v-radius-lg);
  overflow: hidden;

  &__head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 18px;
    border-bottom: 1px solid var(--v-divider);
    background: var(--v-surface-bg-subtle);
  }

  &__title {
    margin: 0 0 4px;
    font-size: 15px;
    font-weight: 600;
    color: var(--v-text-primary);
  }

  &__desc {
    margin: 0;
    font-size: 12px;
    color: var(--v-text-tertiary);
  }

  &__table {
    width: 100%;
  }

  &__code {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-family: var(--el-font-family-monospace, ui-monospace, monospace);
    font-size: 13px;
  }

  // 名称单元格里:toggle(可选) + folder icon + name 文本 + (code) 后缀
  &__name-cell {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  &__code-icon {
    color: var(--el-color-primary);
    flex-shrink: 0;
  }

  &__name-text {
    font-size: 13px;
    font-weight: 500;
    color: var(--v-text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 0 1 auto;
    min-width: 0;
  }

  // name 后面的 (code) 后缀:次要标识,等宽字体 + 灰字
  &__code-suffix {
    font-family: var(--el-font-family-monospace, ui-monospace, SFMono-Regular, monospace);
    font-size: 12px;
    color: var(--v-text-tertiary);
    font-weight: 400;
    flex-shrink: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    background: transparent;
    padding: 0;
  }

  // L2 行 toggle 占位:跟 L1 toggle 同尺寸,让 L1/L2 的 folder icon 视觉对齐
  // 不需要再在 row 上加 padding-left(已用占位推进去)
  // (el-table 行点击时,@row-click 触发,我们手动加 cursor: pointer 给用户视觉提示)
  :deep(.el-table__row) {
    cursor: pointer;
  }
}

.env-check {
  color: var(--v-color-success);
  font-size: 16px;
}

.env-check__off {
  color: var(--v-text-tertiary);
  font-size: 14px;
}

.env-tag {
  margin-right: 4px;
  margin-bottom: 4px;

  &--clickable {
    cursor: pointer;

    &:hover {
      color: var(--el-color-primary);
      border-color: var(--el-color-primary-light-5);
    }
  }
}

.detail-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

// ---------------- tree ----------------
.tree {
  list-style: none;
  margin: 0;
  padding: 0;

  &--child {
    border-left: 1px dashed var(--v-divider);
    margin-left: 22px;
  }

  &__row {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 12px;
    border-radius: var(--v-radius-sm);
    cursor: pointer;
    color: var(--v-text-primary);
    font-size: 13px;
    transition: background 0.15s ease;
    margin: 0 6px;

    &:hover {
      background: var(--v-surface-row-hover);
    }

    &.is-selected {
      background: var(--el-color-primary-light-9);
      color: var(--el-color-primary);
    }

    &--child {
      padding-left: 8px;
    }
  }

  &__toggle {
    color: var(--v-text-tertiary);
    font-size: 12px;
    transition: transform 0.15s ease;
    padding: 2px;
    border-radius: 3px;

    &:hover {
      background: var(--v-surface-row-hover);
      color: var(--v-text-primary);
    }

    &.is-expanded {
      transform: rotate(90deg);
    }
  }

  &__icon {
    color: var(--el-color-primary);
    flex-shrink: 0;

    &--child {
      color: var(--v-text-secondary);
    }
  }

  &__name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__code {
    color: var(--v-text-tertiary);
    font-size: 11px;
    font-family: var(--el-font-family-monospace, ui-monospace, monospace);
  }

  &__empty-child {
    list-style: none;
    color: var(--v-text-tertiary);
    font-size: 11px;
    padding: 4px 12px 4px 32px;
  }
}

// ---------------- 右栏:detail-panel ----------------
.detail-panel {
  background: var(--v-surface-bg);
  border: 1px solid var(--v-surface-border);
  border-radius: var(--v-radius-lg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.detail-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 32px;
  color: var(--v-text-tertiary);
  text-align: center;
  flex: 1;

  &__icon {
    font-size: 48px;
    opacity: 0.4;
    margin-bottom: 16px;
  }

  h2 {
    margin: 0 0 8px;
    font-size: 16px;
    font-weight: 600;
    color: var(--v-text-primary);
  }

  p {
    margin: 0;
    font-size: 13px;
    max-width: 360px;
    line-height: 1.6;
  }
}

.detail-head {
  padding: 16px 20px 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-bottom: 1px solid var(--v-divider);
}

.crumb {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--v-text-secondary);
  flex-wrap: wrap;

  &__item {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--v-text-secondary);
    cursor: pointer;
    padding: 2px 6px;
    border-radius: var(--v-radius-sm);
    transition:
      background 0.15s ease,
      color 0.15s ease;

    &:hover:not(.crumb__item--current):not(.is-disabled) {
      background: var(--v-surface-row-hover);
      color: var(--el-color-primary);
    }

    &--root {
      // 唯一返回入口:主色 + 轻量背景(独立 ✎ 返回按钮已移除,
      // 需要更明显的"可点"视觉,跟普通 crumb label 区分开)
      color: var(--el-color-primary);
      font-weight: 500;
      background: var(--el-color-primary-light-9);
    }

    &--env {
      color: var(--el-color-primary);
    }

    &--current {
      color: var(--v-text-primary);
      font-weight: 600;
      cursor: default;
    }

    &.is-disabled {
      cursor: not-allowed;
      opacity: 0.6;
    }
  }

  // 路径分隔符「/」,跟传统文件系统路径视觉一致
  &__sep {
    color: var(--v-text-tertiary);
    font-size: 13px;
    user-select: none;
    padding: 0 2px;
  }

  // project 项尾部的小 ↩ —— 提示"点此返回根目录"
  &__back-hint {
    margin-left: 2px;
    font-size: 12px;
    opacity: 0.65;
    transition:
      transform 0.15s ease,
      opacity 0.15s ease;
  }

  &__item--root:hover &__back-hint {
    opacity: 1;
    transform: translateX(-2px);
  }
}

.detail-tabs {
  margin-top: 4px;

  :deep(.el-tabs__header) {
    margin: 0;
  }

  :deep(.el-tabs__nav-wrap::after) {
    display: none;
  }

  &__label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
}

.tab-pane {
  padding: 16px 20px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;

  &__bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  &__title {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    font-weight: 600;
    color: var(--v-text-primary);
  }

  &__count {
    background: var(--v-surface-bg-subtle);
    color: var(--v-text-secondary);
    font-size: 12px;
    padding: 1px 8px;
    border-radius: 999px;
    font-weight: 500;
  }

  &__level-tag {
    margin-left: 2px;
  }

  &__actions {
    display: flex;
    gap: 8px;
  }
}

.folder-delete-button :deep(.el-icon) {
  color: #ef4444;
}

.secret-table {
  width: 100%;
}

// ---------------- subfolder table ----------------
.subfolder-table {
  width: 100%;

  // 行点击 → 进入子目录详情,给用户一个指针提示
  :deep(.el-table__row) {
    cursor: pointer;
  }
}

.subfolder-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 56px 24px;
  text-align: center;
  color: var(--v-text-tertiary);
  background: var(--v-surface-bg-subtle);
  border: 1px dashed var(--v-surface-border);
  border-radius: var(--v-radius-md);

  &__icon {
    font-size: 36px;
    margin-bottom: 10px;
    opacity: 0.5;
    color: var(--el-color-primary);
  }

  p {
    margin: 0;
    font-size: 13px;
    line-height: 1.6;
    max-width: 360px;
  }
}

.secret-key {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: var(--el-font-family-monospace, ui-monospace, monospace);
  font-size: 13px;
  color: var(--v-text-primary);
  background: var(--v-surface-bg-subtle);
  padding: 2px 8px;
  border-radius: var(--v-radius-sm);

  &__icon {
    color: var(--el-color-primary);
  }
}

.muted {
  color: var(--v-text-secondary);
  font-size: 13px;
}

.mono {
  font-family: var(--el-font-family-monospace, ui-monospace, monospace);
  font-size: 12px;
  background: var(--v-surface-bg-subtle);
  padding: 2px 6px;
  border-radius: 3px;
  color: var(--v-text-primary);

  &--id {
    font-size: 11px;
    color: var(--v-text-secondary);
    word-break: break-all;
  }
}

.secret-pager {
  display: flex;
  justify-content: flex-end;
}

.presets {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

// 弹窗内 folder 只读展示块(folder 由当前页面选中锁定,不可改)
.proj-detail__folder-readonly {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: var(--v-surface-bg-subtle);
  border: 1px solid var(--v-surface-border);
  border-radius: var(--v-radius-md);
  width: 100%;
}

.proj-detail__folder-icon {
  color: var(--el-color-primary);
  font-size: 16px;
  flex-shrink: 0;
}

.proj-detail__folder-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--v-text-primary);
}

.proj-detail__folder-code {
  font-family: var(--el-font-family-monospace, ui-monospace, monospace);
  font-size: 12px;
  color: var(--v-text-tertiary);
}

.proj-detail__folder-locked {
  margin-left: auto;
  flex-shrink: 0;
}

.form-hint {
  margin-top: 4px;
  font-size: 12px;
  color: var(--v-text-tertiary);
  line-height: 1.5;
}

// ---------------- batch create form ----------------
.batch-form {
  border: 1px solid var(--v-divider);
  border-radius: var(--v-radius-md);
  background: var(--v-surface-bg-subtle);
  overflow-x: auto;
  overflow-y: hidden;
}

// ---------------- batch form (card 样式) ----------------
// 旧版是横向 7 列 grid,把 value/env 说明挤成窄列;新版改成"每行一张卡",
// 顶部是 key + 说明 + 删除,下方是 env inputs 的换行网格。
.batch-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.batch-form__row {
  border: 1px solid var(--v-surface-border);
  border-radius: var(--v-radius-md);
  background: var(--v-surface-bg);
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.batch-form__row-head {
  display: grid;
  grid-template-columns: 1fr 1.4fr 36px; // key / 说明 / 删除
  gap: 8px;
  align-items: start;
}

.batch-form__key,
.batch-form__comment {
  min-width: 0;
}

.batch-form__action {
  align-self: start;
  margin-top: 2px;
}

// env inputs 网格:每格 minmax(280px, 1fr),env 多时自动换行
.batch-form__envs {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 8px 12px;
  border-top: 1px dashed var(--v-divider);
  padding-top: 10px;
}

.batch-form__env-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.batch-form__env-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--v-text-tertiary);
  font-family: var(--el-font-family-monospace, ui-monospace, SFMono-Regular, monospace);
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

.batch-form__footer {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 10px;
  flex-wrap: wrap;
}

.batch-form__hint {
  color: var(--v-text-tertiary);
  font-size: 12px;
  line-height: 1.5;
}

// ---------------- reveal ----------------
// 原 .reveal 弹窗样式已随死代码一并移除(查看功能下沉到 env 单元格)
// 这里保留必要的 warn 等若后续有需要再补;先按"无人使用"原则清掉避免样式污染。

// env code 旁边的 version tag(reveal/edit 弹窗里复用)
.env-version-tag {
  margin-left: 6px;
  font-family: var(--el-font-family-monospace, ui-monospace, monospace);
  font-size: 11px;
  color: var(--v-text-tertiary);
  font-weight: 400;
  letter-spacing: 0.3px;
  text-transform: lowercase;
}

// 表格里 4 env 单元格的明文值(单行省略)
.secret-cell-value {
  font-family: var(--el-font-family-monospace, ui-monospace, SFMono-Regular, monospace);
  font-size: 12px;
  color: var(--v-text-primary);
}

// 单个 env 单元格容器:左 value(省略) + 右 👁 按钮
.secret-cell {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-width: 0;
}

.secret-cell-eye {
  flex-shrink: 0;
  padding: 0 4px;
  color: var(--v-text-tertiary);

  &:hover:not(:disabled) {
    color: var(--el-color-primary);
  }
}

// 行内编辑态:el-input 占满列宽,跟显示态的 value 占据同样视觉位置
.secret-cell-edit {
  display: block;
  width: 100%;
  min-width: 0;

  // 缩小 el-input 内边距,行内编辑时更紧凑
  :deep(.el-input__wrapper) {
    padding: 1px 8px;
  }
}

.secret-sub-table {
  width: 100%;
  margin: 4px 0;
  background: var(--v-surface-bg-subtle);
  border-radius: var(--v-radius-sm);
}

.secret-sub-value {
  width: 100%;

  :deep(.el-input__wrapper) {
    font-family: var(--el-font-family-monospace, ui-monospace, SFMono-Regular, monospace);
    font-size: 12px;
  }
}

// ---------------- 新建密钥行(card 样式) ----------------
.tab-pane__new-secret {
  margin-top: 8px;
}

.new-secret-card {
  border: 1px dashed var(--el-color-primary-light-5);
  border-radius: var(--v-radius-md);
  background: var(--el-color-primary-light-9);
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;

  &__header {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  &__title {
    font-size: 14px;
    font-weight: 600;
    color: var(--el-color-primary);
  }

  &__body {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  &__row {
    display: grid;
    grid-template-columns: 1fr 1.4fr;
    gap: 8px;
    align-items: start;
  }

  &__key-input,
  &__comment-input {
    min-width: 0;
  }

  &__envs {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 8px 12px;
    border-top: 1px dashed var(--v-divider);
    padding-top: 10px;
  }

  &__env-cell {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  &__env-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--v-text-tertiary);
    font-family: var(--el-font-family-monospace, ui-monospace, SFMono-Regular, monospace);
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }

  &__footer {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-top: 4px;
  }
}

.editing-input {
  width: 100%;
  padding: 6px 10px;
  font-family: var(--el-font-family-monospace, ui-monospace, SFMono-Regular, monospace);
  font-size: 12px;
  border: 1px solid var(--el-border-color);
  border-radius: var(--v-radius-sm);
  outline: none;
  box-sizing: border-box;
  background: var(--el-input-bg-color, #fff);
  color: var(--v-text-primary);

  &:focus {
    border-color: var(--el-color-primary);
  }
}

.editing-comment-input {
  font-family: inherit;
  font-size: 13px;
}

code {
  font-family: var(--el-font-family-monospace, ui-monospace, monospace);
  font-size: 0.92em;
  background: var(--v-fill-color-light, #f4f4f5);
  padding: 0 4px;
  border-radius: 3px;
}
</style>
