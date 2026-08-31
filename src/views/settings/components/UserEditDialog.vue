<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { ChevronRight, Settings, UserRound } from '@lucide/vue'
import { listOrganizations } from '@/api/organization'
import type { Tenant } from '@/api/tenant'
import {
  updateManagedUser,
  type UserManagementListItem,
  type UpdateManagedUserRequest,
} from '@/api/user'
import type { Organization } from '@/types/organization'

const emptyUUID = '00000000-0000-0000-0000-000000000000'
const optionPageSize = 200

const props = defineProps<{
  modelValue: boolean
  user?: UserManagementListItem
  tenants: Tenant[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  saved: [userId: string]
}>()

const dialogVisible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})
const formRef = ref<FormInstance>()
const submitting = ref(false)
const organizationLoading = ref(false)
const organizationOptions = ref<Organization[]>([])
let organizationRequestID = 0

const form = reactive({
  userId: '',
  nickname: '',
  username: '',
  email: '',
  phone: '',
  tenantId: '',
  orgId: '',
})

const rules: FormRules<typeof form> = {
  nickname: [
    { required: true, message: '请输入姓名', trigger: 'blur' },
    { max: 64, message: '长度不能超过 64 个字符', trigger: 'blur' },
  ],
  username: [{ max: 64, message: '长度不能超过 64 个字符', trigger: 'blur' }],
  email: [
    { type: 'email', message: '请输入正确的邮箱地址', trigger: 'blur' },
    { max: 128, message: '长度不能超过 128 个字符', trigger: 'blur' },
  ],
  phone: [{ max: 32, message: '长度不能超过 32 个字符', trigger: 'blur' }],
}

function normalizeResourceID(id?: string): string {
  return !id || id === emptyUUID ? '' : id
}

const initialValue = computed(() => ({
  nickname: props.user?.nickname.trim() || '',
  username: props.user?.username.trim() || '',
  email: props.user?.email.trim() || '',
  phone: props.user?.phone.trim() || '',
  tenantId: normalizeResourceID(props.user?.tenantId),
  orgId: normalizeResourceID(props.user?.orgId),
}))

const hasChanges = computed(
  () =>
    form.nickname.trim() !== initialValue.value.nickname ||
    form.username.trim() !== initialValue.value.username ||
    form.email.trim() !== initialValue.value.email ||
    form.phone.trim() !== initialValue.value.phone ||
    form.tenantId !== initialValue.value.tenantId ||
    form.orgId !== initialValue.value.orgId,
)

function mergeOrganizations(pages: Organization[][]): Organization[] {
  const options = new Map<string, Organization>()
  for (const page of pages) {
    for (const organization of page) options.set(organization.id, organization)
  }
  return [...options.values()].sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))
}

async function loadOrganizationOptions(tenantId: string): Promise<void> {
  const requestID = ++organizationRequestID
  organizationOptions.value = []
  if (!tenantId) {
    organizationLoading.value = false
    return
  }

  organizationLoading.value = true
  try {
    const first = await listOrganizations({ tenantId, pageNum: 1, pageSize: optionPageSize })
    const pageCount = Math.ceil(first.total / optionPageSize)
    const rest =
      pageCount > 1
        ? await Promise.all(
            Array.from({ length: pageCount - 1 }, (_, index) =>
              listOrganizations({
                tenantId,
                pageNum: index + 2,
                pageSize: optionPageSize,
              }),
            ),
          )
        : []
    if (requestID !== organizationRequestID) return
    organizationOptions.value = mergeOrganizations([first.list, ...rest.map((page) => page.list)])
  } catch {
    if (requestID === organizationRequestID) organizationOptions.value = []
  } finally {
    if (requestID === organizationRequestID) organizationLoading.value = false
  }
}

function resetForm(): void {
  const user = props.user
  form.userId = user?.userId || ''
  form.nickname = user?.nickname || ''
  form.username = user?.username || ''
  form.email = user?.email || ''
  form.phone = user?.phone || ''
  form.tenantId = normalizeResourceID(user?.tenantId)
  form.orgId = normalizeResourceID(user?.orgId)
  void loadOrganizationOptions(form.tenantId)
  nextTick(() => formRef.value?.clearValidate())
}

function changeTenant(): void {
  form.orgId = ''
  void loadOrganizationOptions(form.tenantId)
}

async function submit(): Promise<void> {
  if (submitting.value || !hasChanges.value) return
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  try {
    const payload: UpdateManagedUserRequest = {
      userId: form.userId,
      nickname: form.nickname.trim(),
      username: form.username.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      tenantId: form.tenantId || null,
      orgId: form.orgId || null,
    }
    await updateManagedUser(payload)
    ElMessage.success('用户信息已更新')
    dialogVisible.value = false
    emit('saved', form.userId)
  } catch {
    // API interceptor already presents the server message.
  } finally {
    submitting.value = false
  }
}

function resetDialogState(): void {
  organizationRequestID += 1
  organizationLoading.value = false
  organizationOptions.value = []
}

watch(
  () => [props.modelValue, props.user?.userId] as const,
  ([visible]) => {
    if (visible) resetForm()
  },
  { flush: 'post' },
)
</script>

<template>
  <el-dialog
    v-model="dialogVisible"
    class="vault-card-edit-dialog user-edit-dialog"
    width="720px"
    align-center
    append-to-body
    destroy-on-close
    :close-on-click-modal="false"
    :close-on-press-escape="!submitting"
    :show-close="!submitting"
    @closed="resetDialogState"
  >
    <template #header>
      <div class="user-edit-dialog__header">
        <span aria-hidden="true"><Settings :size="18" :stroke-width="1.8" /></span>
        <div>
          <strong>编辑用户信息</strong>
          <small>{{ props.user?.nickname || props.user?.username || props.user?.userId }}</small>
        </div>
        <el-tag :type="props.user?.isBlocked ? 'danger' : 'success'" size="small" effect="plain">
          {{ props.user?.isBlocked ? '已锁定' : '正常' }}
        </el-tag>
      </div>
    </template>

    <div class="vault-card-edit-dialog__body user-edit-dialog__body">
      <div class="user-edit-dialog__section-title">
        <UserRound :size="16" :stroke-width="1.8" />
        <span>基础信息</span>
      </div>
      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-position="left"
        label-width="104px"
        require-asterisk-position="right"
        class="vault-card-edit-dialog__form user-edit-dialog__form"
      >
        <el-form-item label="用户 ID">
          <el-input v-model="form.userId" disabled />
        </el-form-item>
        <el-form-item label="姓名" prop="nickname">
          <el-input
            v-model="form.nickname"
            maxlength="64"
            placeholder="请输入姓名"
            :disabled="submitting"
          />
        </el-form-item>
        <el-form-item label="登录账号" prop="username">
          <el-input
            v-model="form.username"
            maxlength="64"
            placeholder="可选，请输入登录账号"
            :disabled="submitting"
          />
        </el-form-item>
        <el-form-item label="邮箱" prop="email">
          <el-input
            v-model="form.email"
            maxlength="128"
            placeholder="可选，请输入邮箱"
            :disabled="submitting"
          />
        </el-form-item>
        <el-form-item label="手机号码" prop="phone">
          <el-input
            v-model="form.phone"
            maxlength="32"
            placeholder="可选，请输入手机号码"
            :disabled="submitting"
          />
        </el-form-item>
        <el-form-item label="租户 / 组织">
          <div class="user-edit-dialog__scope-selector">
            <el-select
              v-model="form.tenantId"
              filterable
              placeholder="未分配租户"
              aria-label="所属租户"
              :disabled="submitting"
              @change="changeTenant"
            >
              <el-option label="未分配租户" value="" />
              <el-option
                v-for="tenant in tenants"
                :key="tenant.id"
                :label="tenant.name"
                :value="tenant.id"
              />
            </el-select>
            <ChevronRight :size="17" :stroke-width="1.8" aria-hidden="true" />
            <el-select
              v-model="form.orgId"
              filterable
              :loading="organizationLoading"
              :disabled="submitting || !form.tenantId"
              :placeholder="form.tenantId ? '未分配组织' : '请先选择租户'"
              aria-label="所属组织"
            >
              <el-option label="未分配组织" value="" />
              <el-option
                v-for="organization in organizationOptions"
                :key="organization.id"
                :label="organization.name"
                :value="organization.id"
              />
            </el-select>
          </div>
        </el-form-item>
      </el-form>
    </div>

    <template #footer>
      <el-button :disabled="submitting" @click="dialogVisible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" :disabled="!hasChanges" @click="submit">
        保存
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped lang="scss">
.user-edit-dialog {
  &__header {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    padding-right: 36px;

    > span {
      width: 34px;
      height: 34px;
      flex: 0 0 34px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: var(--v-radius-sm);
      background: rgba(23, 93, 251, 0.09);
      color: rgb(23, 93, 251);
    }

    > div {
      min-width: 0;
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    strong,
    small {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    strong {
      color: var(--v-text-primary);
      font-size: var(--v-font-lg);
      font-weight: 700;
    }

    small {
      color: var(--v-text-tertiary);
      font-size: var(--v-font-xs);
    }
  }

  &__body {
    max-height: calc(90vh - 126px);
  }

  &__section-title {
    display: flex;
    align-items: center;
    gap: 7px;
    margin-bottom: 16px;
    color: var(--v-text-secondary);
    font-size: var(--v-font-sm);
    font-weight: 650;
  }

  &__form {
    :deep(.el-form-item) {
      margin-bottom: 18px;
    }

    :deep(.el-select) {
      width: 100%;
    }

    :deep(.el-input.is-disabled .el-input__wrapper) {
      background: var(--v-surface-bg-muted);
    }
  }

  &__scope-selector {
    width: 100%;
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 18px minmax(0, 1fr);
    align-items: center;
    gap: 8px;

    > svg {
      color: var(--v-text-tertiary);
    }
  }
}

:global(.user-edit-dialog.vault-card-edit-dialog.el-dialog) {
  width: min(720px, calc(100vw - 32px));
}

:global(.user-edit-dialog.vault-card-edit-dialog.el-dialog .el-button--primary.is-disabled) {
  cursor: not-allowed;
  opacity: 0.5;
  box-shadow: none;
}

@media (max-width: 620px) {
  .user-edit-dialog {
    &__body {
      padding: 16px;
    }

    &__form {
      :deep(.el-form-item) {
        display: block;
      }

      :deep(.el-form-item__label) {
        width: 100% !important;
        height: 30px;
      }
    }
  }
}
</style>
