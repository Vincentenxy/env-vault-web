<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useNavigationMemory } from '@/composables/use-navigation-memory'
import PageRefreshButton from '@/components/PageRefreshButton.vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import {
  ArrowRight,
  CircleClose,
  Clock,
  FolderOpened,
  Plus,
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
import ResourceAuditDialog from '@/components/ResourceAuditDialog.vue'

const route = useRoute()
const router = useRouter()
const envStore = useEnvStore()
const orgStore = useOrganizationStore()
const projectStore = useProjectStore()
const { has, rbac } = usePermission()
const navigation = useNavigationMemory('environments', { orgId: '', projectId: '' })
const navigationReady = ref(false)

const selectedOrgId = ref<string>('')
const selectedProjectId = ref<string>('')
navigation.track(() =>
  navigationReady.value ? { orgId: selectedOrgId.value, projectId: selectedProjectId.value } : null,
)
const searchKeyword = ref('')

const orgOptions = computed<Organization[]>(() => orgStore.items)
const projectOptions = computed<Project[]>(() =>
  projectStore.items.filter((p) => getProjectOrgId(p) === selectedOrgId.value),
)
const filteredEnvironments = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()
  if (!keyword) return envStore.items
  return envStore.items.filter((environment) =>
    `${environment.code} ${environment.name} ${environment.remark}`.toLowerCase().includes(keyword),
  )
})

// ==================== 列表 ====================
async function onRefresh(): Promise<void> {
  if (!selectedProjectId.value) return
  try {
    await envStore.fetchList({
      projectId: selectedProjectId.value,
    })
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : '加载失败'
    ElMessage.error(msg)
  }
}

async function onOrgChange(orgId: string): Promise<void> {
  selectedOrgId.value = orgId
  selectedProjectId.value = ''
  envStore.clear()
  if (!orgId) return
  // 加载该 org 下的 project 列表
  await projectStore.fetchList({ orgId, pageNum: 1, pageSize: 100 }).catch(() => undefined)
}

function onProjectChange(projectId: string): void {
  selectedProjectId.value = projectId
  if (!projectId) {
    envStore.clear()
    return
  }
  envStore.fetchList({ projectId }).catch((e: unknown) => {
    const msg = e instanceof ApiError ? e.message : '加载失败'
    ElMessage.error(msg)
  })
}

// ==================== 创建 ====================
const createDialogVisible = ref(false)
const createSubmitting = ref(false)
const createFormRef = ref<FormInstance>()

interface CreateEnvironmentForm {
  code: string
  name: string
  remark: string
  isCheckPerm: boolean
}

const createForm = reactive<CreateEnvironmentForm>({
  code: '',
  name: '',
  remark: '',
  isCheckPerm: false,
})

const createRules: FormRules<CreateEnvironmentForm> = {
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
  remark: [{ max: 256, message: '长度不能超过 256', trigger: 'blur' }],
}

const DEFAULT_ENVS: Array<Pick<CreateEnvironmentForm, 'code' | 'name'>> = [
  { code: 'dev', name: 'Development' },
  { code: 'test', name: 'Testing' },
  { code: 'staging', name: 'Staging' },
  { code: 'prod', name: 'Production' },
]

function resetCreateForm(): void {
  createForm.code = ''
  createForm.name = ''
  createForm.remark = ''
  createForm.isCheckPerm = false
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
    await envStore.create({
      projectId: selectedProjectId.value,
      environments: [
        {
          code: createForm.code.trim(),
          name: createForm.name.trim(),
          remark: createForm.remark.trim(),
          isCheckPerm: createForm.isCheckPerm,
        },
      ],
    })
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
const auditDialogVisible = ref(false)
const auditTarget = ref<Environment | null>(null)

function openView(row: Environment): void {
  viewTarget.value = row
  viewDialogVisible.value = true
}

function openAudit(row: Environment): void {
  auditTarget.value = row
  auditDialogVisible.value = true
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

function onRowAction(action: 'view' | 'goFolders', row: Environment): void {
  if (action === 'view') openView(row)
  else if (action === 'goFolders') {
    if (!has(Permission.FolderRead)) {
      ElMessage.warning('当前账号没有 folder:read 权限')
      return
    }
    goToFolders(row)
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
  const presetOrgId =
    typeof route.query.orgId === 'string' ? route.query.orgId : navigation.saved.orgId
  const presetProjectId =
    typeof route.query.projectId === 'string'
      ? route.query.projectId
      : presetOrgId === navigation.saved.orgId
        ? navigation.saved.projectId
        : ''

  if (presetOrgId && orgStore.items.some((o) => o.id === presetOrgId)) {
    await onOrgChange(presetOrgId)
    if (presetProjectId) {
      if (projectStore.items.some((p) => p.id === presetProjectId)) {
        onProjectChange(presetProjectId)
      }
    }
  } else if (orgStore.items.length > 0) {
    const first = orgStore.items[0]
    if (first) await onOrgChange(first.id)
  }
  navigationReady.value = true
})

// 监听 query 变化(支持跨页跳转)
watch(
  () => [route.query.orgId, route.query.projectId],
  async ([orgId, projectId]) => {
    if (!navigationReady.value) return
    const o = typeof orgId === 'string' ? orgId : ''
    const p = typeof projectId === 'string' ? projectId : ''
    if (o === selectedOrgId.value && p === selectedProjectId.value) return
    navigationReady.value = false
    if (o !== selectedOrgId.value) await onOrgChange(o)
    onProjectChange(projectOptions.value.some((item) => item.id === p) ? p : '')
    navigationReady.value = true
  },
)

watch([selectedOrgId, selectedProjectId, navigationReady], ([orgId, projectId, ready]) => {
  if (!ready) return
  if (route.query.orgId === orgId && route.query.projectId === projectId) return
  void router.replace({ query: { ...route.query, orgId, projectId } })
})

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
          环境从属于项目,如 dev / test / prod。新增环境会同步项目现有目录和密钥结构。
        </p>
      </div>
      <div class="page-header__actions">
        <el-select
          v-model="selectedOrgId"
          placeholder="选择组织"
          class="page-header__picker"
          filterable
          @change="onOrgChange"
        >
          <el-option v-for="o in orgOptions" :key="o.id" :label="o.name" :value="o.id">
            <span style="float: left">{{ o.name }}</span>
            <span
              style="float: right; color: var(--v-text-tertiary); font-size: 12px; margin-left: 8px"
            >
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
          <el-option v-for="p in projectOptions" :key="p.id" :label="p.name" :value="p.id">
            <span style="float: left">{{ p.name }}</span>
            <span
              style="float: right; color: var(--v-text-tertiary); font-size: 12px; margin-left: 8px"
            >
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
        <PageRefreshButton
          :action="onRefresh"
          :loading="envStore.loading"
          :disabled="!selectedProjectId"
        />
      </div>
    </header>

    <div class="env-page__surface">
      <el-table
        v-loading="envStore.loading"
        :data="filteredEnvironments"
        class="env-page__table"
        :empty-text="selectedProjectId ? '该项目下暂无环境' : '请先选择项目'"
      >
        <el-table-column prop="code" label="Code" min-width="140">
          <template #default="{ row }">
            <span class="env-page__code">{{ row.code }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="name" label="名称" min-width="160" />
        <el-table-column prop="remark" label="说明" min-width="200" show-overflow-tooltip>
          <template #default="{ row }">
            <span class="env-page__comment">{{ row.remark || '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="createBy" label="创建人" min-width="120">
          <template #default="{ row }">
            <span class="env-page__muted">{{ row.createBy }}</span>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" min-width="160">
          <template #default="{ row }">
            <span class="env-page__muted">{{ formatDateTime(row.createAt) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="320" fixed="right">
          <template #default="{ row }">
            <el-button
              link
              type="primary"
              :icon="Clock"
              aria-label="查看环境操作日志"
              @click="openAudit(row as Environment)"
            />

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
              :icon="FolderOpened"
              :disabled="!has(Permission.FolderRead)"
              @click="onRowAction('goFolders', row as Environment)"
            >
              目录
            </el-button>
          </template>
        </el-table-column>
      </el-table>
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
      <el-form ref="createFormRef" :model="createForm" :rules="createRules" label-position="top">
        <el-form-item label="所属项目">
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
        <el-form-item label="说明" prop="remark">
          <el-input v-model="createForm.remark" type="textarea" :rows="3" />
        </el-form-item>
        <el-form-item label="权限校验">
          <el-switch
            v-model="createForm.isCheckPerm"
            inline-prompt
            active-text="开"
            inactive-text="关"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="createSubmitting" @click="onCreateSubmit">
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
          {{ viewTarget.remark || '—' }}
        </el-descriptions-item>
        <el-descriptions-item label="创建人">
          {{ viewTarget.createBy }}
        </el-descriptions-item>
        <el-descriptions-item label="创建时间">
          {{ formatDateTime(viewTarget.createAt) }}
        </el-descriptions-item>
        <el-descriptions-item label="更新人">
          {{ viewTarget.updateBy }}
        </el-descriptions-item>
        <el-descriptions-item label="更新时间">
          {{ formatDateTime(viewTarget.updateAt) }}
        </el-descriptions-item>
        <el-descriptions-item label="ID">
          <span class="env-page__id">{{ viewTarget.id }}</span>
        </el-descriptions-item>
      </el-descriptions>
      <template #footer>
        <el-button @click="viewDialogVisible = false">关闭</el-button>
      </template>
    </el-dialog>
    <ResourceAuditDialog
      v-model="auditDialogVisible"
      resource-type="environment"
      :resource-id="auditTarget?.id ?? ''"
      :resource-name="auditTarget?.name ?? ''"
    />
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
