<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ElMessage,
  type FormInstance,
  type FormRules,
} from 'element-plus'
import {
  ArrowRight,
  CircleClose,
  Delete,
  Edit,
  FolderOpened,
  Plus,
  Refresh,
  Search,
  View,
} from '@element-plus/icons-vue'
import { useEnvStore } from '@/stores/env'
import { useOrganizationStore } from '@/stores/organization'
import { useProjectStore } from '@/stores/project'
import { ApiError } from '@/types/api'
import { formatDateTime } from '@/utils/format'
import { getProjectOrgId } from '@/utils/project'
import { usePermission } from '@/composables/use-permission'
import { Permission } from '@/constants/permission'
import type { Organization } from '@/types/organization'
import type { Project } from '@/types/project'
import type { Environment } from '@/types/env'
import type { CreateEnvironmentRequest } from '@/api/env'

const route = useRoute()
const router = useRouter()
const envStore = useEnvStore()
const orgStore = useOrganizationStore()
const projectStore = useProjectStore()
const { has, rbac } = usePermission()

const selectedOrgId = ref<string>('')
const selectedProjectId = ref<string>('')
const searchKeyword = ref('')

const orgOptions = computed<Organization[]>(() => orgStore.items)
const projectOptions = computed<Project[]>(() =>
  projectStore.items.filter((p) => getProjectOrgId(p) === selectedOrgId.value),
)

// ==================== 列表 ====================
async function onRefresh(): Promise<void> {
  if (!selectedProjectId.value) return
  try {
    await envStore.fetchList({
      projectId: selectedProjectId.value,
      pageNum: envStore.lastQuery.pageNum ?? 1,
      pageSize: envStore.lastQuery.pageSize ?? 20,
    })
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : '加载失败'
    ElMessage.error(msg)
  }
}

function onOrgChange(orgId: string): void {
  selectedOrgId.value = orgId
  selectedProjectId.value = ''
  envStore.clear()
  if (!orgId) return
  // 加载该 org 下的 project 列表
  projectStore.fetchList({ orgId, pageNum: 1, pageSize: 100 }).catch(() => undefined)
}

function onProjectChange(projectId: string): void {
  selectedProjectId.value = projectId
  if (!projectId) {
    envStore.clear()
    return
  }
  envStore.fetchList({ projectId, pageNum: 1, pageSize: 20 }).catch((e: unknown) => {
    const msg = e instanceof ApiError ? e.message : '加载失败'
    ElMessage.error(msg)
  })
}

function onPageChange(pageNum: number, pageSize: number): void {
  if (!selectedProjectId.value) return
  envStore
    .fetchList({ projectId: selectedProjectId.value, pageNum, pageSize })
    .catch((e: unknown) => {
      const msg = e instanceof ApiError ? e.message : '加载失败'
      ElMessage.error(msg)
    })
}

// ==================== 创建 ====================
const createDialogVisible = ref(false)
const createSubmitting = ref(false)
const createFormRef = ref<FormInstance>()

const createForm = reactive<CreateEnvironmentRequest>({
  parentId: '',
  code: '',
  name: '',
  comment: '',
})

const createRules: FormRules<CreateEnvironmentRequest> = {
  parentId: [{ required: true, message: '请选择所属项目', trigger: 'change' }],
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

const DEFAULT_ENVS: Array<Pick<CreateEnvironmentRequest, 'code' | 'name'>> = [
  { code: 'dev', name: 'Development' },
  { code: 'test', name: 'Testing' },
  { code: 'staging', name: 'Staging' },
  { code: 'prod', name: 'Production' },
]

function resetCreateForm(): void {
  createForm.parentId = selectedProjectId.value
  createForm.code = ''
  createForm.name = ''
  createForm.comment = ''
  createFormRef.value?.clearValidate()
}

function openCreate(): void {
  resetCreateForm()
  createDialogVisible.value = true
}

function fillFromPreset(preset: (typeof DEFAULT_ENVS)[number]): void {
  createForm.code = preset.code
  createForm.name = preset.name
}

async function onCreateSubmit(): Promise<void> {
  if (!createFormRef.value) return
  const valid = await createFormRef.value.validate().catch(() => false)
  if (!valid) return
  createSubmitting.value = true
  try {
    await envStore.create({ ...createForm })
    ElMessage.success('创建成功')
    createDialogVisible.value = false
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : '创建失败'
    ElMessage.error(msg)
  } finally {
    createSubmitting.value = false
  }
}

// ==================== 查看 ====================
const viewDialogVisible = ref(false)
const viewTarget = ref<Environment | null>(null)

function openView(row: Environment): void {
  viewTarget.value = row
  viewDialogVisible.value = true
}

// ==================== 编辑 ====================
const editDialogVisible = ref(false)
const editSubmitting = ref(false)
const editFormRef = ref<FormInstance>()
const editTargetId = ref<string>('')
const editTargetCode = ref<string>('')

const editForm = reactive<{ name: string; comment: string }>({
  name: '',
  comment: '',
})

const editRules: FormRules<{ name: string; comment: string }> = {
  name: [
    { required: true, message: '请输入名称', trigger: 'blur' },
    { max: 64, message: '长度不能超过 64', trigger: 'blur' },
  ],
  comment: [{ max: 256, message: '长度不能超过 256', trigger: 'blur' }],
}

function openEdit(row: Environment): void {
  editTargetId.value = row.id
  editTargetCode.value = row.code
  editForm.name = row.name
  editForm.comment = row.comment ?? ''
  editFormRef.value?.clearValidate()
  editDialogVisible.value = true
}

async function onEditSubmit(): Promise<void> {
  if (!editFormRef.value) return
  const valid = await editFormRef.value.validate().catch(() => false)
  if (!valid) return
  editSubmitting.value = true
  try {
    await envStore.update({
      id: editTargetId.value,
      parentId: selectedProjectId.value,
      name: editForm.name.trim(),
      comment: editForm.comment?.trim() || undefined,
    })
    ElMessage.success('已保存')
    editDialogVisible.value = false
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : '保存失败'
    ElMessage.error(msg)
  } finally {
    editSubmitting.value = false
  }
}

// ==================== 删除 ====================
const deleteDialogVisible = ref(false)
const deleteSubmitting = ref(false)
const deleteTarget = ref<Environment | null>(null)
const forceChecked = ref(false)

function openDelete(row: Environment): void {
  deleteTarget.value = row
  forceChecked.value = false
  deleteDialogVisible.value = true
}

async function onDeleteConfirm(): Promise<void> {
  const target = deleteTarget.value
  if (!target) return
  if (forceChecked.value && !has(Permission.EnvForceDelete)) {
    ElMessage.warning('当前账号没有级联删除权限')
    return
  }
  deleteSubmitting.value = true
  try {
    const res = await envStore.remove({
      id: target.id,
      parentId: selectedProjectId.value,
      force: forceChecked.value || undefined,
    })
    if (res.deleted) {
      ElMessage.success(forceChecked.value ? '已级联删除' : '已删除')
      deleteDialogVisible.value = false
    }
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : '删除失败'
    ElMessage.error(msg)
  } finally {
    deleteSubmitting.value = false
  }
}

// ==================== 跳转到项目详情(目录与密钥在项目详情页内浏览) ====================
function goToFolders(row: Environment): void {
  router.push({
    name: 'ProjectDetail',
    params: { projectId: selectedProjectId.value },
    query: {
      orgId: selectedOrgId.value,
      envId: row.id,
    },
  })
}

function onRowAction(
  action: 'view' | 'edit' | 'delete' | 'goFolders',
  row: Environment,
): void {
  if (action === 'view') openView(row)
  else if (action === 'edit') {
    if (!has(Permission.EnvUpdate)) {
      ElMessage.warning('当前账号没有 env:update 权限')
      return
    }
    openEdit(row)
  } else if (action === 'goFolders') {
    if (!has(Permission.FolderRead)) {
      ElMessage.warning('当前账号没有 folder:read 权限')
      return
    }
    goToFolders(row)
  } else {
    if (!has(Permission.EnvDelete)) {
      ElMessage.warning('当前账号没有 env:delete 权限')
      return
    }
    openDelete(row)
  }
}

onMounted(async () => {
  // 1. 加载 org 列表
  if (orgStore.items.length === 0) {
    try {
      await orgStore.fetchList({ pageNum: 1, pageSize: 100 })
    } catch {
      // 忽略
    }
  }

  // 2. 从 query 预选 org + project
  const presetOrgId = (route.query.orgId as string | undefined) ?? ''
  const presetProjectId = (route.query.projectId as string | undefined) ?? ''

  if (presetOrgId && orgStore.items.some((o) => o.id === presetOrgId)) {
    onOrgChange(presetOrgId)
    if (presetProjectId) {
      // 等待 project 列表加载
      await projectStore
        .fetchList({ orgId: presetOrgId, pageNum: 1, pageSize: 100 })
        .catch(() => undefined)
      if (projectStore.items.some((p) => p.id === presetProjectId)) {
        onProjectChange(presetProjectId)
      }
    }
  } else if (orgStore.items.length > 0) {
    const first = orgStore.items[0]
    if (first) onOrgChange(first.id)
  }
})

// 监听 query 变化(支持跨页跳转)
watch(
  () => [route.query.orgId, route.query.projectId],
  ([orgId, projectId]) => {
    const o = (orgId as string | undefined) ?? ''
    const p = (projectId as string | undefined) ?? ''
    if (o && o !== selectedOrgId.value) onOrgChange(o)
    else if (p && p !== selectedProjectId.value) onProjectChange(p)
  },
)

// 选中 project 后,切 rbac 当前 scope 到 project 级别
watch(
  () => selectedProjectId.value,
  (projectId) => {
    if (projectId) void rbac.setCurrentScope({ scopeType: 'project', scopeId: projectId })
  },
)
</script>

<template>
  <div class="env-page">
    <header class="page-header">
      <div>
        <h1 class="page-header__title">环境管理</h1>
        <p class="page-header__desc">
          环境从属于项目,如 dev / test / prod。环境创建后不会自动建任何 folder,需要在
          folder 页补建。
        </p>
      </div>
      <div class="page-header__actions">
        <el-button :icon="Refresh" :disabled="!selectedProjectId" @click="onRefresh">
          刷新
        </el-button>
        <el-select
          v-model="selectedOrgId"
          placeholder="选择组织"
          class="page-header__picker"
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
          placeholder="选择项目"
          class="page-header__picker"
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
        <el-input
          v-model="searchKeyword"
          placeholder="按 code / 名称筛选"
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
          :disabled="!selectedProjectId || !has(Permission.EnvCreate)"
          :title="!has(Permission.EnvCreate) ? '当前账号没有 env:create 权限' : ''"
          @click="openCreate"
        >
          新建环境
        </el-button>
      </div>
    </header>

    <div class="env-page__surface">
      <el-table
        v-loading="envStore.loading"
        :data="envStore.items"
        class="env-page__table"
        :empty-text="selectedProjectId ? '该项目下暂无环境' : '请先选择项目'"
      >
        <el-table-column prop="code" label="Code" min-width="140">
          <template #default="{ row }">
            <span class="env-page__code">{{ row.code }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="name" label="名称" min-width="160" />
        <el-table-column prop="comment" label="说明" min-width="200" show-overflow-tooltip>
          <template #default="{ row }">
            <span class="env-page__comment">{{ row.comment || '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="createdByLabel" label="创建人" min-width="120">
          <template #default="{ row }">
            <span class="env-page__muted">
              {{ row.createdByLabel || row.createdBy }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" min-width="160">
          <template #default="{ row }">
            <span class="env-page__muted">{{ formatDateTime(row.createdAt) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="320" fixed="right">
          <template #default="{ row }">
            <el-button
              link
              type="primary"
              :icon="View"
              @click="onRowAction('view', row as Environment)"
            >
              查看
            </el-button>
            <el-button
              link
              type="primary"
              :icon="Edit"
              :disabled="!has(Permission.EnvUpdate)"
              @click="onRowAction('edit', row as Environment)"
            >
              编辑
            </el-button>
            <el-button
              link
              type="primary"
              :icon="FolderOpened"
              :disabled="!has(Permission.FolderRead)"
              @click="onRowAction('goFolders', row as Environment)"
            >
              目录
            </el-button>
            <el-button
              link
              type="danger"
              :icon="Delete"
              :disabled="!has(Permission.EnvDelete)"
              @click="onRowAction('delete', row as Environment)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="env-page__pager">
        <el-pagination
          background
          layout="total, prev, pager, next, sizes"
          :total="envStore.total"
          :current-page="envStore.lastQuery.pageNum ?? 1"
          :page-size="envStore.lastQuery.pageSize ?? 20"
          :page-sizes="[10, 20, 50, 100]"
          @current-change="(p: number) => onPageChange(p, envStore.lastQuery.pageSize ?? 20)"
          @size-change="(s: number) => onPageChange(1, s)"
        />
      </div>
    </div>

    <div v-if="!selectedProjectId" class="env-page__hint-bar">
      <el-icon><CircleClose /></el-icon>
      <span>请先在右上角选择组织与项目,再进行环境管理。</span>
    </div>

    <!-- 新建环境 -->
    <el-dialog
      v-model="createDialogVisible"
      width="520px"
      :close-on-click-modal="false"
      @closed="resetCreateForm"
    >
      <template #header>
        <div class="env-page__dialog-header">
          <span class="env-page__dialog-icon env-page__dialog-icon--create">
            <el-icon><Plus /></el-icon>
          </span>
          <span>新建环境</span>
        </div>
      </template>
      <el-form
        ref="createFormRef"
        :model="createForm"
        :rules="createRules"
        label-position="top"
      >
        <el-form-item label="所属项目" prop="parentId">
          <el-input
            :model-value="
              projectOptions.find((p) => p.id === selectedProjectId)?.name ?? selectedProjectId
            "
            disabled
          />
        </el-form-item>
        <el-form-item label="Code" prop="code">
          <el-input v-model="createForm.code" placeholder="例如 dev / staging / prod" />
        </el-form-item>
        <el-form-item label="名称" prop="name">
          <el-input v-model="createForm.name" placeholder="Development" />
        </el-form-item>
        <el-form-item label="预设" v-if="!createForm.code">
          <div class="env-page__presets">
            <el-button
              v-for="p in DEFAULT_ENVS"
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
          <el-input v-model="createForm.comment" type="textarea" :rows="3" />
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

    <!-- 查看 -->
    <el-dialog v-model="viewDialogVisible" width="520px">
      <template #header>
        <div class="env-page__dialog-header">
          <span class="env-page__dialog-icon env-page__dialog-icon--view">
            <el-icon><View /></el-icon>
          </span>
          <span>环境详情</span>
        </div>
      </template>
      <el-descriptions v-if="viewTarget" :column="1" border>
        <el-descriptions-item label="Code">
          <span class="env-page__code">{{ viewTarget.code }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="名称">{{ viewTarget.name }}</el-descriptions-item>
        <el-descriptions-item label="说明">
          {{ viewTarget.comment || '—' }}
        </el-descriptions-item>
        <el-descriptions-item label="创建人">
          {{ viewTarget.createdByLabel || viewTarget.createdBy }}
        </el-descriptions-item>
        <el-descriptions-item label="创建时间">
          {{ formatDateTime(viewTarget.createdAt) }}
        </el-descriptions-item>
        <el-descriptions-item label="更新人">
          {{ viewTarget.updatedByLabel || viewTarget.updatedBy }}
        </el-descriptions-item>
        <el-descriptions-item label="更新时间">
          {{ formatDateTime(viewTarget.updatedAt) }}
        </el-descriptions-item>
        <el-descriptions-item label="ID">
          <span class="env-page__id">{{ viewTarget.id }}</span>
        </el-descriptions-item>
      </el-descriptions>
      <template #footer>
        <el-button @click="viewDialogVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- 编辑 -->
    <el-dialog v-model="editDialogVisible" width="480px" :close-on-click-modal="false">
      <template #header>
        <div class="env-page__dialog-header">
          <span class="env-page__dialog-icon env-page__dialog-icon--edit">
            <el-icon><Edit /></el-icon>
          </span>
          <span>编辑环境</span>
        </div>
      </template>
      <el-form ref="editFormRef" :model="editForm" :rules="editRules" label-position="top">
        <el-form-item label="Code">
          <el-input v-model="editTargetCode" disabled />
          <span class="env-page__hint">Code 创建后不可修改</span>
        </el-form-item>
        <el-form-item label="名称" prop="name">
          <el-input v-model="editForm.name" />
        </el-form-item>
        <el-form-item label="说明" prop="comment">
          <el-input v-model="editForm.comment" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
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

    <!-- 删除 -->
    <el-dialog v-model="deleteDialogVisible" width="460px" :close-on-click-modal="false">
      <template #header>
        <div class="env-page__dialog-header">
          <span class="env-page__dialog-icon env-page__dialog-icon--delete">
            <el-icon><Delete /></el-icon>
          </span>
          <span>删除环境</span>
        </div>
      </template>
      <p v-if="deleteTarget" class="env-page__confirm-text">
        确定要删除环境 <b>{{ deleteTarget.name }}</b>(<code>{{ deleteTarget.code }}</code>)吗?
      </p>
      <p class="env-page__confirm-warn">删除后不可恢复,请谨慎操作。</p>
      <el-checkbox
        v-model="forceChecked"
        :disabled="!has(Permission.EnvForceDelete)"
        class="env-page__force"
      >
        级联删除(含其下所有目录、密钥)
      </el-checkbox>
      <p v-if="!has(Permission.EnvForceDelete)" class="env-page__hint">
        当前账号没有 <code>env:force_delete</code> 权限,如需级联删除请联系管理员。
      </p>
      <template #footer>
        <el-button @click="deleteDialogVisible = false">取消</el-button>
        <el-button
          type="danger"
          :loading="deleteSubmitting"
          @click="onDeleteConfirm"
        >
          {{ forceChecked ? '级联删除' : '删除' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style lang="scss" scoped>
.env-page {
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

  &__code {
    font-family: var(--el-font-family-monospace, ui-monospace, SFMono-Regular, monospace);
    font-size: 13px;
    color: var(--v-text-primary);
    background: var(--v-surface-bg-subtle);
    padding: 2px 8px;
    border-radius: var(--v-radius-sm);
  }

  &__comment {
    color: var(--v-text-secondary);
  }

  &__muted {
    color: var(--v-text-secondary);
    font-size: 13px;
  }

  &__id {
    font-family: var(--el-font-family-monospace, ui-monospace, SFMono-Regular, monospace);
    font-size: 12px;
    color: var(--v-text-tertiary);
    word-break: break-all;
  }

  &__hint {
    display: block;
    margin-top: 4px;
    color: var(--v-text-secondary);
    font-size: 12px;
  }

  &__confirm-text {
    margin: 0 0 8px;
    color: var(--v-text-primary);
  }

  &__confirm-warn {
    margin: 0 0 12px;
    color: var(--v-color-warning);
    font-size: 13px;
  }

  &__force {
    margin-top: 4px;
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
      background: rgba(245, 158, 11, 0.1);
      color: var(--v-color-warning);
    }

    &--delete {
      background: rgba(220, 38, 38, 0.1);
      color: var(--v-color-danger);
    }
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
    width: 200px;
  }

  &__search {
    width: 200px;
  }
}

code {
  font-family: var(--el-font-family-monospace, ui-monospace, SFMono-Regular, monospace);
  font-size: 0.92em;
  background: var(--v-fill-color-light, #f4f4f5);
  padding: 0 4px;
  border-radius: 3px;
}
</style>
