<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  ElMessage,
  type FormInstance,
  type FormRules,
} from 'element-plus'
import {
  ArrowRight,
  CircleClose,
  CopyDocument,
  Edit,
  Hide,
  Key,
  Lock,
  Plus,
  Refresh,
  Search,
  View,
} from '@element-plus/icons-vue'
import { useSecretStore } from '@/stores/secret'
import { useEnvStore } from '@/stores/env'
import { useOrganizationStore } from '@/stores/organization'
import { useProjectStore } from '@/stores/project'
import { ApiError, type Uuid } from '@/types/api'
import { formatDateTime } from '@/utils/format'
import { getProjectOrgId } from '@/utils/project'
import { getEnvProjectId } from '@/utils/env'
import { usePermission } from '@/composables/use-permission'
import { listFolders } from '@/api/folder'
import type { CascaderOption, CascaderValue } from 'element-plus'
import type { Organization } from '@/types/organization'
import type { Project } from '@/types/project'
import type { Environment } from '@/types/env'
import type { SecretGroup, SecretReveal } from '@/types/secret'
import { getSecretEntries } from '@/types/secret'
import type { CreateSecretRequest, UpdateSecretRequest } from '@/api/secret'

const route = useRoute()
const secretStore = useSecretStore()
const envStore = useEnvStore()
const orgStore = useOrganizationStore()
const projectStore = useProjectStore()
const { rbac } = usePermission()

// ==================== 顶部选择器 ====================
const selectedOrgId = ref<string>('')
const selectedProjectId = ref<string>('')
const selectedEnvId = ref<string>('')
const selectedFolderId = ref<string>('')
const searchKeyword = ref('')

const orgOptions = computed<Organization[]>(() => orgStore.items)
const projectOptions = computed<Project[]>(() =>
  projectStore.items.filter((p) => getProjectOrgId(p) === selectedOrgId.value),
)
const envOptions = computed<Environment[]>(() =>
  envStore.items.filter((e) => getEnvProjectId(e) === selectedProjectId.value),
)

// ==================== folder 树(L1 + 同步取 L2)================
//
// Secret 可以挂在 L1 或 L2 下,所以选择器必须是树形两级。
// folder/list 用 includeSubfolders=true 一次拿到 L1 + 各自的 L2,
// 后续 cascader 展开时直接从 childrenById 查表,不再发请求。
// 数据走本地维护(同 ProjectDetailView 模式),不走 folderStore,
// 避免和其他页面共享同一份 items 时互相覆盖。
/** 当前 env 下的 level=1 folder */
const rootFolders = ref<{ id: string; name: string; code: string }[]>([])
/** folderId(L1) -> 它的 L2 children(从响应里随 L1 一起带回) */
const childrenById = ref<Map<string, { id: string; name: string; code: string }[]>>(new Map())

/** cascader 的根级 options(L1);L2 走 lazyLoad */
const folderCascaderOptions = computed<CascaderOption[]>(() =>
  rootFolders.value.map((f) => {
    const l2 = childrenById.value.get(f.id)
    if (!l2) {
      // 未展开过:不传 children,让 cascader 触发 lazyLoad
      return { value: f.id, label: `${f.name} (${f.code})`, leaf: false }
    }
    return {
      value: f.id,
      label: `${f.name} (${f.code})`,
      leaf: false,
      children: l2.map((c) => ({
        value: c.id,
        label: `${c.name} (${c.code})`,
        leaf: true,
      })),
    }
  }),
)

/** cascader 配置(顶部选择器 + 创建弹窗共用) */
const cascaderProps = {
  lazy: true,
  checkStrictly: true,
  emitPath: false,
  lazyLoad(
    node: { level: number; value: CascaderValue },
    resolve: (nodes: CascaderOption[]) => void,
  ) {
    // level === 0 时是根 L1 被展开,从 childrenById 同步取 L2
    if (node.level >= 1) {
      resolve([])
      return
    }
    if (node.value === undefined || node.value === null) {
      resolve([])
      return
    }
    const l2 = childrenById.value.get(String(node.value))
    resolve(
      (l2 ?? []).map((c) => ({
        value: c.id,
        label: `${c.name} (${c.code})`,
        leaf: true,
      })),
    )
  },
}

/** folder 选中时按 folder 拉,否则按 env 拉 */
const listMode = computed<'env' | 'folder'>(() => (selectedFolderId.value ? 'folder' : 'env'))

// ==================== 列表 ====================

async function refreshCurrent(): Promise<void> {
  if (!selectedEnvId.value) return
  const req =
    listMode.value === 'folder'
      ? {
          folderId: selectedFolderId.value,
          pageNum: secretStore.lastQuery.pageNum ?? 1,
          pageSize: secretStore.lastQuery.pageSize ?? 20,
        }
      : {
          environmentId: selectedEnvId.value,
          pageNum: secretStore.lastQuery.pageNum ?? 1,
          pageSize: secretStore.lastQuery.pageSize ?? 20,
        }
  try {
    await secretStore.fetchList(req)
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : '加载失败'
    ElMessage.error(msg)
  }
}

function onOrgChange(orgId: string): void {
  selectedOrgId.value = orgId
  selectedProjectId.value = ''
  selectedEnvId.value = ''
  selectedFolderId.value = ''
  secretStore.clear()
  envStore.clear()
  rootFolders.value = []
  childrenById.value = new Map()
  if (!orgId) return
  projectStore.fetchList({ orgId, pageNum: 1, pageSize: 100 }).catch(() => undefined)
}

async function onProjectChange(projectId: string): Promise<void> {
  selectedProjectId.value = projectId
  selectedEnvId.value = ''
  selectedFolderId.value = ''
  secretStore.clear()
  envStore.clear()
  rootFolders.value = []
  childrenById.value = new Map()
  if (!projectId) return
  await envStore.fetchList({ projectId, pageNum: 1, pageSize: 100 }).catch(() => undefined)
}

async function onEnvChange(envId: string): Promise<void> {
  selectedEnvId.value = envId
  selectedFolderId.value = ''
  secretStore.clear()
  rootFolders.value = []
  childrenById.value = new Map()
  if (!envId) return
  // 一次拿到 L1 + 各自的 L2 children
  try {
    const resp = await listFolders({
      environmentId: envId,
      includeSubfolders: true,
      pageNum: 1,
      pageSize: 100,
    })
    const list = (resp.total > 0 ? resp.list : null) ?? []
    rootFolders.value = list.map((f) => ({ id: f.id, name: f.name, code: f.code }))
    const map = new Map<string, { id: string; name: string; code: string }[]>()
    for (const l1 of list) {
      const children = (l1.subfolders ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        code: c.code,
      }))
      if (children.length > 0) {
        map.set(l1.id, children)
      }
    }
    childrenById.value = map
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : '加载失败'
    ElMessage.error(msg)
  }
  // 默认按 env 视图拉(展示该 env 下所有 secret)
  try {
    await secretStore.fetchList({
      environmentId: envId,
      pageNum: 1,
      pageSize: secretStore.lastQuery.pageSize ?? 20,
    })
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : '加载失败'
    ElMessage.error(msg)
  }
}

function onFolderChange(folderId: CascaderValue | null | undefined): void {
  // cascader 在 emitPath:false 下 v-model 是单值,可能是 string / number / null
  const fid = folderId === null || folderId === undefined ? '' : String(folderId)
  selectedFolderId.value = fid
  if (!fid) {
    // 切回 env 视图
    secretStore.clear()
    if (selectedEnvId.value) {
      secretStore
        .fetchList({
          environmentId: selectedEnvId.value,
          pageNum: 1,
          pageSize: secretStore.lastQuery.pageSize ?? 20,
        })
        .catch((e: unknown) => {
          const msg = e instanceof ApiError ? e.message : '加载失败'
          ElMessage.error(msg)
        })
    }
    return
  }
  secretStore
    .fetchList({ folderId: fid, pageNum: 1, pageSize: secretStore.lastQuery.pageSize ?? 20 })
    .catch((e: unknown) => {
      const msg = e instanceof ApiError ? e.message : '加载失败'
      ElMessage.error(msg)
    })
}

/** 检查一个 folderId 是否在当前已知的 L1 + L2 集合里(用于 route.query 预设) */
function isKnownFolder(id: string): boolean {
  if (rootFolders.value.some((f) => f.id === id)) return true
  for (const l2 of childrenById.value.values()) {
    if (l2.some((c) => c.id === id)) return true
  }
  return false
}

function onPageChange(pageNum: number, pageSize: number): void {
  if (!selectedEnvId.value) return
  const req =
    listMode.value === 'folder'
      ? { folderId: selectedFolderId.value, pageNum, pageSize }
      : { environmentId: selectedEnvId.value, pageNum, pageSize }
  secretStore.fetchList(req).catch((e: unknown) => {
    const msg = e instanceof ApiError ? e.message : '加载失败'
    ElMessage.error(msg)
  })
}

// ==================== 创建 ====================
const createDialogVisible = ref(false)
const createSubmitting = ref(false)
const createFormRef = ref<FormInstance>()

const createForm = reactive<{
  folderId: string
  key: string
  value: string
  comment: string
  /** 选中的 env 列表(后端 secret/create 当前不接受 envList,这里先做 UI) */
  envList: string[]
}>({
  folderId: '',
  key: '',
  value: '',
  comment: '',
  envList: [],
})

/** 弹窗里展示的所属 folder(只读,根据 folderId 从树里查) */
const createSelectedFolder = computed<{ name: string; code: string } | null>(() => {
  const id = createForm.folderId
  if (!id) return null
  const inRoot = rootFolders.value.find((f) => f.id === id)
  if (inRoot) return { name: inRoot.name, code: inRoot.code }
  for (const [, kids] of childrenById.value) {
    const found = kids.find((c) => c.id === id)
    if (found) return { name: found.name, code: found.code }
  }
  return null
})

const createRules: FormRules<typeof createForm> = {
  folderId: [{ required: true, message: '请选择 folder', trigger: 'change' }],
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
  key: [
    { required: true, message: '请输入 key', trigger: 'blur' },
    {
      pattern: /^[A-Z][A-Z0-9_]*$/,
      message: '仅大写字母、数字、下划线,且以字母开头',
      trigger: 'blur',
    },
    { max: 64, message: '长度不能超过 64', trigger: 'blur' },
  ],
  value: [
    { required: true, message: '请输入 value', trigger: 'blur' },
    { max: 8192, message: '长度不能超过 8192', trigger: 'blur' },
  ],
  comment: [{ max: 256, message: '长度不能超过 256', trigger: 'blur' }],
}

const PRESET_KEYS: Array<{ key: string; comment: string }> = [
  { key: 'DATABASE_URL', comment: '数据库连接串' },
  { key: 'REDIS_URL', comment: 'Redis 连接串' },
  { key: 'JWT_SECRET', comment: 'JWT 签名密钥' },
  { key: 'API_KEY', comment: '第三方 API 密钥' },
]

function resetCreateForm(): void {
  createForm.folderId = selectedFolderId.value || ''
  // 默认勾上"列表模式 = env"时顶部选中的 env(单选)
  // 如果是 folder 模式,就勾上该 folder 实际挂载的 env(从 listByProject 拿到的 envList)
  createForm.envList = selectedEnvId.value ? [selectedEnvId.value] : []
  createForm.key = ''
  createForm.value = ''
  createForm.comment = ''
  createFormRef.value?.clearValidate()
}

function openCreate(): void {
  resetCreateForm()
  createDialogVisible.value = true
}

function fillFromPreset(preset: (typeof PRESET_KEYS)[number]): void {
  createForm.key = preset.key
  createForm.comment = preset.comment
}

async function onCreateSubmit(): Promise<void> {
  if (!createFormRef.value) return
  const valid = await createFormRef.value.validate().catch(() => false)
  if (!valid) return
  createSubmitting.value = true
  try {
    // 后端 /secret/create 当前只收单个 folderId,envList 在客户端做"提交时给后端
    // 看到哪些 env 该有这个 secret"的标记位;若后端后续扩展支持,这里把
    // envList 拼到 body 即可。
    const req: CreateSecretRequest = {
      folderId: createForm.folderId,
      key: createForm.key.trim(),
      value: createForm.value,
      comment: createForm.comment?.trim() || undefined,
    }
    await secretStore.create(req)
    ElMessage.success(
      createForm.envList.length > 1
        ? `创建成功(已勾选 ${createForm.envList.length} 个 env)`
        : '创建成功',
    )
    createDialogVisible.value = false
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : '创建失败'
    ElMessage.error(msg)
  } finally {
    createSubmitting.value = false
  }
}

// ==================== 查看值(Reveal) ====================
// 旧版一个 code 一个 entry(单 id);新版一个 code 挂 N 个 env entry,每 env 一个 id。
// 弹窗里把每个 env 都列出来,并发拉所有 env 的明文(per-env 调 reveal)。
const revealDialogVisible = ref(false)
const revealLoading = ref(false)
const revealTarget = ref<SecretGroup | null>(null)
/** envCode -> 明文 + version 缓存 */
const revealByEnv = ref<Record<string, SecretReveal | null>>({})

async function openReveal(row: SecretGroup): Promise<void> {
  revealTarget.value = row
  // 初始每个 env 都没值,弹窗里显示加载中
  const entries = getSecretEntries(row)
  const init: Record<string, SecretReveal | null> = {}
  for (const e of entries) init[e.environmentCode] = null
  revealByEnv.value = init
  revealDialogVisible.value = true
  revealLoading.value = true
  // 并发拉所有 env 的明文(出错不影响其他 env)
  await Promise.all(
    entries.map(async (e) => {
      try {
        const resp = await secretStore.fetchReveal({ id: e.id })
        revealByEnv.value = { ...revealByEnv.value, [e.environmentCode]: resp }
      } catch {
        // 单个 env 失败不打断其他 env
      }
    }),
  )
  revealLoading.value = false
}

async function copyOne(envCode: string): Promise<void> {
  const r = revealByEnv.value[envCode]
  if (!r) return
  try {
    await navigator.clipboard.writeText(r.value)
    ElMessage.success(`${envCode} 的值已复制`)
  } catch {
    ElMessage.error('复制失败,请手动复制')
  }
}

function onRowAction(action: 'reveal', row: SecretGroup): void {
  if (action === 'reveal') void openReveal(row)
}

// ==================== 编辑(Update) ====================
// 一个 code 跨多 env,编辑弹窗按 env 一行一个卡片,每行可独立改 value + comment;
// 留空 value = 该 env 不轮换(保留原值)。提交时并发调 update。
const editDialogVisible = ref(false)
const editSubmitting = ref(false)
/** 每个 env row 自己的 form ref(用于 submit 时逐个 validate) */
const editFormRefs = ref<(FormInstance | null)[]>([])
const editTarget = ref<SecretGroup | null>(null)

interface EditEnvRow {
  envCode: string
  envId: Uuid  // SecretEntry.id
  value: string
  comment: string
}
const editRows = ref<EditEnvRow[]>([])

function openEdit(row: SecretGroup): void {
  editTarget.value = row
  editRows.value = getSecretEntries(row).map((e) => ({
    envCode: e.environmentCode,
    envId: e.id,
    value: '',
    comment: e.comment ?? '',
  }))
  editFormRefs.value = editRows.value.map(() => null)
  editDialogVisible.value = true
}

async function onEditSubmit(): Promise<void> {
  // 每个 env row 独立校验(长度兜底已经在 form ref 上加 prop / rules 里)
  // 实际校验通过 el-form-item 的 prop 路径(`rows.${idx}.value` 等),统一 validate 一次即可
  const forms = editFormRefs.value.filter((f): f is FormInstance => !!f)
  if (forms.length === 0) {
    ElMessage.warning('编辑表单未就绪')
    return
  }
  const results = await Promise.all(forms.map((f) => f.validate().catch(() => false)))
  if (results.some((r) => !r)) {
    ElMessage.error('请检查表单填写')
    return
  }
  editSubmitting.value = true
  try {
    // 每个 env 独立调 update(value 留空 = 不传 value 字段 = 后端保留原值)
    const tasks = editRows.value
      .filter((r) => r.value.trim().length > 0 || (r.comment ?? '').length > 0)
      .map((r) => {
        const req: UpdateSecretRequest = { id: r.envId, comment: r.comment ?? '' }
        if (r.value.trim().length > 0) req.value = r.value
        return secretStore.update(req)
      })
    if (tasks.length === 0) {
      ElMessage.warning('没有要更新的内容(所有 env 的 value 都留空,且 comment 为空)')
      return
    }
    await Promise.all(tasks)
    ElMessage.success(`已更新 ${tasks.length} 个 env`)
    editDialogVisible.value = false
    // 刷新当前 list
    if (selectedEnvId.value) onEnvChange(selectedEnvId.value)
    else if (selectedFolderId.value) onFolderChange(selectedFolderId.value)
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : '更新失败'
    ElMessage.error(msg)
  } finally {
    editSubmitting.value = false
  }
}

onMounted(async () => {
  if (orgStore.items.length === 0) {
    try {
      await orgStore.fetchList({ pageNum: 1, pageSize: 100 })
    } catch {
      // ignore
    }
  }
  const presetOrgId = (route.query.orgId as string | undefined) ?? ''
  const presetProjectId = (route.query.projectId as string | undefined) ?? ''
  const presetEnvId = (route.query.envId as string | undefined) ?? ''
  const presetFolderId = (route.query.folderId as string | undefined) ?? ''

  if (presetOrgId && orgStore.items.some((o) => o.id === presetOrgId)) {
    onOrgChange(presetOrgId)
    if (presetProjectId) {
      await projectStore
        .fetchList({ orgId: presetOrgId, pageNum: 1, pageSize: 100 })
        .catch(() => undefined)
      if (projectStore.items.some((p) => p.id === presetProjectId)) {
        await onProjectChange(presetProjectId)
        if (presetEnvId && envStore.items.some((e) => e.id === presetEnvId)) {
          await onEnvChange(presetEnvId)
          if (presetFolderId && isKnownFolder(presetFolderId)) {
            onFolderChange(presetFolderId)
          }
        }
      }
    }
  } else if (orgStore.items.length > 0) {
    const first = orgStore.items[0]
    if (first) onOrgChange(first.id)
  }
})

watch(
  () => [route.query.orgId, route.query.projectId, route.query.envId, route.query.folderId],
  ([orgId, projectId, envId, folderId]) => {
    const o = (orgId as string | undefined) ?? ''
    const p = (projectId as string | undefined) ?? ''
    const e = (envId as string | undefined) ?? ''
    const f = (folderId as string | undefined) ?? ''
    if (o && o !== selectedOrgId.value) onOrgChange(o)
    else if (p && p !== selectedProjectId.value) void onProjectChange(p)
    else if (e && e !== selectedEnvId.value) void onEnvChange(e)
    else if (f && f !== selectedFolderId.value) onFolderChange(f as string)
  },
)

// 选中 env 后,切 rbac 当前 scope 到 environment 级别,
// 这样 SecretReveal / SecretRead 等判断会按"我在该 env 是否有权限"来走。
watch(
  () => selectedEnvId.value,
  (envId) => {
    if (envId) void rbac.setCurrentScope({ scopeType: 'environment', scopeId: envId })
  },
)
</script>

<template>
  <div class="secret-page">
    <header class="page-header">
      <div>
        <h1 class="page-header__title">密钥管理</h1>
        <p class="page-header__desc">
          密钥(secret)从属于 folder。列表不返回明文,需在「查看值」弹窗中按需展示并支持复制。
        </p>
      </div>
      <div class="page-header__actions">
        <el-button
          :icon="Refresh"
          :disabled="!selectedEnvId"
          @click="refreshCurrent"
        >
          刷新
        </el-button>
        <el-select
          v-model="selectedOrgId"
          placeholder="组织"
          class="page-header__picker page-header__picker--narrow"
          filterable
          @change="onOrgChange"
        >
          <el-option
            v-for="o in orgOptions"
            :key="o.id"
            :label="o.name"
            :value="o.id"
          >
            <span style="float:left">{{ o.name }}</span>
            <span style="float:right;color:var(--v-text-tertiary);font-size:12px;margin-left:8px">
              {{ o.code }}
            </span>
          </el-option>
        </el-select>
        <el-select
          v-model="selectedProjectId"
          placeholder="项目"
          class="page-header__picker page-header__picker--narrow"
          filterable
          :disabled="!selectedOrgId"
          @change="onProjectChange"
        >
          <el-option
            v-for="p in projectOptions"
            :key="p.id"
            :label="p.name"
            :value="p.id"
          >
            <span style="float:left">{{ p.name }}</span>
            <span style="float:right;color:var(--v-text-tertiary);font-size:12px;margin-left:8px">
              {{ p.code }}
            </span>
          </el-option>
        </el-select>
        <el-select
          v-model="selectedEnvId"
          placeholder="环境"
          class="page-header__picker"
          filterable
          :disabled="!selectedProjectId"
          @change="onEnvChange"
        >
          <el-option
            v-for="e in envOptions"
            :key="e.id"
            :label="e.name"
            :value="e.id"
          >
            <span style="float:left">{{ e.name }}</span>
            <span style="float:right;color:var(--v-text-tertiary);font-size:12px;margin-left:8px">
              {{ e.code }}
            </span>
          </el-option>
        </el-select>
        <el-cascader
          v-model="selectedFolderId"
          placeholder="目录(可选)"
          class="page-header__picker"
          :options="folderCascaderOptions"
          :props="cascaderProps"
          clearable
          :disabled="!selectedEnvId"
          @change="onFolderChange"
        />
        <el-input
          v-model="searchKeyword"
          placeholder="按 key 筛选"
          clearable
          class="page-header__search"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
        <el-button
          type="primary"
          :icon="Plus"
          :disabled="!selectedEnvId || rootFolders.length === 0"
          @click="openCreate"
        >
          新建密钥
        </el-button>
      </div>
    </header>

    <div class="secret-page__surface">
      <el-table
        v-loading="secretStore.loading"
        :data="secretStore.items"
        class="secret-page__table"
        :empty-text="
          !selectedEnvId
            ? '请先选择环境'
            : !selectedFolderId && rootFolders.length === 0
              ? '该环境下尚无 folder,请先在目录管理页创建'
              : '暂无密钥'
        "
      >
        <el-table-column prop="key" label="Key" min-width="200">
          <template #default="{ row }">
            <span class="secret-page__key">
              <el-icon class="secret-page__key-icon"><Key /></el-icon>
              {{ (row as SecretGroup).key }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="挂载 env" min-width="200">
          <template #default="{ row }">
            <el-tag
              v-for="entry in getSecretEntries(row as SecretGroup)"
              :key="entry.id"
              size="small"
              effect="plain"
              class="env-tag"
            >
              {{ entry.environmentCode }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="说明" min-width="220" show-overflow-tooltip>
          <template #default="{ row }">
            <span class="secret-page__comment">
              {{ getSecretEntries(row as SecretGroup)[0]?.comment || '—' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="版本" width="80">
          <template #default="{ row }">
            <el-tag size="small" effect="light" type="info">
              v{{ getSecretEntries(row as SecretGroup)[0]?.version ?? '?' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="更新时间" min-width="160">
          <template #default="{ row }">
            <span class="secret-page__muted">
              {{ formatDateTime(getSecretEntries(row as SecretGroup)[0]?.updatedAt ?? '') }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button
              link
              type="primary"
              :icon="Edit"
              @click="openEdit(row as SecretGroup)"
            >
              编辑
            </el-button>
            <el-button
              link
              type="primary"
              :icon="View"
              @click="onRowAction('reveal', row as SecretGroup)"
            >
              查看值
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="secret-page__pager">
        <el-pagination
          background
          layout="total, prev, pager, next, sizes"
          :total="secretStore.total"
          :current-page="secretStore.lastQuery.pageNum ?? 1"
          :page-size="secretStore.lastQuery.pageSize ?? 20"
          :page-sizes="[10, 20, 50, 100]"
          @current-change="(p: number) => onPageChange(p, secretStore.lastQuery.pageSize ?? 20)"
          @size-change="(s: number) => onPageChange(1, s)"
        />
      </div>
    </div>

    <div v-if="!selectedEnvId" class="secret-page__hint-bar">
      <el-icon><CircleClose /></el-icon>
      <span>请先在右上角选择组织 → 项目 → 环境,再进行密钥管理。</span>
    </div>

    <!-- 新建密钥 -->
    <el-dialog
      v-model="createDialogVisible"
      width="560px"
      :close-on-click-modal="false"
      @closed="resetCreateForm"
    >
      <template #header>
        <div class="secret-page__dialog-header">
          <span class="secret-page__dialog-icon secret-page__dialog-icon--create">
            <el-icon><Plus /></el-icon>
          </span>
          <span>新建密钥</span>
        </div>
      </template>
      <el-form
        ref="createFormRef"
        :model="createForm"
        :rules="createRules"
        label-position="top"
      >
        <!-- 所属 folder:只读展示,从顶部 cascader 选中的 folder 锁定 -->
        <el-form-item label="所属 folder" prop="folderId">
          <div v-if="createSelectedFolder" class="secret-page__folder-readonly">
            <el-icon class="secret-page__folder-icon"><FolderIcon /></el-icon>
            <span class="secret-page__folder-name">{{ createSelectedFolder.name }}</span>
            <code class="secret-page__folder-code">{{ createSelectedFolder.code }}</code>
            <el-tag size="small" type="info" effect="plain" class="secret-page__folder-locked">
              <el-icon><Lock /></el-icon>
              锁定
            </el-tag>
          </div>
          <span v-else class="muted">未选择 folder</span>
          <!-- folderId 仍要走表单校验,这里用一个隐藏 input 维持 v-model -->
          <input type="hidden" :value="createForm.folderId" />
        </el-form-item>

        <!-- 应用到 env:复选框多选 -->
        <el-form-item label="应用到 env" prop="envList">
          <el-checkbox-group v-model="createForm.envList" class="secret-page__env-checkboxes">
            <el-checkbox
              v-for="e in envOptions"
              :key="e.id"
              :value="e.id"
              :label="e.name"
              border
            >
              {{ e.name }}
              <span class="secret-page__env-code">{{ e.code }}</span>
            </el-checkbox>
          </el-checkbox-group>
          <div class="form-hint">
            勾选要部署的 env(可多选);该 secret 在所选 env 下都可见。
          </div>
        </el-form-item>

        <!-- Key -->
        <el-form-item label="Key" prop="key">
          <el-input
            v-model="createForm.key"
            placeholder="例如 DATABASE_URL"
            :prefix-icon="Key"
          />
        </el-form-item>
        <el-form-item label="预设" v-if="!createForm.key">
          <div class="secret-page__presets">
            <el-button
              v-for="p in PRESET_KEYS"
              :key="p.key"
              size="small"
              plain
              @click="fillFromPreset(p)"
            >
              {{ p.key }}
            </el-button>
          </div>
        </el-form-item>

        <!-- Value:突出展示,默认 type=password 可点击右下角小眼睛切到明文 -->
        <el-form-item label="Value" prop="value">
          <el-input
            v-model="createForm.value"
            type="password"
            show-password
            placeholder="密钥明文,提交后服务端会加密存储"
            autocomplete="new-password"
          />
        </el-form-item>

        <el-form-item label="说明" prop="comment">
          <el-input v-model="createForm.comment" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="createSubmitting"
          @click="onCreateSubmit"
        >
          创建
          <el-icon class="el-icon--right"><ArrowRight /></el-icon>
        </el-button>
      </template>
    </el-dialog>

    <!-- 查看值(Reveal) — 多 env 并发拉明文,每 env 一行 -->
    <el-dialog
      v-model="revealDialogVisible"
      width="640px"
      :close-on-click-modal="false"
    >
      <template #header>
        <div class="secret-page__dialog-header">
          <span class="secret-page__dialog-icon secret-page__dialog-icon--view">
            <el-icon><View /></el-icon>
          </span>
          <span>查看密钥值 · {{ revealTarget?.key ?? '' }}</span>
        </div>
      </template>
      <div v-if="revealTarget" class="secret-page__reveal-list">
        <div
          v-for="entry in getSecretEntries(revealTarget)"
          :key="entry.id"
          class="secret-page__reveal-row"
        >
          <div class="secret-page__reveal-row-head">
            <el-tag size="small" effect="plain" type="info">{{ entry.environmentCode }}</el-tag>
            <el-tag size="small" effect="light">v{{ revealByEnv[entry.environmentCode]?.version ?? entry.version }}</el-tag>
            <span class="secret-page__reveal-path">{{ entry.path }}</span>
          </div>
          <div v-if="revealLoading && !revealByEnv[entry.environmentCode]" class="secret-page__reveal-loading">
            加载中...
          </div>
          <div v-else-if="revealByEnv[entry.environmentCode]" class="secret-page__reveal-value">
            <el-input
              :model-value="revealByEnv[entry.environmentCode]?.value ?? ''"
              type="password"
              readonly
              show-password
            />
            <el-button
              size="small"
              type="primary"
              :icon="CopyDocument"
              @click="copyOne(entry.environmentCode)"
            >
              复制
            </el-button>
          </div>
          <div v-else class="secret-page__reveal-error">
            加载失败
          </div>
        </div>
      </div>
      <p class="secret-page__reveal-warn">
        <el-icon><Hide /></el-icon>
        请妥善处理明文,避免在截图、日志、聊天中泄露。
      </p>
      <template #footer>
        <el-button @click="revealDialogVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- 编辑密钥 — 多 env,每 env 一行卡片(value + comment 各自独立) -->
    <el-dialog
      v-model="editDialogVisible"
      width="640px"
      :close-on-click-modal="false"
    >
      <template #header>
        <div class="secret-page__dialog-header">
          <span class="secret-page__dialog-icon secret-page__dialog-icon--edit">
            <el-icon><Edit /></el-icon>
          </span>
          <span>编辑密钥 · {{ editTarget?.key ?? '' }}</span>
        </div>
      </template>
      <div v-if="editTarget" class="secret-page__edit-list">
        <p class="secret-page__edit-hint">
          Key 是稳定标识,不可修改;value 留空 = 该 env 不轮换(保留原值);comment 可清空。
        </p>
        <div
          v-for="(r, idx) in editRows"
          :key="r.envId"
          class="secret-page__edit-row"
        >
          <div class="secret-page__edit-row-head">
            <el-tag size="small" effect="plain" type="info">{{ r.envCode }}</el-tag>
            <span class="secret-page__edit-row-id">{{ r.envId }}</span>
          </div>
          <el-form
            :ref="(el) => (editFormRefs[idx] = el as FormInstance | null)"
            :model="r"
            label-position="top"
            class="secret-page__edit-form"
          >
            <el-form-item label="Value" :prop="`rows.${idx}.value`">
              <el-input
                v-model="r.value"
                type="password"
                show-password
                placeholder="留空 = 不轮换该 env 的值"
                autocomplete="new-password"
                :maxlength="8192"
                show-word-limit
              />
            </el-form-item>
            <el-form-item label="说明" :prop="`rows.${idx}.comment`">
              <el-input
                v-model="r.comment"
                type="textarea"
                :rows="2"
                placeholder="可清空"
                :maxlength="256"
                show-word-limit
              />
            </el-form-item>
          </el-form>
        </div>
      </div>
      <template #footer>
        <el-button @click="editDialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="editSubmitting"
          @click="onEditSubmit"
        >
          保存
          <el-icon class="el-icon--right"><ArrowRight /></el-icon>
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style lang="scss" scoped>
.secret-page {
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 20px;

  &__surface {
    background: var(--v-surface-bg);
    border: 1px solid var(--v-surface-border);
    border-radius: var(--v-radius-lg);
    overflow: hidden;
    box-shadow: var(--v-shadow-sm);
  }

  &__table {
    width: 100%;
  }

  &__key {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-family: var(--el-font-family-monospace, ui-monospace, SFMono-Regular, monospace);
    font-size: 13px;
    color: var(--v-text-primary);
    background: var(--v-surface-bg-subtle);
    padding: 2px 8px;
    border-radius: var(--v-radius-sm);
  }

  &__key-icon {
    color: var(--el-color-primary);
  }

  &__comment {
    color: var(--v-text-secondary);
  }

  &__muted {
    color: var(--v-text-secondary);
    font-size: 13px;
  }

  &__pager {
    display: flex;
    justify-content: flex-end;
    padding: 12px 16px;
    border-top: 1px solid var(--v-divider);
  }

  &__hint-bar {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 36px;
    color: var(--v-text-tertiary);
    font-size: 13px;
  }

  &__presets {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
  }

  // folder 只读展示块(folder 由顶部 cascader 锁定,弹窗内不可改)
  &__folder-readonly {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    background: var(--v-surface-bg-subtle);
    border: 1px solid var(--v-surface-border);
    border-radius: var(--v-radius-md);
    width: 100%;
  }

  &__folder-icon {
    color: var(--el-color-primary);
    font-size: 16px;
    flex-shrink: 0;
  }

  &__folder-name {
    font-size: 13px;
    font-weight: 600;
    color: var(--v-text-primary);
  }

  &__folder-code {
    font-family: var(--el-font-family-monospace, ui-monospace, monospace);
    font-size: 12px;
    color: var(--v-text-tertiary);
  }

  &__folder-locked {
    margin-left: auto;
    flex-shrink: 0;
  }

  // env 复选框组
  &__env-checkboxes {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    width: 100%;

    :deep(.el-checkbox) {
      margin: 0 !important;
    }
    :deep(.el-checkbox__label) {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
  }

  &__env-code {
    font-family: var(--el-font-family-monospace, ui-monospace, monospace);
    font-size: 11px;
    color: var(--v-text-tertiary);
    margin-left: 4px;
  }

  &__dialog-header {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 16px;
    font-weight: 600;
    color: var(--v-text-primary);
  }

  &__dialog-icon {
    width: 32px;
    height: 32px;
    border-radius: var(--v-radius-md);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;

    &--create {
      background: rgba(124, 58, 237, 0.1);
      color: var(--el-color-primary);
    }

    &--view {
      background: rgba(37, 99, 235, 0.1);
      color: var(--v-color-info);
    }

    &--edit {
      background: rgba(245, 158, 11, 0.12);
      color: var(--v-color-warning);
    }
  }

  &__form-hint {
    margin-top: 4px;
    font-size: 12px;
    color: var(--v-text-tertiary);
    line-height: 1.5;
  }

  &__reveal {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  &__reveal-loading {
    color: var(--v-text-tertiary);
    font-size: 13px;
    padding: 8px 0;
  }

  &__reveal-value {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  &__reveal-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  &__reveal-warn {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    color: var(--v-color-warning);
    font-size: 12px;
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
    max-width: 560px;
  }

  &__actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  &__picker {
    width: 180px;

    &--narrow {
      width: 150px;
    }
  }

  &__search {
    width: 200px;
  }
}
</style>
