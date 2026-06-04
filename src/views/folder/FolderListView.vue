<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  ElMessage,
  ElMessageBox,
  type FormInstance,
  type FormRules,
} from 'element-plus'
import {
  ArrowRight,
  CircleClose,
  Delete,
  Folder as FolderIcon,
  Plus,
  Refresh,
} from '@element-plus/icons-vue'
import { useEnvStore } from '@/stores/env'
import { useOrganizationStore } from '@/stores/organization'
import { useProjectStore } from '@/stores/project'
import { ApiError } from '@/types/api'
import { formatDateTime } from '@/utils/format'
import { getProjectOrgId } from '@/utils/project'
import { getEnvProjectId } from '@/utils/env'
import { listFolders, createFolder, deleteFolder } from '@/api/folder'
import type { Organization } from '@/types/organization'
import type { Project } from '@/types/project'
import type { Environment } from '@/types/env'
import type { Folder, FolderLevel } from '@/types/folder'

const route = useRoute()
const envStore = useEnvStore()
const orgStore = useOrganizationStore()
const projectStore = useProjectStore()

// ==================== 顶部选择器 ====================
const selectedOrgId = ref<string>('')
const selectedProjectId = ref<string>('')
const selectedEnvId = ref<string>('')

const orgOptions = computed<Organization[]>(() => orgStore.items)
const projectOptions = computed<Project[]>(() =>
  projectStore.items.filter((p) => getProjectOrgId(p) === selectedOrgId.value),
)
const envOptions = computed<Environment[]>(() =>
  envStore.items.filter((e) => getEnvProjectId(e) === selectedProjectId.value),
)

// ==================== 本地树数据(不走 folderStore,避免和 secret 页冲突) ====================
/** 当前 env 下的 level=1 folder */
const rootFolders = ref<Folder[]>([])
/** folderId -> level=2 children(已加载的) */
const childrenById = ref<Map<string, Folder[]>>(new Map())
const treeLoading = ref(false)

/** 当前选中的 folder id;空串代表"环境根视图" */
const selectedId = ref<string>('')

/** 查 id 在树里的 folder 对象(level=1 或 level=2) */
const selectedFolder = computed<Folder | null>(() => {
  if (!selectedId.value) return null
  const inRoot = rootFolders.value.find((f) => f.id === selectedId.value)
  if (inRoot) return inRoot
  for (const [, kids] of childrenById.value) {
    const found = kids.find((f) => f.id === selectedId.value)
    if (found) return found
  }
  return null
})

/** 面包屑:envName → (level=1 folder) → (level=2 folder) */
const breadcrumb = computed<Array<{ id: string; name: string }>>(() => {
  const envName = envOptions.value.find((e) => e.id === selectedEnvId.value)?.name ?? '环境'
  const result: Array<{ id: string; name: string }> = []
  if (selectedFolder.value) {
    if (selectedFolder.value.level === 2) {
      // 找父 folder(level=1)
      const parent = rootFolders.value.find((f) => f.id === selectedFolder.value!.parentId)
      if (parent) result.push({ id: parent.id, name: parent.name })
    }
    result.push({ id: selectedFolder.value.id, name: selectedFolder.value.name })
  }
  return [{ id: '', name: envName }, ...result]
})

/** 当前视图下的"子目录":env 视图 → rootFolders;folder 视图 → 该 folder 的 level=2 children */
const currentChildren = computed<Folder[]>(() => {
  if (!selectedId.value) return rootFolders.value
  return childrenById.value.get(selectedId.value) ?? []
})

/** 父级显示文本 */
const parentLabel = computed<string>(() => {
  if (!selectedFolder.value) return '—'
  if (selectedFolder.value.level === 1) {
    return envOptions.value.find((e) => e.id === selectedEnvId.value)?.name ?? '环境'
  }
  const parent = rootFolders.value.find((f) => f.id === selectedFolder.value!.parentId)
  return parent ? `${parent.name} (${parent.code})` : '—'
})

/** 当前能否新建子目录:env 视图能建 level=1;level=1 folder 视图能建 level=2;level=2 folder 视图不能建(深度上限) */
const canCreateChild = computed<boolean>(() => {
  if (!selectedEnvId.value) return false
  if (!selectedFolder.value) return true
  return selectedFolder.value.level === 1
})

// ==================== 加载 ====================
async function loadRoot(): Promise<void> {
  if (!selectedEnvId.value) {
    rootFolders.value = []
    childrenById.value = new Map()
    return
  }
  treeLoading.value = true
  try {
    const resp = await listFolders({
      environmentId: selectedEnvId.value,
      pageNum: 1,
      pageSize: 100,
    })
    rootFolders.value = resp.list.map((f) => ({ ...f, level: 1 as const }))
    // 清掉旧 env 的 children cache
    childrenById.value = new Map()
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : '加载目录失败'
    ElMessage.error(msg)
  } finally {
    treeLoading.value = false
  }
}

/** 懒加载:点开一个 level=1 folder 时拉它的 level=2 children(供右侧"子目录"区显示) */
async function ensureChildrenLoaded(folderId: string): Promise<void> {
  if (childrenById.value.has(folderId)) return
  try {
    const resp = await listFolders({
      folderParentId: folderId,
      pageNum: 1,
      pageSize: 100,
    })
    const next = new Map(childrenById.value)
    next.set(folderId, resp.list.map((f) => ({ ...f, level: 2 as const })))
    childrenById.value = next
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : '加载子目录失败'
    ElMessage.error(msg)
  }
}

// ==================== 顶部 selector 联动 ====================
function onOrgChange(orgId: string): void {
  selectedOrgId.value = orgId
  selectedProjectId.value = ''
  selectedEnvId.value = ''
  selectedId.value = ''
  envStore.clear()
  if (!orgId) return
  projectStore.fetchList({ orgId, pageNum: 1, pageSize: 100 }).catch(() => undefined)
}

async function onProjectChange(projectId: string): Promise<void> {
  selectedProjectId.value = projectId
  selectedEnvId.value = ''
  selectedId.value = ''
  if (!projectId) return
  await envStore
    .fetchList({ projectId, pageNum: 1, pageSize: 100 })
    .catch(() => undefined)
}

async function onEnvChange(envId: string): Promise<void> {
  selectedEnvId.value = envId
  selectedId.value = ''
  await loadRoot()
}

// ==================== 树点击 ====================
async function onTreeNodeClick(folder: Folder): Promise<void> {
  selectedId.value = folder.id
  // 选中时确保 children 已加载(右侧要显示)
  if (folder.level === 1) await ensureChildrenLoaded(folder.id)
}

function onBreadcrumbClick(id: string): void {
  selectedId.value = id
}

function onChildCardClick(child: Folder): void {
  // 右栏"子目录"卡片点击 → 跳进去
  onTreeNodeClick(child)
}

// ==================== 创建 ====================
const createDialogVisible = ref(false)
const createSubmitting = ref(false)
const createFormRef = ref<FormInstance>()

const createForm = reactive<{
  code: string
  name: string
  comment: string
}>({
  code: '',
  name: '',
  comment: '',
})

const createRules: FormRules<typeof createForm> = {
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

/** 根据当前选中推算出"要新建的 folder"的 level / parentId */
const createTarget = computed<{ level: FolderLevel; parentId: string } | null>(() => {
  if (!canCreateChild.value || !selectedEnvId.value) return null
  if (!selectedFolder.value) {
    return { level: 1, parentId: selectedEnvId.value }
  }
  if (selectedFolder.value.level === 1) {
    return { level: 2, parentId: selectedFolder.value.id }
  }
  return null
})

function resetCreateForm(): void {
  createForm.code = ''
  createForm.name = ''
  createForm.comment = ''
  createFormRef.value?.clearValidate()
}

function openCreate(): void {
  if (!createTarget.value) {
    ElMessage.warning('当前选中的目录已是 level=2,无法继续嵌套')
    return
  }
  resetCreateForm()
  createDialogVisible.value = true
}

function fillFromPreset(preset: (typeof PRESET_FOLDERS)[number]): void {
  createForm.code = preset.code
  createForm.name = preset.name
}

async function onCreateSubmit(): Promise<void> {
  if (!createFormRef.value || !createTarget.value) return
  const valid = await createFormRef.value.validate().catch(() => false)
  if (!valid) return
  createSubmitting.value = true
  try {
    const t = createTarget.value
    await createFolder({
      level: t.level,
      parentId: t.parentId,
      code: createForm.code,
      name: createForm.name,
      comment: createForm.comment || undefined,
    })
    ElMessage.success('创建成功')
    createDialogVisible.value = false
    // 刷新:若是 level=1,重拉根;若是 level=2,清掉对应 children cache 让下次访问重新拉
    if (t.level === 1) {
      await loadRoot()
    } else {
      const next = new Map(childrenById.value)
      next.delete(t.parentId)
      childrenById.value = next
      // 自动选中新创建的子目录
      // 但没拿到 id,这里就清空,让用户从树/卡片手动进入
    }
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : '创建失败'
    ElMessage.error(msg)
  } finally {
    createSubmitting.value = false
  }
}

// ==================== 删除 ====================
async function onDeleteCurrent(): Promise<void> {
  const f = selectedFolder.value
  if (!f) return
  const parent = f.parentId ?? ''
  await confirmAndDelete(
    f,
    f.level === 1 ? loadRoot : () => refreshChildren(parent),
  )
}

async function onDeleteChild(child: Folder): Promise<void> {
  const parent = child.parentId ?? ''
  await confirmAndDelete(child, () => refreshChildren(parent))
}

async function confirmAndDelete(
  folder: Folder,
  refresh: () => Promise<void> | void,
): Promise<void> {
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
    // 当前选中的被删了 → 退回父级
    if (selectedId.value === folder.id) {
      selectedId.value = folder.level === 1 ? '' : folder.parentId ?? ''
    }
    await refresh()
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : '删除失败'
    ElMessage.error(msg)
  }
}

async function refreshChildren(parentId: string): Promise<void> {
  if (!parentId) return
  const next = new Map(childrenById.value)
  next.delete(parentId)
  childrenById.value = next
  await ensureChildrenLoaded(parentId)
}

// ==================== 路由 query 同步 ====================
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
        }
      }
    }
  } else if (orgStore.items.length > 0) {
    const first = orgStore.items[0]
    if (first) onOrgChange(first.id)
  }
})

watch(
  () => [route.query.orgId, route.query.projectId, route.query.envId],
  ([orgId, projectId, envId]) => {
    const o = (orgId as string | undefined) ?? ''
    const p = (projectId as string | undefined) ?? ''
    const e = (envId as string | undefined) ?? ''
    if (o && o !== selectedOrgId.value) onOrgChange(o)
    else if (p && p !== selectedProjectId.value) onProjectChange(p)
    else if (e && e !== selectedEnvId.value) onEnvChange(e)
  },
)
</script>

<template>
  <div class="folder-page">
    <header class="page-header">
      <div>
        <h1 class="page-header__title">目录管理</h1>
        <p class="page-header__desc">
          目录(folder)从属于环境,支持两级嵌套;点击文件夹可进入查看其下子目录。
        </p>
      </div>
      <div class="page-header__actions">
        <el-button :icon="Refresh" :disabled="!selectedEnvId" @click="loadRoot">刷新</el-button>
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
      </div>
    </header>

    <div v-if="!selectedEnvId" class="folder-page__hint">
      <el-icon><CircleClose /></el-icon>
      <span>请先在右上角选择组织 → 项目 → 环境,再进行目录管理。</span>
    </div>

    <div v-else class="folder-page__body">
      <!-- 左栏:目录树 -->
      <aside class="folder-page__tree">
        <div class="folder-page__tree-header">
          <span>目录</span>
          <el-button
            size="small"
            link
            type="primary"
            :icon="Plus"
            :disabled="!selectedEnvId"
            @click="
              () => {
                selectedId = ''
                openCreate()
              }
            "
          >
            新建顶级
          </el-button>
        </div>
        <div v-loading="treeLoading" class="folder-page__tree-body">
          <div
            v-if="rootFolders.length === 0"
            class="folder-page__tree-empty"
          >
            暂无顶级目录
          </div>
          <ul v-else class="tree">
            <li v-for="f in rootFolders" :key="f.id">
              <div
                class="tree__row"
                :class="{ 'is-selected': selectedId === f.id }"
                @click="onTreeNodeClick(f)"
              >
                <el-icon class="tree__icon"><FolderIcon /></el-icon>
                <span class="tree__name">{{ f.name }}</span>
                <span class="tree__code">{{ f.code }}</span>
              </div>
              <ul v-if="childrenById.get(f.id)?.length" class="tree tree--child">
                <li v-for="c in childrenById.get(f.id)" :key="c.id">
                  <div
                    class="tree__row"
                    :class="{ 'is-selected': selectedId === c.id }"
                    @click="onTreeNodeClick(c)"
                  >
                    <el-icon class="tree__icon tree__icon--child"><FolderIcon /></el-icon>
                    <span class="tree__name">{{ c.name }}</span>
                    <span class="tree__code">{{ c.code }}</span>
                  </div>
                </li>
              </ul>
            </li>
          </ul>
        </div>
      </aside>

      <!-- 右栏:详情 -->
      <main class="folder-page__detail">
        <!-- 面包屑 -->
        <nav class="crumb">
          <template v-for="(c, i) in breadcrumb" :key="c.id || 'env'">
            <span
              v-if="i < breadcrumb.length - 1"
              class="crumb__item crumb__item--link"
              @click="onBreadcrumbClick(c.id)"
            >
              {{ c.name }}
            </span>
            <span v-else class="crumb__item crumb__item--current">{{ c.name }}</span>
            <el-icon v-if="i < breadcrumb.length - 1" class="crumb__sep">
              <ArrowRight />
            </el-icon>
          </template>
        </nav>

        <!-- env 根视图(没选 folder) -->
        <section v-if="!selectedFolder" class="detail-empty">
          <h2>该环境下的所有顶级目录</h2>
          <p class="detail-empty__hint">
            从左侧选一个目录查看详情,或点击右上"新建顶级"创建一个。
          </p>
        </section>

        <!-- folder 详情 -->
        <template v-else>
          <header class="detail-header">
            <div>
              <h2>{{ selectedFolder.name }}</h2>
              <el-tag
                :type="selectedFolder.level === 1 ? 'primary' : 'info'"
                size="small"
                effect="light"
              >
                L{{ selectedFolder.level }}
              </el-tag>
            </div>
            <div class="detail-header__actions">
              <el-button
                type="primary"
                :icon="Plus"
                :disabled="!canCreateChild"
                @click="openCreate"
              >
                新建{{ selectedFolder.level === 1 ? '子' : '' }}目录
              </el-button>
              <el-button type="danger" :icon="Delete" @click="onDeleteCurrent">
                删除当前
              </el-button>
            </div>
          </header>

          <section class="detail-info">
            <el-descriptions :column="2" border size="small">
              <el-descriptions-item label="Code">{{ selectedFolder.code }}</el-descriptions-item>
              <el-descriptions-item label="父级">{{ parentLabel }}</el-descriptions-item>
              <el-descriptions-item label="创建人">
                {{ selectedFolder.createdByLabel || selectedFolder.createdBy }}
              </el-descriptions-item>
              <el-descriptions-item label="创建时间">
                {{ formatDateTime(selectedFolder.createdAt) }}
              </el-descriptions-item>
              <el-descriptions-item label="说明" :span="2">
                {{ selectedFolder.comment || '—' }}
              </el-descriptions-item>
            </el-descriptions>
          </section>

          <section v-if="selectedFolder.level === 1" class="detail-children">
            <h3>子目录 ({{ currentChildren.length }})</h3>
            <div v-if="currentChildren.length === 0" class="detail-children__empty">
              该目录下还没有子目录,点击右上"新建子目录"创建。
            </div>
            <div v-else class="detail-children__grid">
              <div
                v-for="c in currentChildren"
                :key="c.id"
                class="folder-card"
                @click="onChildCardClick(c)"
              >
                <el-icon class="folder-card__icon"><FolderIcon /></el-icon>
                <div class="folder-card__body">
                  <div class="folder-card__name">{{ c.name }}</div>
                  <div class="folder-card__code">{{ c.code }}</div>
                </div>
                <el-button
                  size="small"
                  :icon="Delete"
                  link
                  type="danger"
                  @click.stop="onDeleteChild(c)"
                />
              </div>
            </div>
          </section>
        </template>
      </main>
    </div>

    <!-- 新建目录 -->
    <el-dialog
      v-model="createDialogVisible"
      width="480px"
      :close-on-click-modal="false"
      :title="createTarget?.level === 1 ? '新建顶级目录' : '新建子目录'"
    >
      <el-form
        ref="createFormRef"
        :model="createForm"
        :rules="createRules"
        label-position="top"
      >
        <el-form-item label="Code" prop="code">
          <el-input v-model="createForm.code" placeholder="例如 globals / services" />
        </el-form-item>
        <el-form-item label="名称" prop="name">
          <el-input v-model="createForm.name" placeholder="Globals" />
        </el-form-item>
        <el-form-item
          label="预设"
          v-if="!createForm.code && createTarget?.level === 1"
        >
          <div class="folder-page__presets">
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
          <el-input v-model="createForm.comment" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="createSubmitting" @click="onCreateSubmit">
          创建
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style lang="scss" scoped>
.folder-page {
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
    grid-template-columns: 280px 1fr;
    gap: 16px;
    min-height: 480px;
  }

  // ---------------- 左栏:目录树 ----------------
  &__tree {
    background: var(--v-surface-bg);
    border: 1px solid var(--v-surface-border);
    border-radius: var(--v-radius-lg);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  &__tree-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border-bottom: 1px solid var(--v-divider);
    font-size: 13px;
    font-weight: 600;
    color: var(--v-text-primary);
  }

  &__tree-body {
    flex: 1;
    overflow-y: auto;
    padding: 6px 0;
  }

  &__tree-empty {
    padding: 24px 12px;
    text-align: center;
    color: var(--v-text-tertiary);
    font-size: 12px;
  }

  // ---------------- 右栏:详情 ----------------
  &__detail {
    background: var(--v-surface-bg);
    border: 1px solid var(--v-surface-border);
    border-radius: var(--v-radius-lg);
    padding: 18px 20px;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  &__presets {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
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
      width: 160px;
    }
  }
}

// ---------------- Tree 内部样式 ----------------
.tree {
  list-style: none;
  margin: 0;
  padding: 0;

  &--child {
    border-left: 1px dashed var(--v-divider);
    margin-left: 16px;
  }

  &__row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: var(--v-radius-sm);
    cursor: pointer;
    color: var(--v-text-primary);
    font-size: 13px;
    transition: background 0.15s ease;

    &:hover {
      background: var(--v-surface-row-hover);
    }

    &.is-selected {
      background: var(--el-color-primary-light-9);
      color: var(--el-color-primary);
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
}

// ---------------- 面包屑 ----------------
.crumb {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--v-text-secondary);

  &__item {
    &--link {
      cursor: pointer;
      color: var(--v-text-secondary);

      &:hover {
        color: var(--el-color-primary);
      }
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

// ---------------- 详情区 ----------------
.detail-empty {
  padding: 60px 24px;
  text-align: center;
  color: var(--v-text-tertiary);

  h2 {
    margin: 0 0 8px;
    font-size: 16px;
    font-weight: 600;
    color: var(--v-text-primary);
  }

  &__hint {
    margin: 0;
    font-size: 13px;
  }
}

.detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;

  h2 {
    display: inline-block;
    margin: 0 8px 0 0;
    font-size: 18px;
    font-weight: 600;
    color: var(--v-text-primary);
    vertical-align: middle;
  }

  &__actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }
}

.detail-info {
  :deep(.el-descriptions__label) {
    color: var(--v-text-secondary);
    width: 90px;
  }
}

.detail-children {
  h3 {
    margin: 0 0 12px;
    font-size: 14px;
    font-weight: 600;
    color: var(--v-text-primary);
  }

  &__empty {
    padding: 28px;
    text-align: center;
    color: var(--v-text-tertiary);
    font-size: 13px;
    background: var(--v-surface-bg-subtle);
    border-radius: var(--v-radius-md);
  }

  &__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 10px;
  }
}

.folder-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  background: var(--v-surface-bg-subtle);
  border: 1px solid var(--v-surface-border);
  border-radius: var(--v-radius-md);
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    border-color: var(--el-color-primary-light-5);
    background: var(--el-color-primary-light-9);
  }

  &__icon {
    font-size: 22px;
    color: var(--el-color-primary);
    flex-shrink: 0;
  }

  &__body {
    flex: 1;
    min-width: 0;
  }

  &__name {
    font-size: 13px;
    font-weight: 600;
    color: var(--v-text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__code {
    font-size: 11px;
    color: var(--v-text-tertiary);
    font-family: var(--el-font-family-monospace, ui-monospace, monospace);
  }
}
</style>
