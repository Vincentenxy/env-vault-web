<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { ArrowRight, Delete, Plus } from '@element-plus/icons-vue'
import { createTenant } from '@/api/tenant'
import { createOrganization } from '@/api/organization'
import { createProject } from '@/api/project'
import type { TenantHierarchyOption } from '@/api/tenant'
import type { EnvSpec } from '@/types/project'

export type CreateResourceType = 'tenant' | 'organization' | 'project'

export interface ResourceCreatedPayload {
  type: CreateResourceType
  resourceId?: string
  tenantId?: string
  organizationId?: string
  name: string
}

interface ProjectEnvironmentForm extends EnvSpec {
  rowId: number
}

interface CreateResourceForm {
  tenantId: string
  organizationId: string
  code: string
  name: string
  remark: string
  environments: ProjectEnvironmentForm[]
}

const createDraftStorageKey = 'env-vault:organization:create-resource-draft'

const props = defineProps<{
  modelValue: boolean
  tenants: TenantHierarchyOption[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  created: [payload: ResourceCreatedPayload]
}>()

const dialogVisible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})

const formRef = ref<FormInstance>()
const submitting = ref(false)
const activeType = ref<CreateResourceType>('tenant')
let environmentRowId = 0

const form = reactive<CreateResourceForm>({
  tenantId: '',
  organizationId: '',
  code: '',
  name: '',
  remark: '',
  environments: [],
})

const tabs: Array<{ type: CreateResourceType; label: string }> = [
  { type: 'tenant', label: '新建租户' },
  { type: 'organization', label: '新建组织' },
  { type: 'project', label: '新建项目' },
]

const organizationOptions = computed(
  () => props.tenants.find((tenant) => tenant.id === form.tenantId)?.orgList ?? [],
)

const rules = computed<FormRules<CreateResourceForm>>(() => ({
  tenantId:
    activeType.value === 'tenant'
      ? []
      : [{ required: true, message: '请选择所属租户', trigger: 'change' }],
  organizationId:
    activeType.value === 'project'
      ? [{ required: true, message: '请选择所属组织', trigger: 'change' }]
      : [],
  code: [
    { required: true, message: '请输入 Code', trigger: 'blur' },
    {
      pattern: /^[a-z0-9]+(-[a-z0-9]+)*$/,
      message: '仅支持小写字母、数字和中横线',
      trigger: 'blur',
    },
    { max: 32, message: '长度不能超过 32 个字符', trigger: 'blur' },
  ],
  name: [
    { required: true, message: '请输入名称', trigger: 'blur' },
    { max: 64, message: '长度不能超过 64 个字符', trigger: 'blur' },
  ],
  remark: [{ max: 256, message: '长度不能超过 256 个字符', trigger: 'blur' }],
}))

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}

function clearForm(): void {
  form.tenantId = ''
  form.organizationId = ''
  form.code = ''
  form.name = ''
  form.remark = ''
  form.environments = []
  activeType.value = 'tenant'
  environmentRowId = 0
}

function restoreDraft(): void {
  if (typeof window === 'undefined') return

  const rawDraft = window.localStorage.getItem(createDraftStorageKey)
  if (!rawDraft) {
    clearForm()
    return
  }

  try {
    const parsed: unknown = JSON.parse(rawDraft)
    const draft = isRecord(parsed) ? parsed : undefined
    const draftForm = draft && isRecord(draft.form) ? draft.form : undefined
    const draftType = draft?.activeType

    if (!draftForm || !['tenant', 'organization', 'project'].includes(String(draftType))) {
      throw new Error('Invalid create resource draft')
    }

    activeType.value = draftType as CreateResourceType
    form.tenantId = typeof draftForm.tenantId === 'string' ? draftForm.tenantId : ''
    form.organizationId =
      typeof draftForm.organizationId === 'string' ? draftForm.organizationId : ''
    form.code = typeof draftForm.code === 'string' ? draftForm.code : ''
    form.name = typeof draftForm.name === 'string' ? draftForm.name : ''
    form.remark = typeof draftForm.remark === 'string' ? draftForm.remark : ''
    const environments = Array.isArray(draftForm.environments) ? draftForm.environments : []
    form.environments = environments.filter(isRecord).map((environment) => ({
      rowId: ++environmentRowId,
      name: typeof environment.name === 'string' ? environment.name : '',
      code: typeof environment.code === 'string' ? environment.code : '',
      remark: typeof environment.remark === 'string' ? environment.remark : '',
      isCheckPerm: environment.isCheckPerm === true,
    }))
  } catch {
    window.localStorage.removeItem(createDraftStorageKey)
    clearForm()
  }
}

function persistDraft(): void {
  if (typeof window === 'undefined') return

  const hasContent =
    activeType.value !== 'tenant' ||
    Boolean(
      form.tenantId ||
      form.organizationId ||
      form.code ||
      form.name ||
      form.remark ||
      form.environments.length,
    )
  if (!hasContent) {
    window.localStorage.removeItem(createDraftStorageKey)
    return
  }

  const draft = {
    version: 1,
    activeType: activeType.value,
    form: {
      tenantId: form.tenantId,
      organizationId: form.organizationId,
      code: form.code,
      name: form.name,
      remark: form.remark,
      environments: form.environments.map(({ name, code, remark, isCheckPerm }) => ({
        name,
        code,
        remark,
        isCheckPerm: Boolean(isCheckPerm),
      })),
    },
  }

  window.localStorage.setItem(createDraftStorageKey, JSON.stringify(draft))
}

function clearDraft(): void {
  if (typeof window !== 'undefined') window.localStorage.removeItem(createDraftStorageKey)
}

function resetForm(): void {
  restoreDraft()
  nextTick(() => formRef.value?.clearValidate())
}

function switchType(type: CreateResourceType): void {
  activeType.value = type
  nextTick(() => formRef.value?.clearValidate())
}

function onTenantChange(): void {
  form.organizationId = ''
  formRef.value?.clearValidate('organizationId')
}

function addEnvironment(): void {
  form.environments.push({
    rowId: ++environmentRowId,
    name: '',
    code: '',
    remark: '',
    isCheckPerm: false,
  })
}

function removeEnvironment(index: number): void {
  form.environments.splice(index, 1)
}

function validateEnvironments(): boolean {
  if (activeType.value !== 'project') return true

  const codes = new Set<string>()
  for (const [index, environment] of form.environments.entries()) {
    const name = environment.name.trim()
    const code = environment.code.trim()
    if (!name || !code) {
      ElMessage.warning(`请完整填写第 ${index + 1} 个环境的名称和 Code`)
      return false
    }
    if (name.length > 64 || code.length > 32 || (environment.remark?.trim().length ?? 0) > 256) {
      ElMessage.warning(`第 ${index + 1} 个环境的名称、Code 或备注长度超出限制`)
      return false
    }
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(code)) {
      ElMessage.warning(`第 ${index + 1} 个环境 Code 仅支持小写字母、数字和中横线`)
      return false
    }
    if (codes.has(code)) {
      ElMessage.warning(`环境 Code「${code}」不能重复`)
      return false
    }
    codes.add(code)
  }
  return true
}

async function submit(): Promise<void> {
  if (activeType.value === 'project' && !form.tenantId) {
    ElMessage.warning('请选择所属租户')
    return
  }
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid || !validateEnvironments()) return

  submitting.value = true
  try {
    const code = form.code.trim()
    const name = form.name.trim()
    const remark = form.remark.trim() || undefined
    let resourceId: string | undefined

    if (activeType.value === 'tenant') {
      const created = await createTenant({ code, name, remark })
      resourceId = created?.id
    } else if (activeType.value === 'organization') {
      const created = await createOrganization({
        tenantId: form.tenantId,
        code,
        name,
        remark,
      })
      resourceId = created?.id
    } else {
      const environments = form.environments.map(({ name, code, remark, isCheckPerm }) => ({
        name: name.trim(),
        code: code.trim(),
        remark: remark?.trim() || undefined,
        isCheckPerm: Boolean(isCheckPerm),
      }))
      const created = await createProject({
        orgId: form.organizationId,
        code,
        name,
        remark,
        environments,
      })
      resourceId = created?.id
    }

    ElMessage.success(
      `${activeType.value === 'tenant' ? '租户' : activeType.value === 'organization' ? '组织' : '项目'}创建成功`,
    )
    emit('created', {
      type: activeType.value,
      resourceId,
      tenantId: form.tenantId || undefined,
      organizationId: form.organizationId || undefined,
      name,
    })
    clearDraft()
    clearForm()
    dialogVisible.value = false
  } finally {
    submitting.value = false
  }
}

watch(
  () => props.modelValue,
  (visible) => {
    if (visible) resetForm()
  },
)

watch([activeType, form], persistDraft, { deep: true })
</script>

<template>
  <el-dialog
    v-model="dialogVisible"
    width="760px"
    class="resource-create-dialog"
    :close-on-click-modal="false"
    :close-on-press-escape="!submitting"
    :show-close="!submitting"
    align-center
    destroy-on-close
    @closed="resetForm"
  >
    <template #header>
      <strong class="resource-create-dialog__title">新建</strong>
    </template>

    <div class="resource-create-tabs" role="tablist" aria-label="创建资源类型">
      <template v-for="tab in tabs" :key="tab.type">
        <button
          type="button"
          role="tab"
          class="resource-create-tabs__item"
          :class="{
            'is-active': activeType === tab.type,
          }"
          :aria-selected="activeType === tab.type"
          @click="switchType(tab.type)"
        >
          {{ tab.label }}
        </button>
      </template>
    </div>

    <div class="resource-create-dialog__scroll">
      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        :validate-on-rule-change="false"
        label-position="top"
        require-asterisk-position="right"
        class="resource-create-form"
      >
        <el-form-item v-if="activeType === 'organization'" label="所属租户" prop="tenantId">
          <el-select
            v-model="form.tenantId"
            placeholder="请选择租户"
            class="resource-create-form__select"
            @change="onTenantChange"
          >
            <el-option
              v-for="tenant in tenants"
              :key="tenant.id"
              :label="tenant.name"
              :value="tenant.id"
            />
          </el-select>
        </el-form-item>

        <el-form-item v-if="activeType === 'project'" label="所属租户 / 组织" prop="organizationId">
          <div class="resource-create-relation">
            <el-select v-model="form.tenantId" placeholder="请选择租户" @change="onTenantChange">
              <el-option
                v-for="tenant in tenants"
                :key="tenant.id"
                :label="tenant.name"
                :value="tenant.id"
              />
            </el-select>
            <el-icon class="resource-create-relation__arrow"><ArrowRight /></el-icon>
            <el-select
              v-model="form.organizationId"
              :disabled="!form.tenantId"
              :placeholder="form.tenantId ? '请选择组织' : '请先选择租户'"
            >
              <el-option
                v-for="organization in organizationOptions"
                :key="organization.id"
                :label="organization.name"
                :value="organization.id"
              />
            </el-select>
          </div>
        </el-form-item>

        <el-form-item label="Code" prop="code">
          <el-input
            v-model="form.code"
            :placeholder="
              activeType === 'tenant'
                ? '租户唯一标识，如 east-china'
                : activeType === 'organization'
                  ? '组织唯一标识，如 tech-center'
                  : '项目唯一标识，如 user-service'
            "
          />
        </el-form-item>

        <el-form-item label="名称" prop="name">
          <el-input
            v-model="form.name"
            :placeholder="
              activeType === 'tenant'
                ? '租户名称'
                : activeType === 'organization'
                  ? '组织名称'
                  : '项目名称'
            "
          />
        </el-form-item>

        <el-form-item label="备注" prop="remark">
          <el-input v-model="form.remark" type="textarea" :rows="3" placeholder="可选描述" />
        </el-form-item>

        <section v-if="activeType === 'project'" class="environment-editor">
          <header class="environment-editor__heading">
            <strong>环境配置</strong>
            <el-button text type="primary" :icon="Plus" @click="addEnvironment">
              新建环境
            </el-button>
          </header>

          <div v-if="form.environments.length" class="environment-editor__table">
            <div class="environment-editor__row environment-editor__row--head">
              <span>环境名称</span>
              <span>环境 Code</span>
              <span>备注</span>
              <span>权限校验</span>
              <span></span>
            </div>
            <div
              v-for="(environment, index) in form.environments"
              :key="environment.rowId"
              class="environment-editor__row"
            >
              <el-input
                v-model="environment.name"
                placeholder="环境名称"
                :aria-label="`第 ${index + 1} 个环境名称`"
              />
              <el-input
                v-model="environment.code"
                placeholder="如 dev"
                :aria-label="`第 ${index + 1} 个环境 Code`"
              />
              <el-input
                v-model="environment.remark"
                placeholder="可选备注"
                :aria-label="`第 ${index + 1} 个环境备注`"
              />
              <span class="environment-editor__permission">
                <el-tooltip content="查看values需要权限校验" placement="top">
                  <el-switch
                    v-model="environment.isCheckPerm"
                    :aria-label="`第 ${index + 1} 个环境权限校验`"
                  />
                </el-tooltip>
              </span>
              <el-tooltip content="删除环境" placement="top">
                <button
                  type="button"
                  class="environment-editor__delete"
                  :aria-label="`删除第 ${index + 1} 个环境`"
                  @click="removeEnvironment(index)"
                >
                  <el-icon><Delete /></el-icon>
                </button>
              </el-tooltip>
            </div>
          </div>
          <div v-else class="environment-editor__empty">暂无环境，点击「新建环境」添加</div>
        </section>
      </el-form>
    </div>

    <template #footer>
      <el-button :disabled="submitting" @click="dialogVisible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="submit">创建</el-button>
    </template>
  </el-dialog>
</template>

<style lang="scss">
.resource-create-dialog.el-dialog {
  max-width: calc(100vw - 32px);
  max-height: 90vh;
  margin: auto;
  padding: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--v-surface-border);
  border-radius: 16px;
  background: var(--v-surface-bg);
  box-shadow: var(--v-shadow-lg);

  .el-dialog__header {
    min-height: 56px;
    margin: 0;
    padding: 0 22px;
    display: flex;
    align-items: center;
    border-bottom: 1px solid var(--v-divider);
  }

  .el-dialog__headerbtn {
    top: 10px;
    right: 13px;
    width: 36px;
    height: 36px;
  }

  .el-dialog__body {
    min-height: 0;
    padding: 0;
    overflow: hidden;
    color: var(--v-text-primary);
  }

  .el-dialog__footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
    padding: 14px 22px;
    border-top: 1px solid var(--v-divider);
    background: var(--v-surface-bg);
  }

  .el-button {
    min-width: 58px;
    height: 32px;
    margin-left: 0;
    padding: 0 16px;
    border-radius: 16px;
    font-size: 13px;
    font-weight: 600;

    &.el-button--primary {
      border-color: rgb(23, 93, 251);
      background: rgb(23, 93, 251);
      box-shadow: 0 3px 8px rgba(23, 93, 251, 0.24);

      &:hover,
      &:focus-visible {
        border-color: rgb(18, 76, 214);
        background: rgb(18, 76, 214);
      }
    }
  }

  .el-form-item {
    margin-bottom: 16px;
  }

  .el-form-item__label {
    height: auto;
    margin-bottom: 7px;
    color: var(--v-text-primary);
    font-size: 13px;
    font-weight: 600;
    line-height: 1.4;
  }

  .el-input__wrapper,
  .el-select__wrapper {
    min-height: 36px;
    border-radius: 9px;
    background: var(--v-surface-bg-subtle);
    box-shadow: 0 0 0 1px var(--v-surface-border) inset;
  }

  .el-textarea__inner {
    min-height: 72px !important;
    padding: 10px 12px;
    resize: vertical;
    border-radius: 9px;
    background: var(--v-surface-bg-subtle);
    box-shadow: 0 0 0 1px var(--v-surface-border) inset;
  }
}

.resource-create-dialog__title {
  color: var(--v-text-primary);
  font-size: 14px;
  font-weight: 700;
}

.resource-create-dialog__scroll {
  max-height: calc(90vh - 157px);
  min-height: 0;
  padding: 18px 22px 20px;
  overflow-y: auto;
}

.resource-create-tabs {
  min-height: 43px;
  padding: 0 8px;
  display: flex;
  align-items: stretch;
  gap: 2px;
  border-bottom: 1px solid var(--v-divider);

  &__item {
    min-width: 88px;
    padding: 0 14px;
    border: 0;
    border-bottom: 2px solid transparent;
    background: transparent;
    color: var(--v-text-secondary);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;

    &:hover,
    &.is-active {
      color: rgb(23, 93, 251);
    }

    &.is-active {
      border-bottom-color: rgb(23, 93, 251);
    }
  }
}

.resource-create-form__select {
  width: 100%;
}

.resource-create-relation {
  width: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 18px minmax(0, 1fr);
  align-items: center;
  gap: 10px;

  &__arrow {
    color: var(--v-text-tertiary);
    font-size: 14px;
  }
}

.environment-editor {
  margin-top: 2px;

  &__heading {
    min-height: 34px;
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    justify-content: space-between;

    strong {
      font-size: 13px;
      font-weight: 600;
    }
  }

  &__table {
    overflow-x: auto;
  }

  &__row {
    min-width: 660px;
    display: grid;
    grid-template-columns: minmax(120px, 1fr) minmax(120px, 1fr) minmax(180px, 1.6fr) 100px 28px;
    align-items: center;
    gap: 8px;

    & + & {
      margin-top: 8px;
    }

    &--head {
      margin-bottom: 8px;
      color: var(--v-text-secondary);
      font-size: 11px;
      font-weight: 600;
    }
  }

  &__delete {
    width: 28px;
    height: 28px;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--v-text-tertiary);
    cursor: pointer;

    &:hover {
      background: rgba(220, 38, 38, 0.08);
      color: var(--v-color-danger);
    }
  }

  &__permission {
    display: inline-flex;
    align-items: center;
  }

  &__empty {
    min-height: 62px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px dashed var(--v-surface-border);
    border-radius: 9px;
    color: var(--v-text-tertiary);
    font-size: 12px;
  }
}

@media (max-width: 720px) {
  .resource-create-dialog__scroll {
    padding: 16px;
  }

  .resource-create-relation {
    grid-template-columns: 1fr;

    &__arrow {
      display: none;
    }
  }
}
</style>
