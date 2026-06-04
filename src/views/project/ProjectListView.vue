<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import {
  ArrowRight,
  Delete,
  Edit,
  Plus,
  Position,
  Refresh,
  Search,
  View,
} from '@element-plus/icons-vue'
import { useProjectStore } from '@/stores/project'
import { useOrganizationStore } from '@/stores/organization'
import { ApiError, ConflictError, NotFoundError } from '@/types/api'
import { formatDateTime } from '@/utils/format'
import { usePermission } from '@/composables/use-permission'
import { Permission } from '@/constants/permission'
import type { Project } from '@/types/project'
import type { Organization } from '@/types/organization'
import type {
  CreateProjectRequest,
  UpdateProjectRequest,
} from '@/api/project'
import type { EnvSpec } from '@/types/project'

const projectStore = useProjectStore()
const orgStore = useOrganizationStore()
const { has } = usePermission()
const router = useRouter()

const selectedOrgId = ref<string>('')
const searchKeyword = ref('')

// ==================== 列表 ====================
const orgOptions = computed<Organization[]>(() => orgStore.items)

async function onRefresh(): Promise<void> {
  if (!selectedOrgId.value) return
  try {
    await projectStore.fetchList({
      orgId: selectedOrgId.value,
      pageNum: projectStore.lastQuery.pageNum ?? 1,
      pageSize: projectStore.lastQuery.pageSize ?? 20,
    })
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : '加载失败'
    ElMessage.error(msg)
  }
}

function onOrgChange(orgId: string): void {
  selectedOrgId.value = orgId
  projectStore.fetchList({ orgId, pageNum: 1, pageSize: 20 }).catch((e: unknown) => {
    const msg = e instanceof ApiError ? e.message : '加载失败'
    ElMessage.error(msg)
  })
}

function onPageChange(pageNum: number, pageSize: number): void {
  if (!selectedOrgId.value) return
  projectStore.fetchList({ orgId: selectedOrgId.value, pageNum, pageSize }).catch((e: unknown) => {
    const msg = e instanceof ApiError ? e.message : '加载失败'
    ElMessage.error(msg)
  })
}

// ==================== 创建项目 ====================
const createDialogVisible = ref(false)
const createSubmitting = ref(false)
const createFormRef = ref<FormInstance>()

interface ProjectFormModel {
  parentId: string
  code: string
  name: string
  comment: string
  environments: EnvSpec[]
}

const createForm = reactive<ProjectFormModel>({
  parentId: '',
  code: '',
  name: '',
  comment: '',
  environments: [],
})

const createRules: FormRules<ProjectFormModel> = {
  parentId: [{ required: true, message: '请选择所属组织', trigger: 'change' }],
  code: [
    { required: true, message: '请输入 code', trigger: 'blur' },
    {
      pattern: /^[a-z0-9]+(-[a-z0-9]+)*$/,
      message: '仅小写字母、数字、中横线,且不能以中横线开头或结尾',
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

const envCodeRules = {
  code: [
    { required: true, message: '必填', trigger: 'blur' },
    {
      pattern: /^[a-z0-9]+(-[a-z0-9]+)*$/,
      message: '仅小写字母、数字、中横线',
      trigger: 'blur',
    },
  ],
  name: [{ required: true, message: '必填', trigger: 'blur' }],
}

const DEFAULT_ENVS: Array<Pick<EnvSpec, 'code' | 'name' | 'comment'>> = [
  { code: 'dev', name: 'Development', comment: '' },
  { code: 'test', name: 'Testing', comment: '' },
  { code: 'sim', name: 'Simulation', comment: '' },
  { code: 'prod', name: 'Production', comment: '' },
]

function resetCreateForm(): void {
  createForm.parentId = selectedOrgId.value
  createForm.code = ''
  createForm.name = ''
  createForm.comment = ''
  createForm.environments = []
  createFormRef.value?.clearValidate()
}

function openCreate(): void {
  resetCreateForm()
  createDialogVisible.value = true
}

function addEnvRow(): void {
  createForm.environments.push({ code: '', name: '', comment: '' })
}

function addDefaultEnv(env: (typeof DEFAULT_ENVS)[number]): void {
  if (createForm.environments.some((e) => e.code === env.code)) {
    ElMessage.warning(`已存在 ${env.code}`)
    return
  }
  createForm.environments.push({ ...env })
}

function removeEnvRow(idx: number): void {
  createForm.environments.splice(idx, 1)
}

async function onCreateSubmit(): Promise<void> {
  if (!createFormRef.value) return
  const valid = await createFormRef.value.validate().catch(() => false)
  if (!valid) return
  createSubmitting.value = true
  try {
    const req: CreateProjectRequest = {
      parentId: createForm.parentId,
      code: createForm.code,
      name: createForm.name,
      comment: createForm.comment,
      environments: createForm.environments.length > 0 ? createForm.environments : undefined,
    }
    await projectStore.create(req)
    ElMessage.success('创建成功')
    createDialogVisible.value = false
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : '创建失败'
    ElMessage.error(msg)
  } finally {
    createSubmitting.value = false
  }
}

// ==================== 查看项目 ====================
const viewDialogVisible = ref(false)
const viewTarget = ref<Project | null>(null)

function openView(row: Project): void {
  viewTarget.value = row
  viewDialogVisible.value = true
}

// ==================== 编辑项目 ====================
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

function openEdit(row: Project): void {
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
  const req: UpdateProjectRequest = {
    id: editTargetId.value,
    parentId: selectedOrgId.value,
    name: editForm.name.trim(),
    comment: editForm.comment?.trim() || undefined,
  }
  try {
    await projectStore.update(req)
    ElMessage.success('已保存')
    editDialogVisible.value = false
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : '保存失败'
    ElMessage.error(msg)
  } finally {
    editSubmitting.value = false
  }
}

// ==================== 删除项目 ====================
const deleteDialogVisible = ref(false)
const deleteSubmitting = ref(false)
const deleteTarget = ref<Project | null>(null)
const forceChecked = ref(false)

function openDelete(row: Project): void {
  deleteTarget.value = row
  forceChecked.value = false
  deleteDialogVisible.value = true
}

async function onDeleteConfirm(): Promise<void> {
  const target = deleteTarget.value
  if (!target) return
  if (forceChecked.value && !has(Permission.ProjectForceDelete)) {
    ElMessage.warning('当前账号没有级联删除权限')
    return
  }
  deleteSubmitting.value = true
  try {
    const res = await projectStore.remove({
      id: target.id,
      parentId: selectedOrgId.value,
      force: forceChecked.value || undefined,
    })
    if (res.deleted) {
      ElMessage.success(forceChecked.value ? '已级联删除' : '已删除')
      deleteDialogVisible.value = false
    }
  } catch (e) {
    if (e instanceof ConflictError) {
      forceChecked.value = true
      ElMessage.warning('该项目下存在活跃子资源,请确认级联删除')
      return
    }
    if (e instanceof NotFoundError) {
      ElMessage.warning('项目已不存在,刷新列表')
      deleteDialogVisible.value = false
      await onRefresh()
      return
    }
    const msg = e instanceof ApiError ? e.message : '删除失败'
    ElMessage.error(msg)
  } finally {
    deleteSubmitting.value = false
  }
}

function onRowAction(action: 'view' | 'edit' | 'delete' | 'goEnvs', row: Project): void {
  if (action === 'view') openView(row)
  else if (action === 'edit') openEdit(row)
  else if (action === 'goEnvs') {
    router.push({
      path: '/app/envs',
      query: { orgId: selectedOrgId.value, projectId: row.id },
    })
  } else openDelete(row)
}

onMounted(async () => {
  if (orgStore.items.length === 0) {
    try {
      await orgStore.fetchList({ pageNum: 1, pageSize: 100 })
    } catch {
      // 忽略,UI 仍可显示空态
    }
  }
  if (orgStore.items.length > 0) {
    const first = orgStore.items[0]
    if (first) {
      selectedOrgId.value = first.id
      onOrgChange(first.id)
    }
  }
})
</script>

<template>
  <div class="project-page">
    <header class="page-header">
      <div>
        <h1 class="page-header__title">项目管理</h1>
        <p class="page-header__desc">项目归属于组织,环境在创建项目时可选内联创建。</p>
      </div>
      <div class="page-header__actions">
        <el-button :icon="Refresh" :disabled="!selectedOrgId" @click="onRefresh">刷新</el-button>
        <el-select
          v-model="selectedOrgId"
          placeholder="选择组织"
          class="page-header__org-picker"
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
          :disabled="!selectedOrgId"
          @click="openCreate"
        >
          新建项目
        </el-button>
      </div>
    </header>

    <div class="project-page__surface">
      <el-table
        v-loading="projectStore.loading"
        :data="projectStore.items"
        class="project-page__table"
        empty-text="该项目下暂无项目"
      >
        <el-table-column prop="code" label="Code" min-width="160">
          <template #default="{ row }">
            <span class="project-page__code">{{ row.code }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="name" label="名称" min-width="160" />
        <el-table-column prop="comment" label="说明" min-width="220" show-overflow-tooltip>
          <template #default="{ row }">
            <span class="project-page__comment">{{ row.comment || '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="createdByLabel" label="创建人" min-width="120">
          <template #default="{ row }">
            <span class="project-page__muted">
              {{ row.createdByLabel || row.createdBy }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" min-width="160">
          <template #default="{ row }">
            <span class="project-page__muted">{{ formatDateTime(row.createdAt) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="320" fixed="right">
          <template #default="{ row }">
            <el-button
              link
              type="primary"
              :icon="View"
              @click="onRowAction('view', row as Project)"
            >
              查看
            </el-button>
            <el-button
              link
              type="primary"
              :icon="Edit"
              @click="onRowAction('edit', row as Project)"
            >
              编辑
            </el-button>
            <el-button
              link
              type="primary"
              :icon="Position"
              @click="onRowAction('goEnvs', row as Project)"
            >
              环境
            </el-button>
            <el-button
              link
              type="danger"
              :icon="Delete"
              @click="onRowAction('delete', row as Project)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="project-page__pager">
        <el-pagination
          background
          layout="total, prev, pager, next, sizes"
          :total="projectStore.total"
          :current-page="projectStore.lastQuery.pageNum ?? 1"
          :page-size="projectStore.lastQuery.pageSize ?? 20"
          :page-sizes="[10, 20, 50, 100]"
          @current-change="(p: number) => onPageChange(p, projectStore.lastQuery.pageSize ?? 20)"
          @size-change="(s: number) => onPageChange(1, s)"
        />
      </div>
    </div>

    <!-- 新建项目 -->
    <el-dialog
      v-model="createDialogVisible"
      width="640px"
      :close-on-click-modal="false"
      @closed="resetCreateForm"
    >
      <template #header>
        <div class="project-page__dialog-header">
          <span class="project-page__dialog-icon project-page__dialog-icon--create">
            <el-icon><Plus /></el-icon>
          </span>
          <span>新建项目</span>
        </div>
      </template>
      <el-form ref="createFormRef" :model="createForm" :rules="createRules" label-position="top">
        <el-form-item label="所属组织" prop="parentId">
          <el-select v-model="createForm.parentId" placeholder="请选择" style="width: 100%" filterable>
            <el-option
              v-for="o in orgOptions"
              :key="o.id"
              :label="`${o.name} (${o.code})`"
              :value="o.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="Code" prop="code">
          <el-input v-model="createForm.code" placeholder="例如 project-a" />
        </el-form-item>
        <el-form-item label="名称" prop="name">
          <el-input v-model="createForm.name" placeholder="项目 A" />
        </el-form-item>
        <el-form-item label="说明" prop="comment">
          <el-input v-model="createForm.comment" type="textarea" :rows="2" />
        </el-form-item>

        <el-form-item label="内联创建环境(可选)">
          <div class="env-block">
            <div class="env-block__presets">
              <span class="env-block__label">一键添加:</span>
              <el-button
                v-for="d in DEFAULT_ENVS"
                :key="d.code"
                size="small"
                plain
                @click="addDefaultEnv(d)"
              >
                {{ d.code }}
              </el-button>
              <el-button size="small" plain :icon="Plus" @click="addEnvRow">自定义</el-button>
            </div>

            <div v-if="createForm.environments.length > 0" class="env-block__list">
              <div
                v-for="(env, idx) in createForm.environments"
                :key="idx"
                class="env-row"
              >
                <el-form-item
                  :prop="`environments.${idx}.code`"
                  :rules="envCodeRules.code"
                  class="env-row__field"
                >
                  <el-input v-model="env.code" placeholder="code, 小写中横线" />
                </el-form-item>
                <el-form-item
                  :prop="`environments.${idx}.name`"
                  :rules="envCodeRules.name"
                  class="env-row__field"
                >
                  <el-input v-model="env.name" placeholder="name" />
                </el-form-item>
                <el-form-item class="env-row__field env-row__field--comment">
                  <el-input v-model="env.comment" placeholder="说明(可选)" />
                </el-form-item>
                <el-button text type="danger" @click="removeEnvRow(idx)">移除</el-button>
              </div>
            </div>
            <p v-else class="env-block__empty">不添加则项目下不创建任何 env,后续在 env 页补建。</p>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="createSubmitting" @click="onCreateSubmit">
          创建
        </el-button>
      </template>
    </el-dialog>

    <!-- 查看 -->
    <el-dialog v-model="viewDialogVisible" width="520px">
      <template #header>
        <div class="project-page__dialog-header">
          <span class="project-page__dialog-icon project-page__dialog-icon--view">
            <el-icon><View /></el-icon>
          </span>
          <span>项目详情</span>
        </div>
      </template>
      <el-descriptions v-if="viewTarget" :column="1" border>
        <el-descriptions-item label="Code">
          <span class="project-page__code">{{ viewTarget.code }}</span>
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
          <span class="project-page__id">{{ viewTarget.id }}</span>
        </el-descriptions-item>
      </el-descriptions>
      <template #footer>
        <el-button @click="viewDialogVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- 编辑 -->
    <el-dialog
      v-model="editDialogVisible"
      width="480px"
      :close-on-click-modal="false"
    >
      <template #header>
        <div class="project-page__dialog-header">
          <span class="project-page__dialog-icon project-page__dialog-icon--edit">
            <el-icon><Edit /></el-icon>
          </span>
          <span>编辑项目</span>
        </div>
      </template>
      <el-form ref="editFormRef" :model="editForm" :rules="editRules" label-position="top">
        <el-form-item label="Code">
          <el-input v-model="editTargetCode" disabled />
          <span class="project-page__hint">Code 创建后不可修改</span>
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
        <el-button type="primary" :loading="editSubmitting" @click="onEditSubmit">
          保存
          <el-icon class="el-icon--right"><ArrowRight /></el-icon>
        </el-button>
      </template>
    </el-dialog>

    <!-- 删除 -->
    <el-dialog
      v-model="deleteDialogVisible"
      width="460px"
      :close-on-click-modal="false"
    >
      <template #header>
        <div class="project-page__dialog-header">
          <span class="project-page__dialog-icon project-page__dialog-icon--delete">
            <el-icon><Delete /></el-icon>
          </span>
          <span>删除项目</span>
        </div>
      </template>
      <p v-if="deleteTarget" class="project-page__confirm-text">
        确定要删除项目 <b>{{ deleteTarget.name }}</b>(<code>{{ deleteTarget.code }}</code>)吗?
      </p>
      <p class="project-page__confirm-warn">删除后不可恢复,请谨慎操作。</p>
      <el-checkbox
        v-model="forceChecked"
        :disabled="!has(Permission.ProjectForceDelete)"
        class="project-page__force"
      >
        级联删除(含其下所有环境、目录、密钥)
      </el-checkbox>
      <p v-if="!has(Permission.ProjectForceDelete)" class="project-page__hint">
        当前账号没有 <code>project:force_delete</code> 权限,如需级联删除请联系管理员。
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
.project-page {
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

  &__row-trigger {
    color: var(--v-text-tertiary) !important;

    &:hover {
      color: var(--v-text-primary) !important;
      background: var(--v-surface-row-hover) !important;
    }
  }

  &__pager {
    display: flex;
    justify-content: flex-end;
    padding: 12px 16px;
    border-top: 1px solid var(--v-divider);
  }

  &__id {
    font-family: var(--el-font-family-monospace, ui-monospace, SFMono-Regular, monospace);
    font-size: 12px;
    color: var(--v-text-secondary);
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
  }

  &__actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  &__org-picker {
    width: 220px;
  }

  &__search {
    width: 240px;
  }
}

.env-block {
  width: 100%;

  &__presets {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 12px;
  }

  &__label {
    color: var(--v-text-secondary);
    font-size: 13px;
    margin-right: 4px;
  }

  &__list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  &__empty {
    margin: 0;
    color: var(--v-text-tertiary);
    font-size: 12px;
  }
}

.env-row {
  display: flex;
  align-items: center;
  gap: 8px;

  &__field {
    margin-bottom: 0;
    flex: 1;
  }

  &__field--comment {
    flex: 1.2;
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
