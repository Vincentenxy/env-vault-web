<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import {
  ElMessage,
  type FormInstance,
  type FormRules,
} from 'element-plus'
import {
  ArrowRight,
  Delete,
  Edit,
  Plus,
  Refresh,
  Search,
  View,
} from '@element-plus/icons-vue'
import { useOrganizationStore } from '@/stores/organization'
import { ApiError } from '@/types/api'
import { formatDateTime } from '@/utils/format'
import { usePermission } from '@/composables/use-permission'
import { Permission } from '@/constants/permission'
import type { Organization } from '@/types/organization'
import type {
  CreateOrganizationRequest,
  UpdateOrganizationRequest,
} from '@/api/organization'

const orgStore = useOrganizationStore()
const { has } = usePermission()

const searchKeyword = ref('')

// ==================== 创建组织 ====================
const createDialogVisible = ref(false)
const createSubmitting = ref(false)
const createFormRef = ref<FormInstance>()

const createForm = reactive<CreateOrganizationRequest>({
  code: '',
  name: '',
  comment: '',
})

const createRules: FormRules<CreateOrganizationRequest> = {
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

function resetCreateForm(): void {
  createForm.code = ''
  createForm.name = ''
  createForm.comment = ''
  createFormRef.value?.clearValidate()
}

function openCreate(): void {
  resetCreateForm()
  createDialogVisible.value = true
}

async function onCreateSubmit(): Promise<void> {
  if (!createFormRef.value) return
  const valid = await createFormRef.value.validate().catch(() => false)
  if (!valid) return
  createSubmitting.value = true
  try {
    await orgStore.create({ ...createForm })
    ElMessage.success('创建成功')
    createDialogVisible.value = false
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : '创建失败'
    ElMessage.error(msg)
  } finally {
    createSubmitting.value = false
  }
}

// ==================== 查看组织 ====================
const viewDialogVisible = ref(false)
const viewTarget = ref<Organization | null>(null)

function openView(row: Organization): void {
  viewTarget.value = row
  viewDialogVisible.value = true
}

// ==================== 编辑组织 ====================
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

function openEdit(row: Organization): void {
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
  const req: UpdateOrganizationRequest = {
    id: editTargetId.value,
    name: editForm.name.trim(),
    comment: editForm.comment?.trim() || undefined,
  }
  try {
    await orgStore.update(req)
    ElMessage.success('已保存')
    editDialogVisible.value = false
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : '保存失败'
    ElMessage.error(msg)
  } finally {
    editSubmitting.value = false
  }
}

// ==================== 删除组织 ====================
const deleteDialogVisible = ref(false)
const deleteSubmitting = ref(false)
const deleteTarget = ref<Organization | null>(null)
const forceChecked = ref(false)

function openDelete(row: Organization): void {
  deleteTarget.value = row
  forceChecked.value = false
  deleteDialogVisible.value = true
}

/**
 * 后端默认 force=false:有 active child project 时返回 409。
 * 第一次不带 force 尝试;若 409,弹框继续显示,让用户勾选"级联删除"重试 force=true。
 * force=true 需 org:force_delete 权限(后端再校验 1403)。
 */
async function onDeleteConfirm(): Promise<void> {
  const target = deleteTarget.value
  if (!target) return
  if (forceChecked.value && !has(Permission.OrgForceDelete)) {
    ElMessage.warning('当前账号没有级联删除权限')
    return
  }
  deleteSubmitting.value = true
  try {
    const res = await orgStore.remove({
      id: target.id,
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

// ==================== 列表 ====================
async function onRefresh(): Promise<void> {
  try {
    await orgStore.fetchList({
      pageNum: orgStore.lastQuery.pageNum ?? 1,
      pageSize: orgStore.lastQuery.pageSize ?? 20,
    })
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : '加载失败'
    ElMessage.error(msg)
  }
}

function onPageChange(pageNum: number, pageSize: number): void {
  orgStore.fetchList({ pageNum, pageSize }).catch((e: unknown) => {
    const msg = e instanceof ApiError ? e.message : '加载失败'
    ElMessage.error(msg)
  })
}

function onRowAction(action: 'view' | 'edit' | 'delete', row: Organization): void {
  if (action === 'view') openView(row)
  else if (action === 'edit') {
    if (!has(Permission.OrgUpdate)) {
      ElMessage.warning('当前账号没有 org:update 权限')
      return
    }
    openEdit(row)
  } else {
    if (!has(Permission.OrgDelete)) {
      ElMessage.warning('当前账号没有 org:delete 权限')
      return
    }
    openDelete(row)
  }
}

onMounted(() => {
  onRefresh()
})
</script>

<template>
  <div class="org-page">
    <!-- 页面标题区 -->
    <header class="page-header">
      <div>
        <h1 class="page-header__title">组织管理</h1>
        <p class="page-header__desc">维护平台中的组织,组织是最高的业务隔离单元。</p>
      </div>
      <div class="page-header__actions">
        <el-button :icon="Refresh" @click="onRefresh">刷新</el-button>
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
          :disabled="!has(Permission.OrgCreate)"
          :title="!has(Permission.OrgCreate) ? '当前账号没有 org:create 权限' : ''"
          @click="openCreate"
        >
          新建组织
        </el-button>
      </div>
    </header>

    <!-- 表格卡片 -->
    <div class="org-page__surface">
      <el-table
        v-loading="orgStore.loading"
        :data="orgStore.items"
        class="org-page__table"
        empty-text="暂无组织"
      >
        <el-table-column prop="code" label="Code" min-width="160">
          <template #default="{ row }">
            <span class="org-page__code">{{ row.code }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="name" label="名称" min-width="160" />
        <el-table-column prop="comment" label="说明" min-width="220" show-overflow-tooltip>
          <template #default="{ row }">
            <span class="org-page__comment">{{ row.comment || '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="createdByLabel" label="创建人" min-width="120">
          <template #default="{ row }">
            <span class="org-page__muted">
              {{ row.createdByLabel || row.createdBy }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" min-width="160">
          <template #default="{ row }">
            <span class="org-page__muted">{{ formatDateTime(row.createdAt) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button
              link
              type="primary"
              :icon="View"
              @click="onRowAction('view', row as Organization)"
            >
              查看
            </el-button>
            <el-button
              link
              type="primary"
              :icon="Edit"
              :disabled="!has(Permission.OrgUpdate)"
              @click="onRowAction('edit', row as Organization)"
            >
              编辑
            </el-button>
            <el-button
              link
              type="danger"
              :icon="Delete"
              :disabled="!has(Permission.OrgDelete)"
              @click="onRowAction('delete', row as Organization)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="org-page__pager">
        <el-pagination
          background
          layout="total, prev, pager, next, sizes"
          :total="orgStore.total"
          :current-page="orgStore.lastQuery.pageNum ?? 1"
          :page-size="orgStore.lastQuery.pageSize ?? 20"
          :page-sizes="[10, 20, 50, 100]"
          @current-change="(p: number) => onPageChange(p, orgStore.lastQuery.pageSize ?? 20)"
          @size-change="(s: number) => onPageChange(1, s)"
        />
      </div>
    </div>

    <!-- 新建 -->
    <el-dialog
      v-model="createDialogVisible"
      width="480px"
      :close-on-click-modal="false"
      @closed="resetCreateForm"
    >
      <template #header>
        <div class="org-page__dialog-header">
          <span class="org-page__dialog-icon org-page__dialog-icon--create">
            <el-icon><Plus /></el-icon>
          </span>
          <span>新建组织</span>
        </div>
      </template>
      <el-form
        ref="createFormRef"
        :model="createForm"
        :rules="createRules"
        label-position="top"
      >
        <el-form-item label="Code" prop="code">
          <el-input v-model="createForm.code" placeholder="例如 default-org" />
        </el-form-item>
        <el-form-item label="名称" prop="name">
          <el-input v-model="createForm.name" placeholder="默认组织" />
        </el-form-item>
        <el-form-item label="说明" prop="comment">
          <el-input v-model="createForm.comment" type="textarea" :rows="3" />
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
        <div class="org-page__dialog-header">
          <span class="org-page__dialog-icon org-page__dialog-icon--view">
            <el-icon><View /></el-icon>
          </span>
          <span>组织详情</span>
        </div>
      </template>
      <el-descriptions v-if="viewTarget" :column="1" border>
        <el-descriptions-item label="Code">
          <span class="org-page__code">{{ viewTarget.code }}</span>
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
          <span class="org-page__id">{{ viewTarget.id }}</span>
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
        <div class="org-page__dialog-header">
          <span class="org-page__dialog-icon org-page__dialog-icon--edit">
            <el-icon><Edit /></el-icon>
          </span>
          <span>编辑组织</span>
        </div>
      </template>
      <el-form ref="editFormRef" :model="editForm" :rules="editRules" label-position="top">
        <el-form-item label="Code">
          <el-input v-model="editTargetCode" disabled />
          <span class="org-page__hint">Code 创建后不可修改</span>
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
        <div class="org-page__dialog-header">
          <span class="org-page__dialog-icon org-page__dialog-icon--delete">
            <el-icon><Delete /></el-icon>
          </span>
          <span>删除组织</span>
        </div>
      </template>
      <p v-if="deleteTarget" class="org-page__confirm-text">
        确定要删除组织 <b>{{ deleteTarget.name }}</b>(<code>{{ deleteTarget.code }}</code>)吗?
      </p>
      <p class="org-page__confirm-warn">删除后不可恢复,请谨慎操作。</p>
      <el-checkbox
        v-model="forceChecked"
        :disabled="!has(Permission.OrgForceDelete)"
        class="org-page__force"
      >
        级联删除(含其下所有项目、环境、目录、密钥)
      </el-checkbox>
      <p v-if="!has(Permission.OrgForceDelete)" class="org-page__hint">
        当前账号没有 <code>org:force_delete</code> 权限,如需级联删除请联系管理员。
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
.org-page {
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
  }

  &__search {
    width: 240px;
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
