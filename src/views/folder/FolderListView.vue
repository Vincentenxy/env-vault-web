<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import {
  ElMessage,
  type FormInstance,
  type FormRules,
} from 'element-plus'
import {
  ArrowRight,
  CircleClose,
  Folder as FolderIcon,
  Plus,
  Refresh,
} from '@element-plus/icons-vue'
import { useFolderStore } from '@/stores/folder'
import { useEnvStore } from '@/stores/env'
import { useOrganizationStore } from '@/stores/organization'
import { useProjectStore } from '@/stores/project'
import { ApiError } from '@/types/api'
import { formatDateTime } from '@/utils/format'
import { getProjectOrgId } from '@/utils/project'
import { getEnvProjectId } from '@/utils/env'
import { getFolderEnvId } from '@/utils/folder'
import type { Organization } from '@/types/organization'
import type { Project } from '@/types/project'
import type { Environment } from '@/types/env'
import type { Folder, FolderLevel } from '@/types/folder'
import type { CreateFolderRequest } from '@/api/folder'

const route = useRoute()
const folderStore = useFolderStore()
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

// ==================== Level 切换 ====================
const selectedLevel = ref<FolderLevel>(1)
const selectedParentId = ref<string>('')

/** level=1 时,parent=envId;level=2 时,parent=parentFolderId */
const effectiveParent = computed<string>(() => {
  if (selectedLevel.value === 1) return selectedEnvId.value
  return selectedParentId.value
})

/**
 * 弹窗里"父级 folder"下拉的选项。
 *
 * 关键:这里用弹窗级的 `createForm.level` 而不是页面级的 `selectedLevel.value`,
 * 否则用户在弹窗里从 level=1 切到 level=2 时,options 仍按页面级判断为空。
 *
 * 数据源:必须保证 `folderStore.items` 装的是当前 env 的 level=1 folder。
 *   - 页面刚加载:onEnvChange 已拉
 *   - 页面切到 level=2 后又选了父 folder:items 被覆写成 level=2,见 watch 补救
 *   - 弹窗内从 1 切到 2:见下面的 watch(createForm.level)
 */
const parentFolderOptions = computed<Folder[]>(() => {
  if (createForm.level !== 2) return []
  // items 可能因为列表模式切换被覆写,这里兜底过滤出 level=1
  return folderStore.items.filter(
    (f) => f.level === 1 && getFolderEnvId(f) === selectedEnvId.value,
  )
})

// ==================== 列表 ====================
async function refreshCurrent(): Promise<void> {
  if (!selectedEnvId.value) return
  if (selectedLevel.value === 1) {
    await folderStore
      .fetchList({
        environmentId: selectedEnvId.value,
        pageNum: folderStore.lastQuery.pageNum ?? 1,
        pageSize: folderStore.lastQuery.pageSize ?? 20,
      })
      .catch((e: unknown) => {
        const msg = e instanceof ApiError ? e.message : '加载失败'
        ElMessage.error(msg)
      })
  } else {
    if (!selectedParentId.value) return
    await folderStore
      .fetchList({
        folderParentId: selectedParentId.value,
        pageNum: folderStore.lastQuery.pageNum ?? 1,
        pageSize: folderStore.lastQuery.pageSize ?? 20,
      })
      .catch((e: unknown) => {
        const msg = e instanceof ApiError ? e.message : '加载失败'
        ElMessage.error(msg)
      })
  }
}

function onOrgChange(orgId: string): void {
  selectedOrgId.value = orgId
  selectedProjectId.value = ''
  selectedEnvId.value = ''
  selectedParentId.value = ''
  folderStore.clear()
  envStore.clear()
  if (!orgId) return
  projectStore.fetchList({ orgId, pageNum: 1, pageSize: 100 }).catch(() => undefined)
}

async function onProjectChange(projectId: string): Promise<void> {
  selectedProjectId.value = projectId
  selectedEnvId.value = ''
  selectedParentId.value = ''
  folderStore.clear()
  if (!projectId) return
  await envStore
    .fetchList({ projectId, pageNum: 1, pageSize: 100 })
    .catch(() => undefined)
}

function onEnvChange(envId: string): void {
  selectedEnvId.value = envId
  selectedParentId.value = ''
  selectedLevel.value = 1
  folderStore.clear()
  if (!envId) return
  // 拉 level=1 列表
  folderStore
    .fetchList({ environmentId: envId, pageNum: 1, pageSize: 20 })
    .catch((e: unknown) => {
      const msg = e instanceof ApiError ? e.message : '加载失败'
      ElMessage.error(msg)
    })
}

function onLevelChange(level: string | number | boolean | undefined): void {
  if (level !== 1 && level !== 2) return
  selectedLevel.value = level
  selectedParentId.value = ''
  if (!selectedEnvId.value) {
    folderStore.clear()
    return
  }
  if (level === 1) {
    folderStore
      .fetchList({ environmentId: selectedEnvId.value, pageNum: 1, pageSize: 20 })
      .catch(() => undefined)
  } else {
    // level=2 模式下,主列表要等选了父级才拉,但父级下拉需要当前 env 下的 level=1 folder,
    // 这里也按 environmentId 拉一次,store 会把 items 标为 level=1,刚好满足父级下拉
    folderStore
      .fetchList({ environmentId: selectedEnvId.value, pageNum: 1, pageSize: 100 })
      .catch(() => undefined)
  }
}

function onParentFolderChange(parentId: string): void {
  selectedParentId.value = parentId
  if (!parentId) {
    folderStore.clear()
    return
  }
  folderStore
    .fetchList({ folderParentId: parentId, pageNum: 1, pageSize: 20 })
    .catch((e: unknown) => {
      const msg = e instanceof ApiError ? e.message : '加载失败'
      ElMessage.error(msg)
    })
}

function onPageChange(pageNum: number, pageSize: number): void {
  if (!effectiveParent.value) return
  if (selectedLevel.value === 1) {
    folderStore
      .fetchList({ environmentId: selectedEnvId.value, pageNum, pageSize })
      .catch(() => undefined)
  } else {
    folderStore
      .fetchList({ folderParentId: selectedParentId.value, pageNum, pageSize })
      .catch(() => undefined)
  }
}

// ==================== 创建 ====================
const createDialogVisible = ref(false)
const createSubmitting = ref(false)
const createFormRef = ref<FormInstance>()

const createForm = reactive<{
  level: FolderLevel
  parentId: string
  code: string
  name: string
  comment: string
}>({
  level: 1,
  parentId: '',
  code: '',
  name: '',
  comment: '',
})

const createRules: FormRules<typeof createForm> = {
  level: [{ required: true, message: '请选择级别', trigger: 'change' }],
  parentId: [{ required: true, message: '请选择父级', trigger: 'change' }],
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

function resetCreateForm(): void {
  createForm.level = selectedLevel.value
  createForm.parentId = effectiveParent.value
  createForm.code = ''
  createForm.name = ''
  createForm.comment = ''
  createFormRef.value?.clearValidate()
}

function openCreate(): void {
  resetCreateForm()
  createDialogVisible.value = true
  // 弹窗打开后,如果默认是 level=2,需要确保 folderStore.items 是 level=1 folder
  // (页面级可能因为切到 level=2 选了父 folder 后被覆写成 level=2,见 onParentFolderChange)
  void nextTick().then(() => {
    if (createForm.level === 2 && selectedEnvId.value) {
      const need =
        folderStore.context?.level !== 1 ||
        folderStore.context.parent !== selectedEnvId.value
      if (need) {
        folderStore
          .fetchList({ environmentId: selectedEnvId.value, pageNum: 1, pageSize: 100 })
          .catch(() => undefined)
      }
    }
  })
}

/**
 * 弹窗内 level 切换:重置 parentId,避免保留上一档的脏值(env id / 父 folder id 混用),
 * 同时如果是切到 2,确保 store 里是 level=1 folder。
 */
watch(
  () => createForm.level,
  (level) => {
    createForm.parentId = ''
    createFormRef.value?.clearValidate(['parentId'])
    if (level === 2 && selectedEnvId.value) {
      const need =
        folderStore.context?.level !== 1 ||
        folderStore.context.parent !== selectedEnvId.value
      if (need) {
        folderStore
          .fetchList({ environmentId: selectedEnvId.value, pageNum: 1, pageSize: 100 })
          .catch(() => undefined)
      }
    }
  },
)

function fillFromPreset(preset: (typeof PRESET_FOLDERS)[number]): void {
  createForm.code = preset.code
  createForm.name = preset.name
}

async function onCreateSubmit(): Promise<void> {
  if (!createFormRef.value) return
  const valid = await createFormRef.value.validate().catch(() => false)
  if (!valid) return
  createSubmitting.value = true
  try {
    const req: CreateFolderRequest = {
      level: createForm.level,
      parentId: createForm.parentId,
      code: createForm.code,
      name: createForm.name,
      comment: createForm.comment || undefined,
    }
    await folderStore.create(req)
    ElMessage.success('创建成功')
    createDialogVisible.value = false
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : '创建失败'
    ElMessage.error(msg)
  } finally {
    createSubmitting.value = false
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

  if (presetOrgId && orgStore.items.some((o) => o.id === presetOrgId)) {
    onOrgChange(presetOrgId)
    if (presetProjectId) {
      await projectStore
        .fetchList({ orgId: presetOrgId, pageNum: 1, pageSize: 100 })
        .catch(() => undefined)
      if (projectStore.items.some((p) => p.id === presetProjectId)) {
        await onProjectChange(presetProjectId)
        if (
          presetEnvId &&
          envStore.items.some((e) => e.id === presetEnvId)
        ) {
          onEnvChange(presetEnvId)
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
          目录(folder)从属于环境,支持两级:level=1 在 env 下,level=2 在 level=1 folder 下。
        </p>
      </div>
      <div class="page-header__actions">
        <el-button
          :icon="Refresh"
          :disabled="!effectiveParent"
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
        <el-radio-group v-model="selectedLevel" @change="onLevelChange" class="page-header__level">
          <el-radio-button :value="1">level=1 (env 下)</el-radio-button>
          <el-radio-button :value="2">level=2 (子目录)</el-radio-button>
        </el-radio-group>
        <el-select
          v-if="selectedLevel === 2"
          v-model="selectedParentId"
          placeholder="父级 folder"
          class="page-header__picker"
          filterable
          :disabled="!selectedEnvId"
          @change="onParentFolderChange"
        >
          <el-option
            v-for="f in parentFolderOptions"
            :key="f.id"
            :label="`${f.name} (${f.code})`"
            :value="f.id"
          />
        </el-select>
        <el-button
          type="primary"
          :icon="Plus"
          :disabled="!effectiveParent"
          @click="openCreate"
        >
          新建目录
        </el-button>
      </div>
    </header>

    <div class="folder-page__surface">
      <el-table
        v-loading="folderStore.loading"
        :data="folderStore.items"
        class="folder-page__table"
        :empty-text="
          !selectedEnvId
            ? '请先选择环境'
            : selectedLevel === 2 && !selectedParentId
              ? '请先选择父级 folder'
              : '暂无目录'
        "
      >
        <el-table-column prop="code" label="Code" min-width="160">
          <template #default="{ row }">
            <span class="folder-page__code">
              <el-icon class="folder-page__code-icon"><FolderIcon /></el-icon>
              {{ row.code }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="name" label="名称" min-width="160" />
        <el-table-column label="Level" width="100">
          <template #default="{ row }">
            <el-tag
              :type="row.level === 1 ? 'primary' : 'info'"
              size="small"
              effect="light"
            >
              L{{ row.level }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="comment" label="说明" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">
            <span class="folder-page__comment">{{ row.comment || '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="createdByLabel" label="创建人" min-width="120">
          <template #default="{ row }">
            <span class="folder-page__muted">
              {{ row.createdByLabel || row.createdBy }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" min-width="160">
          <template #default="{ row }">
            <span class="folder-page__muted">{{ formatDateTime(row.createdAt) }}</span>
          </template>
        </el-table-column>
      </el-table>

      <div class="folder-page__pager">
        <el-pagination
          background
          layout="total, prev, pager, next, sizes"
          :total="folderStore.total"
          :current-page="folderStore.lastQuery.pageNum ?? 1"
          :page-size="folderStore.lastQuery.pageSize ?? 20"
          :page-sizes="[10, 20, 50, 100]"
          @current-change="(p: number) => onPageChange(p, folderStore.lastQuery.pageSize ?? 20)"
          @size-change="(s: number) => onPageChange(1, s)"
        />
      </div>
    </div>

    <div v-if="!selectedEnvId" class="folder-page__hint-bar">
      <el-icon><CircleClose /></el-icon>
      <span>请先在右上角选择组织 → 项目 → 环境,再进行目录管理。</span>
    </div>

    <!-- 新建目录 -->
    <el-dialog
      v-model="createDialogVisible"
      width="520px"
      :close-on-click-modal="false"
      @closed="resetCreateForm"
    >
      <template #header>
        <div class="folder-page__dialog-header">
          <span class="folder-page__dialog-icon folder-page__dialog-icon--create">
            <el-icon><Plus /></el-icon>
          </span>
          <span>新建目录</span>
        </div>
      </template>
      <el-form
        ref="createFormRef"
        :model="createForm"
        :rules="createRules"
        label-position="top"
      >
        <el-form-item label="级别" prop="level">
          <el-radio-group v-model="createForm.level">
            <el-radio-button :value="1">level=1 (env 下)</el-radio-button>
            <el-radio-button :value="2">level=2 (子目录)</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="父级" prop="parentId">
          <el-select
            v-if="createForm.level === 1"
            v-model="createForm.parentId"
            placeholder="选择环境"
            style="width: 100%"
            filterable
            :disabled="!selectedEnvId"
          >
            <el-option
              v-for="e in envOptions"
              :key="e.id"
              :label="`${e.name} (${e.code})`"
              :value="e.id"
            />
          </el-select>
          <el-select
            v-else
            v-model="createForm.parentId"
            placeholder="选择父级 folder"
            style="width: 100%"
            filterable
            :disabled="!selectedEnvId"
          >
            <el-option
              v-for="f in parentFolderOptions"
              :key="f.id"
              :label="`${f.name} (${f.code})`"
              :value="f.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="Code" prop="code">
          <el-input v-model="createForm.code" placeholder="例如 globals / services" />
        </el-form-item>
        <el-form-item label="名称" prop="name">
          <el-input v-model="createForm.name" placeholder="Globals" />
        </el-form-item>
        <el-form-item label="预设" v-if="!createForm.code && createForm.level === 1">
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
          <el-input v-model="createForm.comment" type="textarea" :rows="3" />
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
  </div>
</template>

<style lang="scss" scoped>
.folder-page {
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
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-family: var(--el-font-family-monospace, ui-monospace, SFMono-Regular, monospace);
    font-size: 13px;
    color: var(--v-text-primary);
  }

  &__code-icon {
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

  &__level {
    margin: 0 4px;
  }
}
</style>
