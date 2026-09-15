<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import {
  ElMessage,
  ElMessageBox,
  type CheckboxValueType,
  type FormInstance,
  type FormRules,
} from 'element-plus'
import {
  ArrowLeft,
  Check,
  Close,
  Delete,
  Plus,
  Rank,
  Search,
  UserFilled,
} from '@element-plus/icons-vue'
import {
  allocateUsers,
  listUsers,
  type ListUsersRequest,
  type UserListItem,
  type UserResourceType,
} from '@/api/user'
import { createEnvironment, listEnvironments, updateEnvironment } from '@/api/env'
import ManagerSelect from '@/components/ManagerSelect.vue'
import ResourceAuditPanel from '@/components/ResourceAuditPanel.vue'
import TenantTagPanel from '@/components/TenantTagPanel.vue'
import { ApiError } from '@/types/api'
import type { Environment } from '@/types/env'
import { calculateEnvironmentOrderNo } from '@/utils/environment-order'
import { formatDateTime } from '@/utils/format'

export type EditableResourceType = 'tenant' | 'organization' | 'project'

export interface ResourceEditPayload {
  name: string
  remark: string
  managerId: string
}

type ResourceEditTab = 'basic' | 'environments' | 'users' | 'audit' | 'tags'

interface EnvironmentCreateForm {
  code: string
  name: string
  remark: string
  isCheckPerm: boolean
}

type EnvironmentTableRow =
  | { kind: 'environment'; environment: Environment; existingIndex: number }
  | { kind: 'draft' }

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    resourceType: EditableResourceType
    resourceId: string
    name: string
    remark: string
    managerId: string
    managerName?: string
    tenantId?: string
    orgId?: string
    submitting: boolean
  }>(),
  { managerName: '', tenantId: '', orgId: '' },
)

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  submit: [payload: ResourceEditPayload]
  'members-changed': []
}>()

const dialogVisible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => {
    if (!value && (props.submitting || tagBusy.value || memberBusy.value)) return
    emit('update:modelValue', value)
  },
})

const resourceLabel = computed(() => {
  if (props.resourceType === 'tenant') return '租户'
  return props.resourceType === 'organization' ? '组织' : '项目'
})
const allocationType = computed<UserResourceType>(() =>
  props.resourceType === 'organization' ? 'org' : props.resourceType,
)
const activeTab = ref<ResourceEditTab>('basic')
const tagBusy = ref(false)
const formRef = ref<FormInstance>()
const form = reactive({ name: '', remark: '', managerId: '' })
const rules: FormRules<ResourceEditPayload> = {
  name: [
    { required: true, message: '请输入名称', trigger: 'blur' },
    { max: 64, message: '长度不能超过 64 个字符', trigger: 'blur' },
  ],
  managerId: [{ required: true, message: '请选择管理员', trigger: 'change' }],
  remark: [{ max: 256, message: '长度不能超过 256 个字符', trigger: 'blur' }],
}

const members = ref<UserListItem[]>([])
const memberLoading = ref(false)
const memberLoadFailed = ref(false)
const memberSearch = ref('')
const memberAdding = ref(false)
const candidateUsers = ref<UserListItem[]>([])
const candidateLoading = ref(false)
const candidateLoadFailed = ref(false)
const candidateSearch = ref('')
const selectedCandidateIds = ref<string[]>([])
const allocating = ref(false)
const removingUserId = ref('')
const memberBusy = computed(() => allocating.value || !!removingUserId.value)
let memberRequestSequence = 0
let candidateRequestSequence = 0
let dialogSequence = 0

const environments = ref<Environment[]>([])
const environmentLoading = ref(false)
const environmentLoadFailed = ref(false)
const environmentDraftVisible = ref(false)
const environmentDraftIndex = ref(0)
const environmentDraftDragging = ref(false)
const environmentCreateSubmitting = ref(false)
const environmentPermissionUpdatingId = ref('')
const environmentFormRef = ref<FormInstance>()
const environmentForm = reactive<EnvironmentCreateForm>({
  code: '',
  name: '',
  remark: '',
  isCheckPerm: false,
})
const environmentRules: FormRules<EnvironmentCreateForm> = {
  code: [
    { required: true, message: '请输入环境 Code', trigger: 'blur' },
    {
      pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      message: '仅支持小写字母、数字和中横线',
      trigger: 'blur',
    },
    { max: 32, message: '长度不能超过 32 个字符', trigger: 'blur' },
  ],
  name: [
    { required: true, message: '请输入环境名称', trigger: 'blur' },
    { max: 64, message: '长度不能超过 64 个字符', trigger: 'blur' },
  ],
  remark: [{ max: 256, message: '长度不能超过 256 个字符', trigger: 'blur' }],
}
let environmentRequestSequence = 0

const orderedEnvironments = computed(() =>
  [...environments.value].sort(
    (left, right) => left.orderNo - right.orderNo || right.createAt.localeCompare(left.createAt),
  ),
)

const environmentDraftOrderNo = computed(() => {
  const list = orderedEnvironments.value
  const index = Math.min(Math.max(environmentDraftIndex.value, 0), list.length)
  return calculateEnvironmentOrderNo(list, index)
})

const environmentRows = computed<EnvironmentTableRow[]>(() => {
  const rows: EnvironmentTableRow[] = orderedEnvironments.value.map(
    (environment, existingIndex) => ({ kind: 'environment', environment, existingIndex }),
  )
  if (environmentDraftVisible.value) {
    const index = Math.min(Math.max(environmentDraftIndex.value, 0), rows.length)
    rows.splice(index, 0, { kind: 'draft' })
  }
  return rows
})

const hasChanges = computed(
  () =>
    form.name.trim() !== props.name.trim() ||
    form.remark.trim() !== props.remark.trim() ||
    form.managerId !== props.managerId,
)

function userIdOf(user: UserListItem): string {
  return user.userId || user.staffUserId || user.staffuserid || user.id || ''
}

function userNameOf(user: UserListItem): string {
  return user.nickname || user.nickName || user.name || user.userName || userIdOf(user)
}

function matchesUser(user: UserListItem, keyword: string): boolean {
  if (!keyword) return true
  return `${userNameOf(user)} ${userIdOf(user)}`.toLowerCase().includes(keyword.toLowerCase())
}

const filteredMembers = computed(() =>
  members.value.filter((user) => matchesUser(user, memberSearch.value.trim())),
)
const filteredCandidates = computed(() =>
  candidateUsers.value.filter((user) => matchesUser(user, candidateSearch.value.trim())),
)
const allVisibleCandidatesSelected = computed(
  () =>
    filteredCandidates.value.length > 0 &&
    filteredCandidates.value.every((user) => selectedCandidateIds.value.includes(userIdOf(user))),
)
const someVisibleCandidatesSelected = computed(
  () =>
    !allVisibleCandidatesSelected.value &&
    filteredCandidates.value.some((user) => selectedCandidateIds.value.includes(userIdOf(user))),
)

function memberScopeRequest(): ListUsersRequest {
  if (props.resourceType === 'tenant') return { tenantId: props.resourceId }
  if (props.resourceType === 'organization') return { orgId: props.resourceId }
  return { projectId: props.resourceId }
}

function candidateScopeRequest(): ListUsersRequest | null {
  if (props.resourceType === 'tenant') return { undistributed: true }
  if (props.resourceType === 'organization') {
    return props.tenantId ? { tenantId: props.tenantId } : null
  }
  return props.orgId ? { orgId: props.orgId } : null
}

async function loadMembers(): Promise<void> {
  if (!props.resourceId) return
  const requestSequence = ++memberRequestSequence
  memberLoading.value = true
  memberLoadFailed.value = false
  try {
    const response = await listUsers(memberScopeRequest())
    if (requestSequence !== memberRequestSequence) return
    members.value = response.list
  } catch {
    if (requestSequence !== memberRequestSequence) return
    members.value = []
    memberLoadFailed.value = true
  } finally {
    if (requestSequence === memberRequestSequence) memberLoading.value = false
  }
}

async function loadCandidates(): Promise<void> {
  if (!memberAdding.value) return
  const requestSequence = ++candidateRequestSequence
  candidateLoadFailed.value = false
  const scope = candidateScopeRequest()
  if (!scope) {
    candidateUsers.value = []
    candidateLoadFailed.value = true
    candidateLoading.value = false
    ElMessage.error(`当前${resourceLabel.value}缺少上级信息，无法添加成员`)
    return
  }

  candidateLoading.value = true
  try {
    const response = await listUsers(scope)
    if (requestSequence !== candidateRequestSequence) return
    const memberIds = new Set(members.value.map(userIdOf))
    candidateUsers.value = response.list.filter(
      (user) => !!userIdOf(user) && !user.isBlocked && !memberIds.has(userIdOf(user)),
    )
    const candidateIds = new Set(candidateUsers.value.map(userIdOf))
    selectedCandidateIds.value = selectedCandidateIds.value.filter((id) => candidateIds.has(id))
  } catch {
    if (requestSequence !== candidateRequestSequence) return
    candidateUsers.value = []
    candidateLoadFailed.value = true
  } finally {
    if (requestSequence === candidateRequestSequence) candidateLoading.value = false
  }
}

async function loadEnvironments(): Promise<void> {
  if (props.resourceType !== 'project' || !props.resourceId) return
  const requestSequence = ++environmentRequestSequence
  environmentLoading.value = true
  environmentLoadFailed.value = false
  try {
    const response = await listEnvironments({ projectId: props.resourceId })
    if (requestSequence !== environmentRequestSequence) return
    environments.value = response
  } catch {
    if (requestSequence !== environmentRequestSequence) return
    environments.value = []
    environmentLoadFailed.value = true
  } finally {
    if (requestSequence === environmentRequestSequence) environmentLoading.value = false
  }
}

function resetDialog(): void {
  activeTab.value = 'basic'
  form.name = props.name
  form.remark = props.remark
  form.managerId = props.managerId
  memberSearch.value = ''
  resetMemberAddPage()

  environments.value = []
  environmentLoadFailed.value = false
  closeEnvironmentDraft()
  nextTick(() => formRef.value?.clearValidate())
}

function switchTab(tab: ResourceEditTab): void {
  if (props.submitting || tagBusy.value || memberBusy.value) return
  if (tab !== 'users') backToMembers()
  activeTab.value = tab
  if (tab === 'users') void loadMembers()
  if (tab === 'environments') void loadEnvironments()
}

function resetEnvironmentForm(): void {
  environmentForm.code = ''
  environmentForm.name = ''
  environmentForm.remark = ''
  environmentForm.isCheckPerm = false
  nextTick(() => environmentFormRef.value?.clearValidate())
}

function openEnvironmentDraft(): void {
  if (environmentDraftVisible.value) return
  resetEnvironmentForm()
  environmentDraftIndex.value = orderedEnvironments.value.length
  environmentDraftVisible.value = true
}

function closeEnvironmentDraft(): void {
  environmentDraftVisible.value = false
  environmentDraftDragging.value = false
  environmentDraftIndex.value = orderedEnvironments.value.length
  resetEnvironmentForm()
}

function startEnvironmentDraftDrag(event: DragEvent): void {
  if (!environmentDraftVisible.value || environmentCreateSubmitting.value) {
    event.preventDefault()
    return
  }
  environmentDraftDragging.value = true
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', 'environment-draft')
  }
}

function moveEnvironmentDraft(event: DragEvent, existingIndex: number): void {
  if (!environmentDraftDragging.value) return
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'

  const row = event.currentTarget as HTMLElement | null
  if (!row) return
  const bounds = row.getBoundingClientRect()
  environmentDraftIndex.value =
    existingIndex + (event.clientY >= bounds.top + bounds.height / 2 ? 1 : 0)
}

function finishEnvironmentDraftDrag(): void {
  environmentDraftDragging.value = false
}

async function createProjectEnvironment(): Promise<void> {
  if (!environmentDraftVisible.value || environmentCreateSubmitting.value) return
  const valid = await environmentFormRef.value?.validate().catch(() => false)
  if (!valid) return

  environmentCreateSubmitting.value = true
  try {
    await createEnvironment({
      projectId: props.resourceId,
      environments: [
        {
          code: environmentForm.code.trim(),
          name: environmentForm.name.trim(),
          remark: environmentForm.remark.trim(),
          orderNo: environmentDraftOrderNo.value,
          isCheckPerm: environmentForm.isCheckPerm,
        },
      ],
    })
    ElMessage.success('环境创建成功')
    closeEnvironmentDraft()
    await loadEnvironments()
  } catch (error) {
    if (!(error instanceof ApiError)) ElMessage.error('环境创建失败')
  } finally {
    environmentCreateSubmitting.value = false
  }
}

async function updateEnvironmentPermission(
  environment: Environment,
  isCheckPerm: boolean,
): Promise<void> {
  if (environmentPermissionUpdatingId.value || environment.isCheckPerm === isCheckPerm) {
    return
  }

  environmentPermissionUpdatingId.value = environment.id
  try {
    const updated = await updateEnvironment({
      id: environment.id,
      name: environment.name,
      remark: environment.remark,
      orderNo: environment.orderNo,
      isCheckPerm,
    })
    const target = environments.value.find((item) => item.id === environment.id)
    if (target) Object.assign(target, updated)
    ElMessage.success('权限校验设置已更新')
  } catch (error) {
    if (!(error instanceof ApiError)) ElMessage.error('权限校验设置更新失败')
  } finally {
    environmentPermissionUpdatingId.value = ''
  }
}

async function submit(): Promise<void> {
  if (props.submitting || activeTab.value !== 'basic' || !hasChanges.value) return
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  emit('submit', {
    name: form.name.trim(),
    remark: form.remark.trim(),
    managerId: form.managerId,
  })
}

function resetMemberAddPage(): void {
  candidateRequestSequence += 1
  memberAdding.value = false
  candidateLoading.value = false
  candidateLoadFailed.value = false
  candidateUsers.value = []
  candidateSearch.value = ''
  selectedCandidateIds.value = []
}

// 返回只切换当前管理弹框的内容，同一次打开期间保留搜索和选择
function backToMembers(): void {
  if (allocating.value) return
  memberAdding.value = false
  candidateRequestSequence += 1
  candidateLoading.value = false
}

async function openAddMembers(): Promise<void> {
  if (memberLoading.value || memberLoadFailed.value || memberBusy.value) return
  memberAdding.value = true
  await loadCandidates()
}

function toggleCandidate(userId: string, checked: CheckboxValueType): void {
  if (allocating.value || candidateLoading.value || !memberAdding.value) return
  if (Boolean(checked)) {
    if (!selectedCandidateIds.value.includes(userId)) {
      selectedCandidateIds.value = [...selectedCandidateIds.value, userId]
    }
    return
  }
  selectedCandidateIds.value = selectedCandidateIds.value.filter((id) => id !== userId)
}

function toggleAllVisibleCandidates(checked: CheckboxValueType): void {
  if (allocating.value || candidateLoading.value || !memberAdding.value) return
  const visibleIds = filteredCandidates.value.map(userIdOf).filter(Boolean)
  if (Boolean(checked)) {
    selectedCandidateIds.value = [...new Set([...selectedCandidateIds.value, ...visibleIds])]
    return
  }
  const visibleSet = new Set(visibleIds)
  selectedCandidateIds.value = selectedCandidateIds.value.filter((id) => !visibleSet.has(id))
}

async function addSelectedUsers(): Promise<void> {
  if (
    !memberAdding.value ||
    !selectedCandidateIds.value.length ||
    allocating.value ||
    candidateLoading.value ||
    candidateLoadFailed.value
  )
    return
  const requestSequence = dialogSequence
  allocating.value = true
  try {
    const result = await allocateUsers({
      type: allocationType.value,
      operate: 'add',
      resourceId: props.resourceId,
      userIdList: [...selectedCandidateIds.value],
    })
    if (requestSequence !== dialogSequence) return
    ElMessage.success(`已添加 ${result.affectedCount} 名成员`)
    resetMemberAddPage()
    await loadMembers()
    if (requestSequence === dialogSequence) emit('members-changed')
  } catch (error) {
    if (!(error instanceof ApiError)) ElMessage.error('成员添加失败')
  } finally {
    allocating.value = false
  }
}

async function removeUser(user: UserListItem): Promise<void> {
  const userId = userIdOf(user)
  if (!userId || userId === props.managerId || removingUserId.value) return
  const cascadeNotice =
    props.resourceType === 'tenant'
      ? '移除后，该用户的组织和项目归属也会解除。'
      : props.resourceType === 'organization'
        ? '移除后，该用户在本组织下的项目归属也会解除。'
        : ''
  try {
    await ElMessageBox.confirm(
      `确认移除成员 ${userNameOf(user)} 么？${cascadeNotice}`,
      '移除成员',
      {
        type: 'warning',
        confirmButtonText: '移除',
        cancelButtonText: '取消',
        customClass: 'vault-confirm-message-box',
        confirmButtonClass: 'vault-delete-confirm-button',
      },
    )
  } catch {
    return
  }

  removingUserId.value = userId
  try {
    await allocateUsers({
      type: allocationType.value,
      operate: 'remove',
      resourceId: props.resourceId,
      userIdList: [userId],
    })
    ElMessage.success('成员已移除')
    await loadMembers()
    emit('members-changed')
  } catch (error) {
    if (!(error instanceof ApiError)) ElMessage.error('成员移除失败')
  } finally {
    removingUserId.value = ''
  }
}

watch(
  () =>
    [
      props.modelValue,
      props.resourceType,
      props.resourceId,
      props.name,
      props.remark,
      props.managerId,
      props.tenantId,
      props.orgId,
    ] as const,
  ([visible]) => {
    dialogSequence += 1
    memberRequestSequence += 1
    candidateRequestSequence += 1
    environmentRequestSequence += 1
    members.value = []
    if (visible) resetDialog()
    else resetMemberAddPage()
  },
  { flush: 'post', immediate: true },
)

onBeforeUnmount(() => {
  dialogSequence += 1
  memberRequestSequence += 1
  candidateRequestSequence += 1
  environmentRequestSequence += 1
})
</script>

<template>
  <el-dialog
    v-model="dialogVisible"
    width="860px"
    class="vault-card-edit-dialog tenant-edit-dialog resource-edit-dialog"
    :close-on-click-modal="false"
    :close-on-press-escape="!submitting && !tagBusy && !memberBusy"
    :show-close="!submitting && !tagBusy && !memberBusy"
    align-center
    destroy-on-close
    @closed="resetDialog"
  >
    <template #header>
      <nav class="tenant-edit-tabs" :aria-label="`${resourceLabel}编辑菜单`">
        <button
          type="button"
          class="tenant-edit-tabs__item"
          :class="{ 'is-active': activeTab === 'basic' }"
          :disabled="submitting || tagBusy || memberBusy"
          :aria-current="activeTab === 'basic' ? 'page' : undefined"
          @click="switchTab('basic')"
        >
          基础信息
        </button>
        <button
          v-if="resourceType === 'tenant'"
          type="button"
          class="tenant-edit-tabs__item"
          :class="{ 'is-active': activeTab === 'tags' }"
          :disabled="submitting || tagBusy || memberBusy"
          :aria-current="activeTab === 'tags' ? 'page' : undefined"
          @click="switchTab('tags')"
        >
          标签管理
        </button>
        <button
          v-if="resourceType === 'project'"
          type="button"
          class="tenant-edit-tabs__item"
          :class="{ 'is-active': activeTab === 'environments' }"
          :disabled="submitting || tagBusy || memberBusy"
          :aria-current="activeTab === 'environments' ? 'page' : undefined"
          @click="switchTab('environments')"
        >
          环境管理
        </button>
        <button
          type="button"
          class="tenant-edit-tabs__item"
          :class="{ 'is-active': activeTab === 'users' }"
          :disabled="submitting || tagBusy || memberBusy"
          :aria-current="activeTab === 'users' ? 'page' : undefined"
          @click="switchTab('users')"
        >
          用户管理
        </button>
        <button
          type="button"
          class="tenant-edit-tabs__item"
          :class="{ 'is-active': activeTab === 'audit' }"
          :disabled="submitting || tagBusy || memberBusy"
          :aria-current="activeTab === 'audit' ? 'page' : undefined"
          @click="switchTab('audit')"
        >
          操作记录
        </button>
      </nav>
    </template>

    <div
      class="tenant-edit-dialog__content resource-edit-dialog__content"
      :class="{
        'resource-edit-dialog__content--tags': activeTab === 'tags',
        'resource-edit-dialog__content--members': activeTab === 'users',
      }"
    >
      <el-form
        v-show="activeTab === 'basic'"
        ref="formRef"
        :model="form"
        :rules="rules"
        label-position="left"
        label-width="96px"
        require-asterisk-position="right"
        class="tenant-edit-dialog__form"
      >
        <el-form-item :label="`${resourceLabel}名称`" prop="name">
          <el-input
            v-model="form.name"
            maxlength="64"
            show-word-limit
            :placeholder="`请输入${resourceLabel}名称`"
            :disabled="submitting"
          />
        </el-form-item>
        <el-form-item label="管理员" prop="managerId">
          <ManagerSelect
            v-model="form.managerId"
            :tenant-id="resourceType === 'tenant' ? resourceId : ''"
            :org-id="resourceType === 'organization' ? resourceId : ''"
            :project-id="resourceType === 'project' ? resourceId : ''"
            :selected-name="managerName"
            :exclude-external="resourceType === 'project'"
            :disabled="submitting"
          />
        </el-form-item>
        <el-form-item label="备注" prop="remark">
          <el-input
            v-model="form.remark"
            type="textarea"
            :rows="5"
            maxlength="256"
            show-word-limit
            :placeholder="`可选，填写${resourceLabel}相关说明`"
            :disabled="submitting"
          />
        </el-form-item>
      </el-form>

      <section v-show="activeTab === 'environments'" class="resource-environments">
        <header class="resource-members__toolbar">
          <div class="resource-members__heading">
            <strong>环境列表</strong>
            <span>{{ environments.length }} 个</span>
          </div>

          <button
            type="button"
            class="resource-members__add"
            aria-label="新建环境"
            :disabled="environmentLoading || environmentDraftVisible"
            @click="openEnvironmentDraft"
          >
            <el-icon><Plus /></el-icon>
          </button>
        </header>

        <div v-loading="environmentLoading" class="resource-members__table-wrap">
          <el-form
            v-if="environmentRows.length"
            ref="environmentFormRef"
            :model="environmentForm"
            :rules="environmentRules"
            class="resource-environments__form"
          >
            <table class="resource-members__table resource-environments__table">
              <thead>
                <tr>
                  <th aria-label="拖动排序"></th>
                  <th>环境</th>
                  <th>备注</th>
                  <th>权限校验</th>
                  <th>排序</th>
                  <th>创建时间</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in environmentRows"
                  :key="row.kind === 'draft' ? 'environment-draft' : row.environment.id"
                  :class="{
                    'resource-environments__draft': row.kind === 'draft',
                    'is-dragging': row.kind === 'draft' && environmentDraftDragging,
                  }"
                  @dragover="
                    row.kind === 'environment'
                      ? moveEnvironmentDraft($event, row.existingIndex)
                      : undefined
                  "
                  @drop.prevent="finishEnvironmentDraftDrag"
                >
                  <template v-if="row.kind === 'environment'">
                    <td></td>
                    <td>
                      <span class="resource-environment-identity">
                        <strong>{{ row.environment.name }}</strong>
                        <code>{{ row.environment.code }}</code>
                      </span>
                    </td>
                    <td class="resource-members__muted resource-environments__remark">
                      {{ row.environment.remark || '—' }}
                    </td>
                    <td>
                      <el-switch
                        :model-value="row.environment.isCheckPerm"
                        inline-prompt
                        active-text="开"
                        inactive-text="关"
                        :loading="environmentPermissionUpdatingId === row.environment.id"
                        :disabled="Boolean(environmentPermissionUpdatingId)"
                        @change="updateEnvironmentPermission(row.environment, Boolean($event))"
                      />
                    </td>
                    <td class="resource-members__muted">{{ row.environment.orderNo }}</td>
                    <td class="resource-members__muted">
                      {{ formatDateTime(row.environment.createAt) }}
                    </td>
                  </template>

                  <template v-else>
                    <td>
                      <el-tooltip content="拖动调整新环境位置" placement="top">
                        <button
                          type="button"
                          class="resource-environments__drag-handle"
                          draggable="true"
                          aria-label="拖动调整新环境位置"
                          :disabled="environmentCreateSubmitting"
                          @dragstart="startEnvironmentDraftDrag"
                          @dragend="finishEnvironmentDraftDrag"
                        >
                          <el-icon><Rank /></el-icon>
                        </button>
                      </el-tooltip>
                    </td>
                    <td>
                      <div class="resource-environments__draft-identity">
                        <el-form-item prop="name">
                          <el-input
                            v-model="environmentForm.name"
                            maxlength="64"
                            placeholder="环境名称"
                            :disabled="environmentCreateSubmitting"
                          />
                        </el-form-item>
                        <el-form-item prop="code">
                          <el-input
                            v-model="environmentForm.code"
                            maxlength="32"
                            placeholder="环境 Code"
                            :disabled="environmentCreateSubmitting"
                          />
                        </el-form-item>
                      </div>
                    </td>
                    <td>
                      <el-form-item prop="remark">
                        <el-input
                          v-model="environmentForm.remark"
                          maxlength="256"
                          placeholder="备注"
                          :disabled="environmentCreateSubmitting"
                        />
                      </el-form-item>
                    </td>
                    <td>
                      <el-switch
                        v-model="environmentForm.isCheckPerm"
                        inline-prompt
                        active-text="开"
                        inactive-text="关"
                        :disabled="environmentCreateSubmitting"
                      />
                    </td>
                    <td>
                      <span class="resource-environments__draft-order">
                        {{ environmentDraftOrderNo }}
                      </span>
                    </td>
                    <td>
                      <span class="resource-environments__draft-actions">
                        <button
                          type="button"
                          class="resource-environments__draft-action is-submit"
                          aria-label="创建环境"
                          :disabled="environmentCreateSubmitting"
                          @click="createProjectEnvironment"
                        >
                          <span
                            v-if="environmentCreateSubmitting"
                            class="resource-members__spinner"
                          ></span>
                          <el-icon v-else><Check /></el-icon>
                        </button>

                        <button
                          type="button"
                          class="resource-environments__draft-action"
                          aria-label="取消新增"
                          :disabled="environmentCreateSubmitting"
                          @click="closeEnvironmentDraft"
                        >
                          <el-icon><Close /></el-icon>
                        </button>
                      </span>
                    </td>
                  </template>
                </tr>
              </tbody>
            </table>
          </el-form>
          <div v-else-if="!environmentLoading" class="resource-members__empty">
            <strong>{{ environmentLoadFailed ? '环境加载失败' : '暂无环境' }}</strong>
            <el-button
              v-if="!environmentLoadFailed"
              type="primary"
              link
              @click="openEnvironmentDraft"
            >
              新建环境
            </el-button>
            <el-button v-if="environmentLoadFailed" type="primary" link @click="loadEnvironments">
              重新加载
            </el-button>
          </div>
        </div>
      </section>

      <section v-show="activeTab === 'users'" class="resource-members">
        <header class="resource-members__toolbar">
          <div class="resource-members__heading">
            <el-button
              v-if="memberAdding"
              circle
              size="small"
              :icon="ArrowLeft"
              aria-label="返回成员列表"
              :disabled="allocating"
              @click="backToMembers"
            />
            <strong>{{ memberAdding ? '添加成员' : '用户列表' }}</strong>
            <span>{{ memberAdding ? filteredCandidates.length : members.length }} 人</span>
          </div>
          <div class="resource-members__actions">
            <el-input
              v-if="memberAdding"
              v-model="candidateSearch"
              clearable
              class="resource-members__search"
              placeholder="搜索姓名或工号"
              aria-label="搜索可添加成员"
              :disabled="allocating"
              :prefix-icon="Search"
            />
            <el-input
              v-else
              v-model="memberSearch"
              clearable
              class="resource-members__search"
              placeholder="搜索姓名或工号"
              :disabled="memberBusy"
            >
              <template #prefix>
                <el-icon><Search /></el-icon>
              </template>
            </el-input>

            <button
              v-if="!memberAdding"
              type="button"
              class="resource-members__add"
              aria-label="添加成员"
              :disabled="memberLoading || memberLoadFailed || memberBusy"
              @click="openAddMembers"
            >
              <el-icon><Plus /></el-icon>
            </button>
          </div>
        </header>

        <div v-if="memberAdding" v-loading="candidateLoading" class="resource-members__table-wrap">
          <table
            v-if="filteredCandidates.length && !candidateLoadFailed"
            class="resource-members__table resource-members__candidate-table"
          >
            <thead>
              <tr>
                <th scope="col">
                  <el-checkbox
                    aria-label="选择当前结果"
                    :model-value="allVisibleCandidatesSelected"
                    :indeterminate="someVisibleCandidatesSelected"
                    :disabled="allocating || candidateLoading"
                    @change="toggleAllVisibleCandidates"
                  />
                </th>
                <th scope="col">用户</th>
                <th scope="col">工号</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="user in filteredCandidates" :key="userIdOf(user)">
                <td>
                  <el-checkbox
                    :aria-label="`选择${userNameOf(user)}`"
                    :model-value="selectedCandidateIds.includes(userIdOf(user))"
                    :disabled="allocating || candidateLoading"
                    @change="(checked) => toggleCandidate(userIdOf(user), checked)"
                  />
                </td>
                <td>
                  <span class="resource-member-user">
                    <span class="resource-member-user__avatar">{{
                      userNameOf(user).slice(0, 1)
                    }}</span>
                    <strong>{{ userNameOf(user) }}</strong>
                  </span>
                </td>
                <td class="resource-members__muted">{{ userIdOf(user) }}</td>
              </tr>
            </tbody>
          </table>
          <div v-else-if="!candidateLoading" class="resource-members__empty">
            <el-icon><UserFilled /></el-icon>
            <strong>{{
              candidateLoadFailed
                ? '候选成员加载失败'
                : candidateSearch.trim()
                  ? '没有匹配的成员'
                  : '暂无可添加用户'
            }}</strong>
            <el-button v-if="candidateLoadFailed" type="primary" link @click="loadCandidates"
              >重新加载</el-button
            >
          </div>
        </div>

        <div v-else v-loading="memberLoading" class="resource-members__table-wrap">
          <table v-if="filteredMembers.length" class="resource-members__table">
            <thead>
              <tr>
                <th>用户</th>
                <th>工号</th>
                <th>角色</th>
                <th>状态</th>
                <th aria-label="操作"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="user in filteredMembers" :key="userIdOf(user)">
                <td>
                  <span class="resource-member-user">
                    <span class="resource-member-user__avatar">{{
                      userNameOf(user).slice(0, 1)
                    }}</span>
                    <strong>{{ userNameOf(user) }}</strong>
                  </span>
                </td>
                <td class="resource-members__muted">{{ userIdOf(user) }}</td>
                <td>
                  <span
                    class="resource-member-role"
                    :class="{
                      'is-manager':
                        userIdOf(user) === managerId &&
                        user.projectRelation?.memberType !== 'external',
                      'is-external': user.projectRelation?.memberType === 'external',
                    }"
                  >
                    {{
                      user.projectRelation?.memberType === 'external'
                        ? '外部协作者'
                        : userIdOf(user) === managerId
                          ? '负责人'
                          : '成员'
                    }}
                  </span>
                </td>
                <td>
                  <span class="resource-member-status" :class="{ 'is-blocked': user.isBlocked }">
                    {{ user.isBlocked ? '已停用' : '正常' }}
                  </span>
                </td>
                <td class="resource-members__operation">
                  <el-tooltip
                    content="请先更换管理员"
                    :disabled="userIdOf(user) !== managerId"
                    placement="top"
                  >
                    <span>
                      <button
                        type="button"
                        class="resource-members__remove"
                        :disabled="userIdOf(user) === managerId || Boolean(removingUserId)"
                        :aria-label="`移除${userNameOf(user)}`"
                        @click="removeUser(user)"
                      >
                        <el-icon v-if="removingUserId !== userIdOf(user)"><Delete /></el-icon>
                        <span v-else class="resource-members__spinner"></span>
                      </button>
                    </span>
                  </el-tooltip>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-else-if="!memberLoading" class="resource-members__empty">
            <el-icon><UserFilled /></el-icon>
            <strong>{{ memberLoadFailed ? '用户加载失败' : '暂无用户' }}</strong>
            <el-button v-if="memberLoadFailed" type="primary" link @click="loadMembers">
              重新加载
            </el-button>
          </div>
        </div>

        <div v-if="memberAdding" class="resource-members__add-footer">
          <span>已选择 {{ selectedCandidateIds.length }} 人</span>
          <el-button
            class="vault-dialog-confirm-button"
            type="primary"
            :loading="allocating"
            :disabled="candidateLoading || candidateLoadFailed || !selectedCandidateIds.length"
            @click="addSelectedUsers"
            >添加{{
              selectedCandidateIds.length ? ` (${selectedCandidateIds.length})` : ''
            }}</el-button
          >
        </div>
      </section>

      <TenantTagPanel
        v-if="resourceType === 'tenant' && dialogVisible"
        v-show="activeTab === 'tags'"
        :tenant-id="resourceId"
        :active="activeTab === 'tags'"
        @busy="tagBusy = $event"
      />

      <ResourceAuditPanel
        v-show="activeTab === 'audit'"
        class="resource-edit-dialog__audit"
        :active="dialogVisible && activeTab === 'audit'"
        :resource-type="resourceType"
        :resource-id="resourceId"
        :resource-name="name"
      />
    </div>

    <template #footer>
      <el-button :disabled="submitting || tagBusy || memberBusy" @click="dialogVisible = false">
        {{ activeTab === 'basic' ? '取消' : '关闭' }}
      </el-button>
      <el-button
        v-if="activeTab === 'basic'"
        type="primary"
        :loading="submitting"
        :disabled="!hasChanges"
        @click="submit"
      >
        保存
      </el-button>
    </template>
  </el-dialog>
</template>
