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
  CircleClose,
  Connection,
  CopyDocument,
  Delete,
  Document,
  Edit,
  Folder as FolderIcon,
  FolderOpened,
  Hide,
  InfoFilled,
  Key as KeyIcon,
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
import { listFolders, createFolder, deleteFolder, updateFolder } from '@/api/folder'
import type { Environment } from '@/types/env'
import type { Folder, FolderLevel } from '@/types/folder'
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

// ==================== env 多选 ====================
const envOptions = computed<Environment[]>(() =>
  envStore.items.filter((e) => getEnvProjectId(e) === projectId.value),
)
/** 已勾选要展示的 env 列表 */
const checkedEnvIds = ref<string[]>([])

/** 一个 env 的本地 folder 树:L1 + 已懒加载的 L2 */
interface EnvTree {
  loading: boolean
  roots: Folder[]
  /** L1.id -> L2 children(已加载过的) */
  childrenById: Map<string, Folder[]>
  /** 哪些 L1 节点目前展开了(显示其 L2) */
  expandedIds: Set<string>
}
/** envId -> 该 env 下的 folder 树 */
const treesByEnv = ref<Map<string, EnvTree>>(new Map())

function ensureEnvTree(envId: string): EnvTree {
  let t = treesByEnv.value.get(envId)
  if (!t) {
    t = {
      loading: false,
      roots: [],
      childrenById: new Map(),
      expandedIds: new Set(),
    }
    const next = new Map(treesByEnv.value)
    next.set(envId, t)
    treesByEnv.value = next
  }
  return t
}

async function loadEnvRoots(envId: string): Promise<void> {
  const tree = ensureEnvTree(envId)
  // 已加载过的 env 不再重拉(刷新按钮另走)
  if (tree.roots.length > 0 || tree.loading) return
  tree.loading = true
  // 触发响应式
  treesByEnv.value = new Map(treesByEnv.value)
  try {
    // includeSubfolders: true → 一次拿到 L1 + 各自的 L2 children
    const resp = await listFolders({
      environmentId: envId,
      includeSubfolders: true,
      pageNum: 1,
      pageSize: 100,
    })
    const list = (resp.total > 0 ? resp.list : null) ?? []
    tree.roots = list.map((f) => ({ ...f, level: 1 as const }))
    // 把 L1 的 subfolders 同步写进 childrenById,展开/选中直接用
    tree.childrenById.clear()
    for (const l1 of list) {
      const children = (l1.subfolders ?? []).map((c) => ({
        ...c,
        level: 2 as const,
        environmentId: envId,
      }))
      if (children.length > 0) {
        tree.childrenById.set(l1.id, children)
      }
    }
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : '加载目录失败'
    ElMessage.error(msg)
  } finally {
    tree.loading = false
    treesByEnv.value = new Map(treesByEnv.value)
  }
}

/** 整棵 env tree 重新拉取(L1 + 全部 L2)。用于 create/delete folder 后的刷新。 */
async function refreshEnvTree(envId: string): Promise<void> {
  const tree = ensureEnvTree(envId)
  tree.roots = []
  tree.childrenById.clear()
  tree.expandedIds.clear()
  await loadEnvRoots(envId)
}

function onToggleExpand(envId: string, folder: Folder): void {
  // L2 children 已随 L1 一起加载,展开/折叠不再发请求
  const tree = ensureEnvTree(envId)
  if (tree.expandedIds.has(folder.id)) {
    tree.expandedIds.delete(folder.id)
  } else {
    tree.expandedIds.add(folder.id)
  }
  treesByEnv.value = new Map(treesByEnv.value)
}

async function onCheckedEnvsChange(ids: string[]): Promise<void> {
  // 新勾选的 env 自动加载 root folders
  for (const envId of ids) {
    if (!treesByEnv.value.has(envId) || treesByEnv.value.get(envId)!.roots.length === 0) {
      void loadEnvRoots(envId)
    }
  }
  // 取消勾选时,若当前选中的 folder 属于该 env,清空选中
  if (selectedFolder.value && !ids.includes(selectedFolder.value.environmentId)) {
    selectedFolder.value = null
    activeTab.value = 'secrets'
  }
}

// ==================== 选中 ====================
/** 当前选中的 folder(同时只能选一个,横跨所有 env) */
const selectedFolder = ref<Folder | null>(null)

async function onSelectFolder(envId: string, folder: Folder): Promise<void> {
  selectedFolder.value = folder
  // 切到选中的 env,确保对应树存在
  ensureEnvTree(envId)
  // 切换 folder 时,默认回到 Secrets tab,并按当前 folder 拉 secret
  activeTab.value = 'secrets'
  await loadSecretsOfCurrent()
}

/** breadcrumb: env > L1 > [L2] */
const breadcrumb = computed<Array<{ id: string; name: string; type: 'env' | 'folder' }>>(() => {
  if (!selectedFolder.value) return []
  const result: Array<{ id: string; name: string; type: 'env' | 'folder' }> = []
  const envId = selectedFolder.value.environmentId
  const env = envOptions.value.find((e) => e.id === envId)
  if (env) result.push({ id: env.id, name: env.name, type: 'env' })
  if (selectedFolder.value.level === 2) {
    const tree = treesByEnv.value.get(envId)
    const parent = tree?.roots.find((f) => f.id === selectedFolder.value!.parentId)
    if (parent) result.push({ id: parent.id, name: parent.name, type: 'folder' })
  }
  result.push({
    id: selectedFolder.value.id,
    name: selectedFolder.value.name,
    type: 'folder',
  })
  return result
})

// ==================== Tab ====================
type TabKey = 'secrets' | 'info'
const activeTab = ref<TabKey>('secrets')

// ==================== Secret 列表 ====================
async function loadSecretsOfCurrent(): Promise<void> {
  if (!selectedFolder.value) {
    secretStore.clear()
    return
  }
  try {
    await secretStore.fetchList({
      folderId: selectedFolder.value.id,
      pageNum: 1,
      pageSize: secretStore.lastQuery.pageSize ?? 20,
    })
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : '加载密钥失败'
    ElMessage.error(msg)
  }
}

function onSecretPageChange(pageNum: number, pageSize: number): void {
  if (!selectedFolder.value) return
  secretStore
    .fetchList({ folderId: selectedFolder.value.id, pageNum, pageSize })
    .catch((e: unknown) => {
      const msg = e instanceof ApiError ? e.message : '加载失败'
      ElMessage.error(msg)
    })
}

// ==================== 创建 folder ====================
const createFolderDialogVisible = ref(false)
const createFolderSubmitting = ref(false)
const createFolderFormRef = ref<FormInstance>()
const createFolderTarget = ref<{
  envId: string
  level: FolderLevel
  parentId: string
} | null>(null)

const createFolderForm = reactive<{ code: string; name: string; comment: string }>({
  code: '',
  name: '',
  comment: '',
})

const createFolderRules: FormRules<typeof createFolderForm> = {
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

function resetCreateFolderForm(): void {
  createFolderForm.code = ''
  createFolderForm.name = ''
  createFolderForm.comment = ''
  createFolderFormRef.value?.clearValidate()
}

function openCreateRootFolder(envId: string): void {
  createFolderTarget.value = { envId, level: 1, parentId: envId }
  resetCreateFolderForm()
  createFolderDialogVisible.value = true
}

function openCreateChildFolder(envId: string, parent: Folder): void {
  createFolderTarget.value = { envId, level: 2, parentId: parent.id }
  resetCreateFolderForm()
  createFolderDialogVisible.value = true
}

async function onCreateFolderSubmit(): Promise<void> {
  if (!createFolderFormRef.value || !createFolderTarget.value) return
  const valid = await createFolderFormRef.value.validate().catch(() => false)
  if (!valid) return
  createFolderSubmitting.value = true
  try {
    const t = createFolderTarget.value
    await createFolder({
      level: t.level,
      parentId: t.parentId,
      code: createFolderForm.code,
      name: createFolderForm.name,
      comment: createFolderForm.comment || undefined,
    })
    ElMessage.success('创建成功')
    createFolderDialogVisible.value = false
    // 刷新整棵 env 树,再把父 L1 自动展开(L2 新建场景)
    await refreshEnvTree(t.envId)
    if (t.level === 2) {
      const refreshed = ensureEnvTree(t.envId)
      refreshed.expandedIds.add(t.parentId)
      treesByEnv.value = new Map(treesByEnv.value)
    }
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : '创建失败'
    ElMessage.error(msg)
  } finally {
    createFolderSubmitting.value = false
  }
}

// ==================== 删除 folder ====================
async function onDeleteFolder(envId: string, folder: Folder): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确定要删除目录 "${folder.name} (${folder.code})" 吗?\n该目录及其下所有密钥都会被软删除。`,
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
    if (selectedFolder.value?.id === folder.id) {
      selectedFolder.value = null
    }
    // 整棵 env 树重新拉取,确保父 L1 和兄弟 L2 数据一致
    await refreshEnvTree(envId)
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
const editFolderTarget = ref<Folder | null>(null)

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

function openEditFolder(folder: Folder): void {
  editFolderTarget.value = folder
  editFolderForm.id = folder.id
  editFolderForm.code = folder.code
  editFolderForm.name = folder.name
  editFolderForm.comment = folder.comment ?? ''
  editFolderFormRef.value?.clearValidate()
  editFolderDialogVisible.value = true
}

async function onEditFolderSubmit(): Promise<void> {
  if (!editFolderFormRef.value) return
  const valid = await editFolderFormRef.value.validate().catch(() => false)
  if (!valid) return
  editFolderSubmitting.value = true
  try {
    const updated = await updateFolder({
      id: editFolderForm.id,
      name: editFolderForm.name.trim(),
      comment: editFolderForm.comment?.trim() || undefined,
    })
    ElMessage.success('更新成功')
    editFolderDialogVisible.value = false
    // 同步本地 treesByEnv 中对应 folder 的 name/comment
    if (selectedFolder.value && selectedFolder.value.id === updated.id) {
      selectedFolder.value = {
        ...selectedFolder.value,
        name: updated.name,
        comment: updated.comment,
        updatedAt: updated.updatedAt,
        updatedBy: updated.updatedBy,
        updatedByLabel: updated.updatedByLabel,
      }
    }
    const tree = ensureEnvTree(updated.environmentId)
    if (updated.level === 1) {
      const idx = tree.roots.findIndex((f) => f.id === updated.id)
      if (idx >= 0) {
        tree.roots[idx] = { ...tree.roots[idx], ...updated, level: 1 as const }
      }
    } else {
      // L2:在某个 L1 的 childrenById 里
      for (const [parentId, children] of tree.childrenById.entries()) {
        const idx = children.findIndex((f) => f.id === updated.id)
        if (idx >= 0) {
          children[idx] = { ...children[idx], ...updated, level: 2 as const }
          tree.childrenById.set(parentId, children)
          break
        }
      }
    }
    treesByEnv.value = new Map(treesByEnv.value)
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : '更新失败'
    ElMessage.error(msg)
  } finally {
    editFolderSubmitting.value = false
  }
}

// ==================== 批量创建 secret ====================
//
// 一张表只属于一个 folder,下面多行 [key, value-per-env, comment]。
// value 列数 = 上方 env 多选里勾选的环境数,表头用 env.code 标识(envCode = value map 的 key)。
// 打开时快照 envCode 列表,关闭前 env 多选变化也不会影响已开的对话框。
const batchCreateDialogVisible = ref(false)
const batchCreateSubmitting = ref(false)
const batchCreateFormRef = ref<FormInstance>()
/** 打开对话框时由上方 env 多选快照,作为 value 列的列头 */
const batchCreateEnvCodes = ref<string[]>([])

interface BatchSecretRow {
  /** v-for 的稳定 key,加这个是因为 row.key 在用户编辑过程中可能为空 */
  uid: string
  key: string
  comment: string
  /** envCode -> 明文 value。空字符串表示"不为该 env 创建 secret" */
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

/**
 * 列出当前已勾选 env 下的所有 L1 folder,按 code 去重(同名 folder 跨 env 只展示一次)。
 * 不区分 env —— UI 上只暴露 folder 名字,具体每个 env 的 folderId 在提交时按
 * picked folder 的 name/code 在每个 env 的 tree 里反查得出。
 */
const batchCreateFolderOptions = computed<Folder[]>(() => {
  const seen = new Set<string>()
  const result: Folder[] = []
  for (const envId of checkedEnvIds.value) {
    const tree = treesByEnv.value.get(envId)
    if (!tree) continue
    for (const l1 of tree.roots) {
      if (!seen.has(l1.code)) {
        seen.add(l1.code)
        result.push(l1)
      }
    }
  }
  return result
})

/**
 * 给定 picked folder(L1),在每个 checked env 的 tree 里按 name/code 反查对应的 folderId。
 * 返回:
 *  - envFolderIdMap: envCode -> folderId(查到的)
 *  - envFolderMissing: 查不到的 envCode 列表
 */
function resolveEnvFolderIds(picked: Folder): {
  envFolderIdMap: Record<string, string>
  envFolderMissing: string[]
} {
  const envFolderIdMap: Record<string, string> = {}
  const envFolderMissing: string[] = []
  for (const envId of checkedEnvIds.value) {
    const env = envOptions.value.find((e) => e.id === envId)
    if (!env) continue
    const tree = treesByEnv.value.get(envId)
    if (!tree) {
      envFolderMissing.push(env.code)
      continue
    }
    let resolved: string | undefined
    for (const l1 of tree.roots) {
      if (l1.name === picked.name || l1.code === picked.code) {
        resolved = l1.id
        break
      }
    }
    if (resolved) envFolderIdMap[env.code] = resolved
    else envFolderMissing.push(env.code)
  }
  return { envFolderIdMap, envFolderMissing }
}

function makeEmptyBatchRow(): BatchSecretRow {
  const values: Record<string, string> = {}
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
  if (!selectedFolder.value) {
    ElMessage.warning('请先选择一个目录')
    return
  }
  if (checkedEnvIds.value.length === 0) {
    ElMessage.warning('请先勾选至少一个环境')
    return
  }
  // 快照 envCodes(关弹窗前 env 多选变化不影响当前弹窗)
  batchCreateEnvCodes.value = checkedEnvIds.value
    .map((id) => envOptions.value.find((e) => e.id === id)?.code)
    .filter((c): c is string => !!c)
  // 默认预填当前选中的 folder
  batchCreateForm.folderId = selectedFolder.value.id
  // 起始 1 行(用户可加)
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

  // 行级校验:key 必填 + 格式 + 互不重复
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
    // comment 长度兜底
    if ((row.comment ?? '').length > 256) {
      ElMessage.error(`第 ${i + 1} 行说明长度不能超过 256`)
      return
    }
  }

  // 跨 env 解析 folderId:picked folder 只对应一个 L1 名字,
  // 每个 env 在该名字下可能/没有同名 folder,反查不到则跳过该 env。
  const picked = batchCreateFolderOptions.value.find(
    (f) => f.id === batchCreateForm.folderId,
  )
  if (!picked) {
    ElMessage.error('所选目录无效,请重新选择')
    return
  }
  const { envFolderIdMap, envFolderMissing } = resolveEnvFolderIds(picked)

  // 反查不到的 env 给用户最后一次确认机会
  if (envFolderMissing.length > 0) {
    try {
      await ElMessageBox.confirm(
        `以下环境未找到同名目录 "${picked.name}",将为这些环境跳过创建:\n${envFolderMissing.join(', ')}`,
        '部分环境跳过',
        { type: 'warning', confirmButtonText: '继续创建', cancelButtonText: '取消' },
      )
    } catch {
      return // 取消
    }
  }

  // 至少要有一个 env 能创建
  if (Object.keys(envFolderIdMap).length === 0) {
    ElMessage.error('所有勾选环境都未找到同名目录,无可创建的目标')
    return
  }

  batchCreateSubmitting.value = true
  try {
    const req: BatchCreateSecretsRequest = {
      secretList: batchCreateForm.rows.map((row) => {
        const item: BatchSecretItem = {
          key: row.key.trim(),
        }
        const trimmedComment = row.comment?.trim()
        if (trimmedComment) item.comment = trimmedComment
        // 遍历所有已快照的 envCode,把"value 非空 + folderId 存在"的挂上去
        for (const envCode of batchCreateEnvCodes.value) {
          const value = row.values[envCode]
          const folderId = envFolderIdMap[envCode]
          if (value && folderId) {
            item[envCode] = { folderId, value }
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
  // 刷新已勾选的所有 env 的目录树
  const envs = [...checkedEnvIds.value]
  for (const envId of envs) {
    await refreshEnvTree(envId)
  }
  // 当前选中的 folder 可能已不在新数据里,清空
  selectedFolder.value = null
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

  // 默认勾选第一个 env(若存在)
  if (envOptions.value.length > 0 && checkedEnvIds.value.length === 0) {
    const first = envOptions.value[0]
    if (first) {
      checkedEnvIds.value = [first.id]
      await loadEnvRoots(first.id)
    }
  }
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
        <el-button text :icon="ArrowLeft" @click="onBack">返回</el-button>
        <div class="proj-header__title-block">
          <h1 class="proj-header__title">
            {{ project?.name ?? '加载中...' }}
            <code v-if="project" class="proj-header__code">{{ project.code }}</code>
          </h1>
          <p v-if="project?.comment" class="proj-header__desc">{{ project.comment }}</p>
        </div>
      </div>
      <div class="proj-header__actions">
        <el-button :icon="Refresh" :disabled="checkedEnvIds.length === 0" @click="refreshAll">
          刷新
        </el-button>
      </div>
    </header>

    <!-- env 多选 -->
    <section class="env-bar">
      <span class="env-bar__label">
        <el-icon><Connection /></el-icon>
        环境
      </span>
      <div v-if="envOptions.length === 0" class="env-bar__empty">
        当前项目还没有环境,请到「环境管理」页创建。
      </div>
      <el-checkbox-group
        v-else
        v-model="checkedEnvIds"
        class="env-bar__group"
        @change="(v: (string | number | boolean)[]) => onCheckedEnvsChange(v.map(String))"
      >
        <el-checkbox
          v-for="e in envOptions"
          :key="e.id"
          :value="e.id"
          class="env-bar__chip"
          border
        >
          {{ e.name }}
          <span class="env-bar__chip-code">{{ e.code }}</span>
        </el-checkbox>
      </el-checkbox-group>
    </section>

    <!-- 主体:左侧目录(按 env 分组) + 右侧详情 -->
    <div v-if="checkedEnvIds.length === 0" class="proj-detail__hint">
      <el-icon><CircleClose /></el-icon>
      <span>请勾选至少一个环境,以浏览其下的目录和密钥。</span>
    </div>

    <div v-else class="proj-detail__body">
      <!-- 左栏:多 env 分组目录树 -->
      <aside class="tree-panel">
        <div
          v-for="envId in checkedEnvIds"
          :key="envId"
          class="env-tree"
        >
          <header class="env-tree__head">
            <span class="env-tree__name">
              <el-icon><Connection /></el-icon>
              {{ envOptions.find((e) => e.id === envId)?.name ?? envId }}
            </span>
            <el-button
              size="small"
              link
              type="primary"
              :icon="Plus"
              @click="openCreateRootFolder(envId)"
            >
              新建顶级
            </el-button>
          </header>
          <div v-loading="ensureEnvTree(envId).loading" class="env-tree__body">
            <div
              v-if="ensureEnvTree(envId).roots.length === 0 && !ensureEnvTree(envId).loading"
              class="env-tree__empty"
            >
              暂无顶级目录
            </div>
            <ul v-else class="tree">
              <li v-for="f in ensureEnvTree(envId).roots" :key="f.id">
                <div
                  class="tree__row"
                  :class="{ 'is-selected': selectedFolder?.id === f.id }"
                  @click="onSelectFolder(envId, f)"
                >
                  <el-icon
                    class="tree__toggle"
                    :class="{ 'is-expanded': ensureEnvTree(envId).expandedIds.has(f.id) }"
                    @click.stop="onToggleExpand(envId, f)"
                  >
                    <ArrowRight />
                  </el-icon>
                  <el-icon class="tree__icon">
                    <FolderOpened v-if="ensureEnvTree(envId).expandedIds.has(f.id)" />
                    <FolderIcon v-else />
                  </el-icon>
                  <span class="tree__name">{{ f.name }}</span>
                  <span class="tree__code">{{ f.code }}</span>
                </div>
                <ul
                  v-if="ensureEnvTree(envId).expandedIds.has(f.id)"
                  class="tree tree--child"
                >
                  <li
                    v-for="c in ensureEnvTree(envId).childrenById.get(f.id) ?? []"
                    :key="c.id"
                  >
                    <div
                      class="tree__row tree__row--child"
                      :class="{ 'is-selected': selectedFolder?.id === c.id }"
                      @click="onSelectFolder(envId, c)"
                    >
                      <el-icon class="tree__icon tree__icon--child">
                        <FolderIcon />
                      </el-icon>
                      <span class="tree__name">{{ c.name }}</span>
                      <span class="tree__code">{{ c.code }}</span>
                    </div>
                  </li>
                  <li
                    v-if="(ensureEnvTree(envId).childrenById.get(f.id)?.length ?? 0) === 0"
                    class="tree__empty-child"
                  >
                    无子目录
                  </li>
                </ul>
              </li>
            </ul>
          </div>
        </div>
      </aside>

      <!-- 右栏:详情面板 -->
      <main class="detail-panel">
        <!-- 未选目录 -->
        <section v-if="!selectedFolder" class="detail-empty">
          <el-icon class="detail-empty__icon"><Document /></el-icon>
          <h2>选择一个目录查看详情</h2>
          <p>从左侧任意一个环境的目录树中点选目录,即可查看其下的密钥与基础信息。</p>
        </section>

        <!-- 选中目录后:Tab 切换 -->
        <template v-else>
          <!-- 面包屑 + Tab -->
          <header class="detail-head">
            <nav class="crumb">
              <template v-for="(c, i) in breadcrumb" :key="c.id">
                <el-icon v-if="i > 0" class="crumb__sep">
                  <ArrowRight />
                </el-icon>
                <span
                  class="crumb__item"
                  :class="{
                    'crumb__item--env': c.type === 'env',
                    'crumb__item--current': i === breadcrumb.length - 1,
                  }"
                >
                  <el-icon v-if="c.type === 'env'"><Connection /></el-icon>
                  <el-icon v-else><FolderIcon /></el-icon>
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
                  :disabled="checkedEnvIds.length === 0"
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

          <!-- Folder 基础信息 Tab -->
          <section v-show="activeTab === 'info'" class="tab-pane">
            <div class="tab-pane__bar">
              <div class="tab-pane__title">
                {{ selectedFolder.name }}
                <el-tag
                  :type="selectedFolder.level === 1 ? 'primary' : 'info'"
                  size="small"
                  effect="light"
                  class="tab-pane__level-tag"
                >
                  L{{ selectedFolder.level }}
                </el-tag>
              </div>
              <div class="tab-pane__actions">
                <el-button
                  v-if="selectedFolder.level === 1"
                  type="primary"
                  size="small"
                  :icon="Plus"
                  @click="openCreateChildFolder(selectedFolder.environmentId, selectedFolder)"
                >
                  新建子目录
                </el-button>
                <el-button
                  type="primary"
                  size="small"
                  :icon="Edit"
                  :disabled="!has(Permission.FolderUpdate)"
                  @click="openEditFolder(selectedFolder)"
                >
                  编辑目录
                </el-button>
                <el-button
                  type="danger"
                  size="small"
                  :icon="Delete"
                  @click="onDeleteFolder(selectedFolder.environmentId, selectedFolder)"
                >
                  删除目录
                </el-button>
              </div>
            </div>

            <el-descriptions :column="2" border>
              <el-descriptions-item label="Code">
                <code class="mono">{{ selectedFolder.code }}</code>
              </el-descriptions-item>
              <el-descriptions-item label="层级">
                L{{ selectedFolder.level }}
              </el-descriptions-item>
              <el-descriptions-item label="所属环境">
                {{
                  envOptions.find((e) => e.id === selectedFolder!.environmentId)?.name ??
                  selectedFolder.environmentId
                }}
              </el-descriptions-item>
              <el-descriptions-item label="父目录">
                {{
                  selectedFolder.level === 1
                    ? '环境根'
                    : (treesByEnv
                        .get(selectedFolder.environmentId)
                        ?.roots.find((f) => f.id === selectedFolder!.parentId)?.name ?? '—')
                }}
              </el-descriptions-item>
              <el-descriptions-item label="创建人">
                {{ selectedFolder.createdByLabel || selectedFolder.createdBy }}
              </el-descriptions-item>
              <el-descriptions-item label="创建时间">
                {{ formatDateTime(selectedFolder.createdAt) }}
              </el-descriptions-item>
              <el-descriptions-item label="更新人">
                {{ selectedFolder.updatedByLabel || selectedFolder.updatedBy }}
              </el-descriptions-item>
              <el-descriptions-item label="更新时间">
                {{ formatDateTime(selectedFolder.updatedAt) }}
              </el-descriptions-item>
              <el-descriptions-item label="说明" :span="2">
                {{ selectedFolder.comment || '—' }}
              </el-descriptions-item>
              <el-descriptions-item label="ID" :span="2">
                <span class="mono mono--id">{{ selectedFolder.id }}</span>
              </el-descriptions-item>
            </el-descriptions>
          </section>
        </template>
      </main>
    </div>

    <!-- 新建 folder Dialog -->
    <el-dialog
      v-model="createFolderDialogVisible"
      width="480px"
      :close-on-click-modal="false"
      :title="createFolderTarget?.level === 1 ? '新建顶级目录' : '新建子目录'"
    >
      <el-form
        ref="createFolderFormRef"
        :model="createFolderForm"
        :rules="createFolderRules"
        label-position="top"
      >
        <el-form-item label="Code" prop="code">
          <el-input v-model="createFolderForm.code" placeholder="例如 globals / services" />
        </el-form-item>
        <el-form-item label="名称" prop="name">
          <el-input v-model="createFolderForm.name" placeholder="Globals" />
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
          <el-select
            v-model="batchCreateForm.folderId"
            placeholder="选择 folder(本批所有 secret 都放进这个 folder)"
            style="width: 100%"
            :disabled="batchCreateFolderOptions.length === 0"
          >
            <el-option
              v-for="f in batchCreateFolderOptions"
              :key="f.id"
              :value="f.id"
              :label="`${f.name} (${f.code})`"
            />
          </el-select>
          <div class="form-hint">
            folder 名字在已勾选环境间共享;每个 env 下若找不到同名 folder,该 env 将跳过创建。
          </div>
        </el-form-item>

        <div class="batch-form">
          <!-- 表头 -->
          <div class="batch-form__header" :style="{ '--env-cols': batchCreateEnvCodes.length }">
            <div class="batch-form__cell batch-form__cell--head">Key</div>
            <div
              v-for="envCode in batchCreateEnvCodes"
              :key="envCode"
              class="batch-form__cell batch-form__cell--head batch-form__cell--env"
              :title="envCode"
            >
              {{ envCode }}
            </div>
            <div class="batch-form__cell batch-form__cell--head batch-form__cell--comment">
              说明
            </div>
            <div class="batch-form__cell batch-form__cell--head batch-form__cell--action"></div>
          </div>
          <!-- 行 -->
          <div
            v-for="(row, idx) in batchCreateForm.rows"
            :key="row.uid"
            class="batch-form__row"
            :style="{ '--env-cols': batchCreateEnvCodes.length }"
          >
            <div class="batch-form__cell">
              <el-input
                v-model="row.key"
                :placeholder="idx === 0 ? 'DATABASE_URL' : 'KEY'"
                :prefix-icon="KeyIcon"
              />
            </div>
            <div
              v-for="envCode in batchCreateEnvCodes"
              :key="envCode"
              class="batch-form__cell"
            >
              <el-input
                v-model="row.values[envCode]"
                type="password"
                show-password
                :placeholder="envCode"
              />
            </div>
            <div class="batch-form__cell batch-form__cell--comment">
              <el-input
                v-model="row.comment"
                type="textarea"
                :rows="1"
                :autosize="{ minRows: 1, maxRows: 3 }"
                placeholder="可选"
              />
            </div>
            <div class="batch-form__cell batch-form__cell--action">
              <el-button
                :icon="Delete"
                size="small"
                :disabled="batchCreateForm.rows.length <= 1"
                @click="removeBatchRow(row.uid)"
              />
            </div>
          </div>
        </div>

        <div class="batch-form__footer">
          <el-button :icon="Plus" plain @click="addBatchRow">添加一行</el-button>
          <span class="batch-form__hint">
            每行 = 一个密钥定义;key 在 folder 内唯一;value 列按 env 留空 = 不为该 env 创建;
            同一 folder 在不同 env 下若重名,后端会按 env 拆分到各自的 folderId。
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
                  @click="revealVisible = !revealVisible"
                >
                  {{ revealVisible ? '隐藏' : '显示' }}
                </el-button>
                <el-button
                  size="small"
                  type="primary"
                  :icon="CopyDocument"
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
            placeholder="可清空"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editSecretDialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="editSecretSubmitting"
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
          <el-input
            v-model="editFolderForm.code"
            disabled
            placeholder="code 在 env 下是稳定标识,不可修改"
          />
        </el-form-item>
        <el-form-item label="名称" prop="name">
          <el-input
            v-model="editFolderForm.name"
            placeholder="Globals"
          />
        </el-form-item>
        <el-form-item label="说明" prop="comment">
          <el-input
            v-model="editFolderForm.comment"
            type="textarea"
            :rows="2"
            placeholder="可清空"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editFolderDialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="editFolderSubmitting"
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

// ---------------- env 多选 chip 区 ----------------
.env-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--v-surface-bg);
  border: 1px solid var(--v-surface-border);
  border-radius: var(--v-radius-lg);
  flex-wrap: wrap;

  &__label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--v-text-secondary);
    font-size: 13px;
    font-weight: 500;
    flex-shrink: 0;
  }

  &__empty {
    color: var(--v-text-tertiary);
    font-size: 13px;
  }

  &__group {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  &__chip {
    margin: 0 !important;
    height: 32px;

    :deep(.el-checkbox__label) {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
  }

  &__chip-code {
    font-family: var(--el-font-family-monospace, ui-monospace, monospace);
    font-size: 11px;
    color: var(--v-text-tertiary);
    margin-left: 4px;
  }
}

// ---------------- 左栏:tree-panel ----------------
.tree-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: calc(100vh - 280px);
  overflow-y: auto;
}

.env-tree {
  background: var(--v-surface-bg);
  border: 1px solid var(--v-surface-border);
  border-radius: var(--v-radius-lg);
  overflow: hidden;

  &__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border-bottom: 1px solid var(--v-divider);
    background: var(--v-surface-bg-subtle);
  }

  &__name {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
    color: var(--v-text-primary);
  }

  &__body {
    padding: 6px 0;
    min-height: 60px;
  }

  &__empty {
    padding: 16px;
    text-align: center;
    color: var(--v-text-tertiary);
    font-size: 12px;
  }
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

    &--env {
      color: var(--el-color-primary);
    }

    &--current {
      color: var(--v-text-primary);
      font-weight: 600;
    }
  }

  &__sep {
    color: var(--v-text-tertiary);
    font-size: 12px;
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

.batch-form__header,
.batch-form__row {
  /* 列布局:1fr(key) + N×1fr(env) + 1.2fr(comment) + 56px(操作)
   * 横向内容超过容器时支持滚动,env 多了不至于挤变形 */
  display: grid;
  grid-template-columns:
    minmax(140px, 1fr) repeat(var(--env-cols, 1), minmax(120px, 1fr))
    minmax(160px, 1.2fr) 56px;
  gap: 8px;
  padding: 8px 10px;
  align-items: start;
}

.batch-form__header {
  background: var(--v-surface-bg);
  border-bottom: 1px solid var(--v-divider);
  position: sticky;
  top: 0;
  z-index: 1;
}

.batch-form__row + .batch-form__row {
  border-top: 1px dashed var(--v-divider);
}

.batch-form__cell {
  min-width: 0;
  display: flex;
  align-items: center;
  /* 让 cell 内的 el-input 自适应列宽(默认 min-width 太宽,grid 会被撑爆) */
  :deep(.el-input),
  :deep(.el-textarea) {
    width: 100%;
  }
}

.batch-form__cell--head {
  font-size: 12px;
  font-weight: 600;
  color: var(--v-text-secondary);
  letter-spacing: 0.3px;
  padding: 4px 0;
}

.batch-form__cell--env {
  font-family: var(--el-font-family-monospace, ui-monospace, SFMono-Regular, monospace);
  text-align: center;
  justify-content: center;
}

.batch-form__cell--comment {
  /* comment 列内容可能换行,align-items: start */
  align-items: start;
}

.batch-form__cell--action {
  justify-content: center;
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
