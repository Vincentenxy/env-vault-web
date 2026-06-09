<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ElMessage,
  ElMessageBox,
  type FormInstance,
  type FormRules,
} from 'element-plus'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleClose,
  CopyDocument,
  Delete,
  Document,
  Edit,
  Folder as FolderIcon,
  Hide,
  InfoFilled,
  Key as KeyIcon,
  Lock,
  Plus,
  Refresh,
  View,
} from '@element-plus/icons-vue'
import { useEnvStore } from '@/stores/env'
import { useOrganizationStore } from '@/stores/organization'
import { useProjectStore } from '@/stores/project'
import { useSecretStore } from '@/stores/secret'
import { ApiError } from '@/types/api'
import { formatDateTime, maskSecret } from '@/utils/format'
import { getEnvProjectId } from '@/utils/env'
import { usePermission } from '@/composables/use-permission'
import { Permission } from '@/constants/permission'
import { listFoldersByProject, createFolder, deleteFolder, updateFolder } from '@/api/folder'
import type { Environment } from '@/types/env'
import type { FolderLevel, FolderNode } from '@/types/folder'
import type { Project } from '@/types/project'
import type { SecretMeta } from '@/types/secret'
import type {
  UpdateSecretRequest,
  BatchCreateSecretsRequest,
  BatchSecretItem,
} from '@/api/secret'

const route = useRoute()
const router = useRouter()
const envStore = useEnvStore()
const orgStore = useOrganizationStore()
const projectStore = useProjectStore()
const secretStore = useSecretStore()
const { has, rbac } = usePermission()

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

// ==================== folder 树(来自 /folder/listByProject)================
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
    const resp = await listFoldersByProject({ projectId: projectId.value })
    folderTree.value = resp.folderList ?? []
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

// ==================== Secret 列表 ====================
async function loadSecretsOfCurrent(): Promise<void> {
  if (!selectedFolderNode.value) {
    secretStore.clear()
    return
  }
  try {
    await secretStore.fetchList({
      folderId: selectedFolderNode.value.id,
      pageNum: 1,
      pageSize: secretStore.lastQuery.pageSize ?? 20,
    })
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : '加载密钥失败'
    ElMessage.error(msg)
  }
}

function onSecretPageChange(pageNum: number, pageSize: number): void {
  if (!selectedFolderNode.value) return
  secretStore
    .fetchList({ folderId: selectedFolderNode.value.id, pageNum, pageSize })
    .catch((e: unknown) => {
      const msg = e instanceof ApiError ? e.message : '加载失败'
      ElMessage.error(msg)
    })
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
  comment: string
}>({
  level: 1,
  envList: [],
  parentCode: '',
  code: '',
  name: '',
  comment: '',
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
  createFolderForm.comment = ''
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
    await createFolder({
      level: createFolderForm.level,
      code: createFolderForm.code,
      name: createFolderForm.name,
      envList: [...createFolderForm.envList],
      parentCode:
        createFolderForm.level === 2
          ? createFolderForm.parentCode.trim()
          : undefined,
      comment: createFolderForm.comment || undefined,
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
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
  } catch {
    return // 取消
  }
  try {
    await deleteFolder({ id: folder.id })
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
  id: string
  code: string
  name: string
  comment: string
}>({
  id: '',
  code: '',
  name: '',
  comment: '',
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
}

function resetEditFolderForm(): void {
  editFolderForm.id = ''
  editFolderForm.code = ''
  editFolderForm.name = ''
  editFolderForm.comment = ''
  editFolderFormRef.value?.clearValidate()
}

function openEditFolder(folder: FolderNode): void {
  editFolderForm.id = folder.id
  editFolderForm.code = folder.code
  editFolderForm.name = folder.name
  editFolderForm.comment = folder.comment ?? ''
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
  editFolderSubmitting.value = true
  try {
    await updateFolder({
      id: editFolderForm.id,
      name: editFolderForm.name.trim(),
      comment: editFolderForm.comment?.trim() || undefined,
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

// ==================== 批量创建 secret ====================
//
// 适配新数据模型:
//  - 旧:从顶部 env 多选 + per-env 树里收集 folder
//  - 新:直接读 `selectedFolderNode` 的 envList → 作为 value 列的列头
//         picked folder = 当前选中的 node
//         env 列与 L1 实际挂载的 env 一一对应,无需反查

const batchCreateDialogVisible = ref(false)
const batchCreateSubmitting = ref(false)
const batchCreateFormRef = ref<FormInstance>()
/** 打开对话框时由 selectedFolderNode.envList 快照,作为 value 列的列头(envCode) */
const batchCreateEnvCodes = ref<string[]>([])

interface BatchSecretRow {
  uid: string
  key: string
  comment: string
  /**
   * envCode -> 该 env 下的 value。**空字符串 = 不为该 env 创建**(实现成
   * "默认每个 env 都上传,留空就跳过"的语义)。
   */
  values: Record<string, string>
}

const batchCreateForm = reactive<{
  folderId: string
  rows: BatchSecretRow[]
}>({
  folderId: '',
  rows: [],
})

const batchCreateRules: FormRules<{ folderId: string }> = {
  folderId: [{ required: true, message: '请选择目录', trigger: 'change' }],
}

/** batch create 的可选 folder:所有 L1 + L2(批量 secret 可挂在任意层级 folder 下)
 *  旧版只取 folderTree 顶层导致 L2 folder 详情面板点新建会"所选目录无效"。 */
const batchCreateFolderOptions = computed<FolderNode[]>(() => {
  const out: FolderNode[] = []
  for (const l1 of folderTree.value) {
    out.push(l1)
    if (l1.subFolders?.length) out.push(...l1.subFolders)
  }
  return out
})

/** 弹窗里展示的所属 folder(只读,当前页面已选中的那个,不能改) */
const batchCreateSelectedFolder = computed<{ name: string; code: string } | null>(() => {
  const id = batchCreateForm.folderId
  if (!id) return null
  return batchCreateFolderOptions.value.find((f) => f.id === id) ?? null
})

function makeEmptyBatchRow(): BatchSecretRow {
  const values: Record<string, string> = {}
  // 给每个 env code 预填空串(不勾 = 空字符串)
  for (const envCode of batchCreateEnvCodes.value) {
    values[envCode] = ''
  }
  return {
    uid: `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    key: '',
    comment: '',
    values,
  }
}

function openBatchCreateSecret(): void {
  if (!has(Permission.SecretCreate)) {
    ElMessage.warning('当前账号没有 secret:create 权限')
    return
  }
  if (!selectedFolderNode.value) {
    ElMessage.warning('请先选择一个目录')
    return
  }
  // env 列头 = 当前选中 folder 的 envList(每条带 code,就是 column header)
  batchCreateEnvCodes.value = selectedFolderNode.value.envList
    .map((b) => envOptions.value.find((e) => e.id === b.id)?.code)
    .filter((c): c is string => !!c)
  if (batchCreateEnvCodes.value.length === 0) {
    ElMessage.warning('当前目录尚未挂载到任何环境,无法批量创建 secret')
    return
  }
  batchCreateForm.folderId = selectedFolderNode.value.id
  batchCreateForm.rows = [makeEmptyBatchRow()]
  batchCreateFormRef.value?.clearValidate()
  batchCreateDialogVisible.value = true
}

function addBatchRow(): void {
  batchCreateForm.rows.push(makeEmptyBatchRow())
}

function removeBatchRow(uid: string): void {
  // 至少保留 1 行
  if (batchCreateForm.rows.length <= 1) return
  const idx = batchCreateForm.rows.findIndex((r) => r.uid === uid)
  if (idx >= 0) batchCreateForm.rows.splice(idx, 1)
}

async function onBatchCreateSubmit(): Promise<void> {
  if (!batchCreateFormRef.value) return
  const valid = await batchCreateFormRef.value.validate().catch(() => false)
  if (!valid) return

  // 行级校验:key 必填 + 格式 + 互不重复;每行至少有一个 env 填了非空 value;
  // 每个非空 value 长度兜底。
  const seen = new Set<string>()
  for (let i = 0; i < batchCreateForm.rows.length; i++) {
    const row = batchCreateForm.rows[i]
    if (!row) continue
    const k = row.key.trim()
    if (!k) {
      ElMessage.error(`第 ${i + 1} 行:key 不能为空`)
      return
    }
    if (!/^[A-Z][A-Z0-9_]*$/.test(k)) {
      ElMessage.error(`第 ${i + 1} 行:key "${k}" 格式不正确(大写字母/数字/下划线,以字母开头)`)
      return
    }
    if (seen.has(k)) {
      ElMessage.error(`第 ${i + 1} 行:key "${k}" 重复`)
      return
    }
    seen.add(k)
    // value 长度兜底
    for (const [envCode, val] of Object.entries(row.values)) {
      if (val.length > 8192) {
        ElMessage.error(`第 ${i + 1} 行 ${envCode} value 长度不能超过 8192`)
        return
      }
    }
    if ((row.comment ?? '').length > 256) {
      ElMessage.error(`第 ${i + 1} 行说明长度不能超过 256`)
      return
    }
  }

  // picked folder:从 batchCreateForm.folderId 反查
  const picked = batchCreateFolderOptions.value.find(
    (f) => f.id === batchCreateForm.folderId,
  )
  if (!picked) {
    ElMessage.error('所选目录无效,请重新选择')
    return
  }

  batchCreateSubmitting.value = true
  try {
    // picked.envList 是 FolderEnvBinding[];同一逻辑 folder 在不同 env 下
    // folderId 不同,上送时必须按 env code 查到对应的 env 专属 folderId。
    const envBindingByCode = new Map(picked.envList.map((b) => [b.code, b]))
    const req: BatchCreateSecretsRequest = {
      secretList: batchCreateForm.rows.map((row) => {
        const item: BatchSecretItem = {
          key: row.key.trim(),
        }
        const trimmedComment = row.comment?.trim()
        if (trimmedComment) item.comment = trimmedComment
        // 每个 env 都按 code 上送(空 value 也传空串,让后端决定如何处理 —— 不在客户端"跳过"任何 env)
        for (const envCode of batchCreateEnvCodes.value) {
          const value = row.values[envCode] ?? ''
          const binding = envBindingByCode.get(envCode)
          if (binding) {
            item[envCode] = { folderId: binding.folderId, value }
          }
        }
        return item
      }),
    }
    await secretStore.batchCreate(req)
    ElMessage.success('创建成功')
    batchCreateDialogVisible.value = false
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : '创建失败'
    ElMessage.error(msg)
  } finally {
    batchCreateSubmitting.value = false
  }
}

// ==================== 查看 secret 明文 ====================
const revealDialogVisible = ref(false)
const revealLoading = ref(false)
const revealVisible = ref(false)
const revealTarget = ref<SecretMeta | null>(null)
const revealValue = ref<string>('')
const revealVersion = ref<number>(0)

async function openReveal(row: SecretMeta): Promise<void> {
  if (!has(Permission.SecretReveal)) {
    ElMessage.warning('当前账号没有查看明文权限')
    return
  }
  revealTarget.value = row
  revealValue.value = ''
  revealVersion.value = row.version
  revealVisible.value = false
  revealDialogVisible.value = true
  revealLoading.value = true
  try {
    const resp = await secretStore.fetchReveal({ id: row.id })
    revealValue.value = resp.value
    revealVersion.value = resp.version
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : '查看失败'
    ElMessage.error(msg)
    revealDialogVisible.value = false
  } finally {
    revealLoading.value = false
  }
}

async function copyReveal(): Promise<void> {
  if (!revealValue.value) return
  try {
    await navigator.clipboard.writeText(revealValue.value)
    ElMessage.success('已复制到剪贴板')
  } catch {
    ElMessage.error('复制失败,请手动复制')
  }
}

// ==================== 编辑 secret ====================
//
// key 不可修改 — 在 folder 内是稳定标识,改名需要走 create+delete 流程。
// value 留空表示不轮换;comment 始终参与更新(可清空)。
const editSecretDialogVisible = ref(false)
const editSecretSubmitting = ref(false)
const editSecretFormRef = ref<FormInstance>()
const editSecretTarget = ref<SecretMeta | null>(null)

const editSecretForm = reactive<{
  id: string
  key: string
  value: string
  comment: string
  valueVisible: boolean
}>({
  id: '',
  key: '',
  value: '',
  comment: '',
  valueVisible: false,
})

const editSecretRules: FormRules<{
  id: string
  key: string
  value: string
  comment: string
}> = {
  id: [{ required: true, message: '缺少 secret id', trigger: 'change' }],
  key: [
    { required: true, message: '缺少 key', trigger: 'change' },
    {
      pattern: /^[A-Z][A-Z0-9_]*$/,
      message: '仅大写字母、数字、下划线,且以字母开头',
      trigger: 'change',
    },
  ],
  value: [{ max: 8192, message: '长度不能超过 8192', trigger: 'blur' }],
  comment: [{ max: 256, message: '长度不能超过 256', trigger: 'blur' }],
}

function resetEditSecretForm(): void {
  editSecretForm.id = ''
  editSecretForm.key = ''
  editSecretForm.value = ''
  editSecretForm.comment = ''
  editSecretForm.valueVisible = false
  editSecretFormRef.value?.clearValidate()
}

function openEditSecret(row: SecretMeta): void {
  editSecretTarget.value = row
  editSecretForm.id = row.id
  editSecretForm.key = row.key
  // value 不预填 — 留空表示不轮换,避免误把原值覆盖
  editSecretForm.value = ''
  editSecretForm.comment = row.comment ?? ''
  editSecretForm.valueVisible = false
  editSecretFormRef.value?.clearValidate()
  editSecretDialogVisible.value = true
}

async function onEditSecretSubmit(): Promise<void> {
  if (!editSecretFormRef.value) return
  // 函数级最后一道闸门:即使 UI 状态被绕过(脚本/DOM/调试器),也拒绝提交
  if (!has(Permission.SecretUpdate)) {
    ElMessage.warning('当前账号没有 secret:update 权限')
    return
  }
  const valid = await editSecretFormRef.value.validate().catch(() => false)
  if (!valid) return
  editSecretSubmitting.value = true
  try {
    const req: UpdateSecretRequest = {
      id: editSecretForm.id,
      comment: editSecretForm.comment ?? '',
    }
    if (editSecretForm.value.length > 0) {
      req.value = editSecretForm.value
    }
    await secretStore.update(req)
    ElMessage.success('更新成功')
    editSecretDialogVisible.value = false
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : '更新失败'
    ElMessage.error(msg)
  } finally {
    editSecretSubmitting.value = false
  }
}

// ==================== 整体刷新 ====================
async function refreshAll(): Promise<void> {
  // 新数据模型:一次刷新整棵 folder 树
  await loadFolderTree()
  selectedFolderNode.value = null
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
    await envStore.fetchList({ projectId: projectId.value, pageNum: 1, pageSize: 100 })
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
        <el-button :icon="Refresh" :disabled="!projectId" @click="refreshAll">
          刷新
        </el-button>
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
              folderTree.length === 0
                ? '该项目下暂无目录,点击上方「新建顶级」创建'
                : '暂无数据'
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
          <!-- 返回按钮 -->
          <header class="detail-back">
            <el-button text :icon="ArrowLeft" @click="onBackToList">
              返回目录列表
            </el-button>
          </header>


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
                    @click="onTreeNodeClick(findFolderNode(folderTree, c.id)?.node ?? selectedFolderNode)"
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
                    size="small"
                    :icon="Edit"
                    :disabled="!has(Permission.FolderUpdate)"
                    @click="openEditFolder(selectedFolderNode)"
                  >
                    编辑目录
                  </el-button>
                  <el-button
                    type="danger"
                    size="small"
                    :icon="Delete"
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
                    :title="`env 专属 folderId: ${binding.folderId}`"
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
                <el-table-column
                  prop="comment"
                  label="说明"
                  min-width="200"
                  show-overflow-tooltip
                >
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
                <p v-else>
                  该 L1 目录下还没有子目录,点击右上「新建子目录」开始创建。
                </p>
              </div>
            </section>

            <!-- Secrets Tab -->
            <section v-show="activeTab === 'secrets'" class="tab-pane">
              <div class="tab-pane__bar">
                <div class="tab-pane__title">
                  当前目录密钥
                  <span class="tab-pane__count">{{ secretStore.total }}</span>
                </div>
                <div class="tab-pane__actions">
                  <el-button
                    type="primary"
                    size="small"
                    :icon="Plus"
                    :disabled="selectedFolderNode.envList.length === 0 || !has(Permission.SecretCreate)"
                    :title="!has(Permission.SecretCreate) ? '当前账号没有 secret:create 权限' : ''"
                    @click="openBatchCreateSecret"
                  >
                    新建密钥
                  </el-button>
                </div>
              </div>

              <el-table
                v-loading="secretStore.loading"
                :data="secretStore.items"
                class="secret-table"
                empty-text="该目录下还没有密钥,点击右上「新建密钥」开始"
              >
                <el-table-column prop="key" label="Key" min-width="220">
                  <template #default="{ row }">
                    <span class="secret-key">
                      <el-icon class="secret-key__icon"><KeyIcon /></el-icon>
                      {{ row.key }}
                    </span>
                  </template>
                </el-table-column>
                <el-table-column prop="comment" label="说明" min-width="220" show-overflow-tooltip>
                  <template #default="{ row }">
                    <span class="muted">{{ row.comment || '—' }}</span>
                  </template>
                </el-table-column>
                <el-table-column label="版本" width="80">
                  <template #default="{ row }">
                    <el-tag size="small" effect="light" type="info">v{{ row.version }}</el-tag>
                  </template>
                </el-table-column>
                <el-table-column label="更新时间" min-width="160">
                  <template #default="{ row }">
                    <span class="muted">{{ formatDateTime(row.updatedAt) }}</span>
                  </template>
                </el-table-column>
                <el-table-column label="操作" width="180" fixed="right">
                  <template #default="{ row }">
                    <el-button
                      link
                      type="primary"
                      :icon="Edit"
                      :disabled="!has(Permission.SecretUpdate)"
                      @click="openEditSecret(row as SecretMeta)"
                    >
                      编辑
                    </el-button>
                    <el-button
                      link
                      type="primary"
                      :icon="View"
                      :disabled="!has(Permission.SecretReveal)"
                      @click="openReveal(row as SecretMeta)"
                    >
                      查看值
                    </el-button>
                  </template>
                </el-table-column>
              </el-table>

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

        <el-form-item
          v-if="createFolderForm.level === 2"
          label="父级 code"
          prop="parentCode"
        >
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
        <el-form-item
          v-if="!createFolderForm.code && createFolderForm.level === 1"
          label="预设"
        >
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
      </el-form>
      <template #footer>
        <el-button @click="createFolderDialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="createFolderSubmitting"
          @click="onCreateFolderSubmit"
        >
          创建
        </el-button>
      </template>
    </el-dialog>

    <!-- 批量新建 secret Dialog -->
    <el-dialog
      v-model="batchCreateDialogVisible"
      width="960px"
      :close-on-click-modal="false"
      title="批量新建密钥"
      top="6vh"
    >
      <el-form
        ref="batchCreateFormRef"
        :model="batchCreateForm"
        :rules="batchCreateRules"
        label-position="top"
      >
        <el-form-item label="所属目录" prop="folderId">
          <!-- 当前页面已选中了 folder,弹窗内只展示、不可修改 -->
          <div v-if="batchCreateSelectedFolder" class="proj-detail__folder-readonly">
            <el-icon class="proj-detail__folder-icon"><FolderIcon /></el-icon>
            <span class="proj-detail__folder-name">{{ batchCreateSelectedFolder.name }}</span>
            <code class="proj-detail__folder-code">{{ batchCreateSelectedFolder.code }}</code>
            <el-tag size="small" type="info" effect="plain" class="proj-detail__folder-locked">
              <el-icon><Lock /></el-icon>
              锁定
            </el-tag>
          </div>
          <span v-else class="muted">未选择目录</span>
          <div class="form-hint">
            folder 名字在已勾选环境间共享;每个 env 下若找不到同名 folder,该 env 将跳过创建。
          </div>
          <!-- folderId 仍要走表单校验,这里用隐藏 input 维持 v-model -->
          <input type="hidden" :value="batchCreateForm.folderId" />
        </el-form-item>

        <div class="batch-form">
          <!-- 行(card 样式):顶部 key+说明+删除,下方 env inputs 自动换行网格 -->
          <div
            v-for="(row, idx) in batchCreateForm.rows"
            :key="row.uid"
            class="batch-form__row"
          >
            <div class="batch-form__row-head">
              <el-input
                v-model="row.key"
                :placeholder="idx === 0 ? 'DATABASE_URL' : 'KEY'"
                :prefix-icon="KeyIcon"
                class="batch-form__key"
              />
              <el-input
                v-model="row.comment"
                type="textarea"
                :rows="1"
                :autosize="{ minRows: 1, maxRows: 3 }"
                placeholder="说明(可选)"
                class="batch-form__comment"
              />
              <el-button
                :icon="Delete"
                size="small"
                :disabled="batchCreateForm.rows.length <= 1"
                class="batch-form__action"
                @click="removeBatchRow(row.uid)"
              />
            </div>
            <div class="batch-form__envs">
              <div
                v-for="envCode in batchCreateEnvCodes"
                :key="envCode"
                class="batch-form__env-cell"
              >
                <label class="batch-form__env-label">{{ envCode }}</label>
                <el-input
                  v-model="row.values[envCode]"
                  type="password"
                  show-password
                  :placeholder="`${envCode} 的值(留空 = 跳过该 env)`"
                  autocomplete="new-password"
                />
              </div>
            </div>
          </div>
        </div>

        <div class="batch-form__footer">
          <el-button :icon="Plus" plain @click="addBatchRow">添加一行</el-button>
          <span class="batch-form__hint">
            每行 = 一个密钥定义;key 在 folder 内唯一;每个 env 一个输入框,
            留空也按 env code 上送(value 为空串),由后端决定如何处理。
            输入框 ≥ 280px,env 多时自动换行。
          </span>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="batchCreateDialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="batchCreateSubmitting"
          @click="onBatchCreateSubmit"
        >
          创建
          <el-icon class="el-icon--right"><ArrowRight /></el-icon>
        </el-button>
      </template>
    </el-dialog>

    <!-- 查看 secret 明文 Dialog -->
    <el-dialog
      v-model="revealDialogVisible"
      width="560px"
      :close-on-click-modal="false"
      title="查看密钥值"
    >
      <div v-if="revealTarget" class="reveal">
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="Key">
            <span class="secret-key">{{ revealTarget.key }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="版本">
            <el-tag size="small" effect="light" type="info">v{{ revealVersion }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="Value">
            <div v-if="revealLoading" class="reveal__loading">加载中...</div>
            <div v-else class="reveal__value">
              <el-input
                :model-value="revealVisible ? revealValue : maskSecret(revealValue)"
                :type="revealVisible ? 'textarea' : 'password'"
                readonly
                :rows="revealVisible ? 4 : 1"
                :autosize="revealVisible ? { minRows: 4 } : undefined"
              />
              <div class="reveal__actions">
                <el-button
                  size="small"
                  :icon="revealVisible ? Hide : View"
                  :disabled="!has(Permission.SecretReveal)"
                  @click="revealVisible = !revealVisible"
                >
                  {{ revealVisible ? '隐藏' : '显示' }}
                </el-button>
                <el-button
                  size="small"
                  type="primary"
                  :icon="CopyDocument"
                  :disabled="!has(Permission.SecretReveal)"
                  @click="copyReveal"
                >
                  复制
                </el-button>
              </div>
            </div>
          </el-descriptions-item>
          <el-descriptions-item label="说明">
            {{ revealTarget.comment || '—' }}
          </el-descriptions-item>
        </el-descriptions>
        <p class="reveal__warn">
          <el-icon><Hide /></el-icon>
          请妥善处理明文,避免在截图、日志、聊天中泄露。
        </p>
      </div>
      <template #footer>
        <el-button @click="revealDialogVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- 编辑 secret Dialog -->
    <el-dialog
      v-model="editSecretDialogVisible"
      width="560px"
      :close-on-click-modal="false"
      title="编辑密钥"
      @closed="resetEditSecretForm"
    >
      <el-form
        ref="editSecretFormRef"
        :model="editSecretForm"
        :rules="editSecretRules"
        label-position="top"
      >
        <el-form-item label="Key" prop="key">
          <!--
            key 在 folder 内是稳定标识,任何人都不能改 — 写死 disabled
            (不受权限影响)
          -->
          <el-input
            v-model="editSecretForm.key"
            disabled
            :prefix-icon="KeyIcon"
            placeholder="key 在 folder 内是稳定标识,不可修改"
          />
        </el-form-item>
        <el-form-item label="Value" prop="value">
          <el-input
            v-model="editSecretForm.value"
            :type="editSecretForm.valueVisible ? 'textarea' : 'password'"
            :rows="editSecretForm.valueVisible ? 4 : 1"
            :disabled="!has(Permission.SecretUpdate)"
            placeholder="留空表示不轮换现有值;填写后会覆盖并 version+1"
            show-password
          />
          <div class="form-hint">留空 = 保留原值;需要修改时才填写。</div>
        </el-form-item>
        <el-form-item label="说明" prop="comment">
          <el-input
            v-model="editSecretForm.comment"
            type="textarea"
            :rows="2"
            :disabled="!has(Permission.SecretUpdate)"
            placeholder="可清空"
          />
        </el-form-item>
        <p v-if="!has(Permission.SecretUpdate)" class="form-hint">
          当前账号没有 <code>secret:update</code> 权限,无法修改 value / 说明。
        </p>
      </el-form>
      <template #footer>
        <el-button @click="editSecretDialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="editSecretSubmitting"
          :disabled="!has(Permission.SecretUpdate)"
          @click="onEditSecretSubmit"
        >
          保存
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

.detail-back {
  display: flex;
  align-items: center;
  padding: 4px 0 0;
}

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
    transition: background 0.15s ease, color 0.15s ease;

    &:hover:not(.crumb__item--current):not(.is-disabled) {
      background: var(--v-surface-row-hover);
      color: var(--el-color-primary);
    }

    &--root {
      color: var(--el-color-primary);
      font-weight: 500;
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
  grid-template-columns: 1fr 1.4fr 36px;  // key / 说明 / 删除
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
.reveal {
  display: flex;
  flex-direction: column;
  gap: 12px;

  &__loading {
    color: var(--v-text-tertiary);
    font-size: 13px;
    padding: 8px 0;
  }

  &__value {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  &__actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  &__warn {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    color: var(--v-color-warning);
    font-size: 12px;
  }
}

code {
  font-family: var(--el-font-family-monospace, ui-monospace, monospace);
  font-size: 0.92em;
  background: var(--v-fill-color-light, #f4f4f5);
  padding: 0 4px;
  border-radius: 3px;
}
</style>
