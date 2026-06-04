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
  Hide,
  Key,
  Plus,
  Refresh,
  Search,
  View,
} from '@element-plus/icons-vue'
import { useSecretStore } from '@/stores/secret'
import { useFolderStore } from '@/stores/folder'
import { useEnvStore } from '@/stores/env'
import { useOrganizationStore } from '@/stores/organization'
import { useProjectStore } from '@/stores/project'
import { ApiError } from '@/types/api'
import { formatDateTime, maskSecret } from '@/utils/format'
import { getProjectOrgId } from '@/utils/project'
import { getEnvProjectId } from '@/utils/env'
import { getFolderEnvId } from '@/utils/folder'
import { usePermission } from '@/composables/use-permission'
import { Permission } from '@/constants/permission'
import type { Organization } from '@/types/organization'
import type { Project } from '@/types/project'
import type { Environment } from '@/types/env'
import type { Folder } from '@/types/folder'
import type { SecretMeta } from '@/types/secret'
import type { CreateSecretRequest } from '@/api/secret'

const route = useRoute()
const secretStore = useSecretStore()
const folderStore = useFolderStore()
const envStore = useEnvStore()
const orgStore = useOrganizationStore()
const projectStore = useProjectStore()
const { has } = usePermission()

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
/** 选中 env 下的 level=1 folder(folder 才是 secret 的载体) */
const folderOptions = computed<Folder[]>(() =>
  folderStore.items.filter(
    (f) => getFolderEnvId(f) === selectedEnvId.value && f.level === 1,
  ),
)

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
  folderStore.clear()
  if (!orgId) return
  projectStore.fetchList({ orgId, pageNum: 1, pageSize: 100 }).catch(() => undefined)
}

async function onProjectChange(projectId: string): Promise<void> {
  selectedProjectId.value = projectId
  selectedEnvId.value = ''
  selectedFolderId.value = ''
  secretStore.clear()
  envStore.clear()
  folderStore.clear()
  if (!projectId) return
  await envStore.fetchList({ projectId, pageNum: 1, pageSize: 100 }).catch(() => undefined)
}

async function onEnvChange(envId: string): Promise<void> {
  selectedEnvId.value = envId
  selectedFolderId.value = ''
  secretStore.clear()
  folderStore.clear()
  if (!envId) return
  // 拉 level=1 folder 供用户选择
  await folderStore
    .fetchList({ environmentId: envId, pageNum: 1, pageSize: 100 })
    .catch((e: unknown) => {
      const msg = e instanceof ApiError ? e.message : '加载失败'
      ElMessage.error(msg)
    })
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

function onFolderChange(folderId: string): void {
  selectedFolderId.value = folderId
  if (!folderId) {
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
    .fetchList({ folderId, pageNum: 1, pageSize: secretStore.lastQuery.pageSize ?? 20 })
    .catch((e: unknown) => {
      const msg = e instanceof ApiError ? e.message : '加载失败'
      ElMessage.error(msg)
    })
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

const createForm = reactive<CreateSecretRequest & { valueVisible: boolean }>({
  folderId: '',
  key: '',
  value: '',
  comment: '',
  valueVisible: false,
})

const createRules: FormRules<CreateSecretRequest> = {
  folderId: [{ required: true, message: '请选择所属 folder', trigger: 'change' }],
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
  createForm.key = ''
  createForm.value = ''
  createForm.comment = ''
  createForm.valueVisible = false
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
    const req: CreateSecretRequest = {
      folderId: createForm.folderId,
      key: createForm.key.trim(),
      value: createForm.value,
      comment: createForm.comment?.trim() || undefined,
    }
    await secretStore.create(req)
    ElMessage.success('创建成功')
    createDialogVisible.value = false
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : '创建失败'
    ElMessage.error(msg)
  } finally {
    createSubmitting.value = false
  }
}

// ==================== 查看值(Reveal) ====================
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

function onRowAction(action: 'reveal', row: SecretMeta): void {
  if (action === 'reveal') void openReveal(row)
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
          if (presetFolderId && folderStore.items.some((f) => f.id === presetFolderId)) {
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
    else if (f && f !== selectedFolderId.value) onFolderChange(f)
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
        <el-select
          v-model="selectedFolderId"
          placeholder="目录(可选)"
          class="page-header__picker"
          filterable
          clearable
          :disabled="!selectedEnvId"
          @change="onFolderChange"
        >
          <el-option
            v-for="f in folderOptions"
            :key="f.id"
            :label="`${f.name} (${f.code})`"
            :value="f.id"
          />
        </el-select>
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
          :disabled="!selectedEnvId || folderOptions.length === 0"
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
            : !selectedFolderId && folderOptions.length === 0
              ? '该环境下尚无 folder,请先在目录管理页创建'
              : '暂无密钥'
        "
      >
        <el-table-column prop="key" label="Key" min-width="220">
          <template #default="{ row }">
            <span class="secret-page__key">
              <el-icon class="secret-page__key-icon"><Key /></el-icon>
              {{ row.key }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="comment" label="说明" min-width="220" show-overflow-tooltip>
          <template #default="{ row }">
            <span class="secret-page__comment">{{ row.comment || '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="版本" width="80">
          <template #default="{ row }">
            <el-tag size="small" effect="light" type="info">v{{ row.version }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdByLabel" label="创建人" min-width="120">
          <template #default="{ row }">
            <span class="secret-page__muted">
              {{ row.createdByLabel || row.createdBy }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" min-width="160">
          <template #default="{ row }">
            <span class="secret-page__muted">{{ formatDateTime(row.createdAt) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="更新时间" min-width="160">
          <template #default="{ row }">
            <span class="secret-page__muted">{{ formatDateTime(row.updatedAt) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button
              link
              type="primary"
              :icon="View"
              :disabled="!has(Permission.SecretReveal)"
              @click="onRowAction('reveal', row as SecretMeta)"
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
        <el-form-item label="所属 folder" prop="folderId">
          <el-select
            v-model="createForm.folderId"
            placeholder="选择 folder"
            style="width: 100%"
            filterable
            :disabled="folderOptions.length === 0"
          >
            <el-option
              v-for="f in folderOptions"
              :key="f.id"
              :label="`${f.name} (${f.code})`"
              :value="f.id"
            />
          </el-select>
        </el-form-item>
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
        <el-form-item label="Value" prop="value">
          <el-input
            v-model="createForm.value"
            :type="createForm.valueVisible ? 'textarea' : 'password'"
            :rows="createForm.valueVisible ? 4 : 1"
            placeholder="密钥明文,提交后服务端会加密存储"
            show-password
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

    <!-- 查看值(Reveal) -->
    <el-dialog
      v-model="revealDialogVisible"
      width="560px"
      :close-on-click-modal="false"
    >
      <template #header>
        <div class="secret-page__dialog-header">
          <span class="secret-page__dialog-icon secret-page__dialog-icon--view">
            <el-icon><View /></el-icon>
          </span>
          <span>查看密钥值</span>
        </div>
      </template>
      <div v-if="revealTarget" class="secret-page__reveal">
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="Key">
            <span class="secret-page__key">{{ revealTarget.key }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="版本">
            <el-tag size="small" effect="light" type="info">v{{ revealVersion }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="Value">
            <div v-if="revealLoading" class="secret-page__reveal-loading">加载中...</div>
            <div v-else class="secret-page__reveal-value">
              <el-input
                :model-value="revealVisible ? revealValue : maskSecret(revealValue)"
                :type="revealVisible ? 'textarea' : 'password'"
                readonly
                :rows="revealVisible ? 4 : 1"
                :autosize="revealVisible ? { minRows: 4 } : undefined"
              />
              <div class="secret-page__reveal-actions">
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
        <p class="secret-page__reveal-warn">
          <el-icon><Hide /></el-icon>
          请妥善处理明文,避免在截图、日志、聊天中泄露。
        </p>
      </div>
      <template #footer>
        <el-button @click="revealDialogVisible = false">关闭</el-button>
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
