<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import {
  ElMessage,
  ElMessageBox,
  type CheckboxValueType,
  type FormInstance,
  type FormRules,
} from 'element-plus'
import { Delete, Plus, Search, UserFilled } from '@element-plus/icons-vue'
import {
  allocateUsers,
  listUsers,
  type ListUsersRequest,
  type UserListItem,
  type UserResourceType,
} from '@/api/user'
import ManagerSelect from '@/components/ManagerSelect.vue'
import { ApiError } from '@/types/api'

export type EditableResourceType = 'tenant' | 'organization' | 'project'

export interface ResourceEditPayload {
  name: string
  remark: string
  managerId: string
}

type ResourceEditTab = 'basic' | 'users'

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
  set: (value: boolean) => emit('update:modelValue', value),
})

const resourceLabel = computed(() => {
  if (props.resourceType === 'tenant') return '租户'
  return props.resourceType === 'organization' ? '组织' : '项目'
})
const allocationType = computed<UserResourceType>(() =>
  props.resourceType === 'organization' ? 'org' : props.resourceType,
)
const activeTab = ref<ResourceEditTab>('basic')
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
const addDialogVisible = ref(false)
const candidateUsers = ref<UserListItem[]>([])
const candidateLoading = ref(false)
const candidateSearch = ref('')
const selectedCandidateIds = ref<string[]>([])
const allocating = ref(false)
const removingUserId = ref('')
let memberRequestSequence = 0
let candidateRequestSequence = 0

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
  const scope = candidateScopeRequest()
  if (!scope) {
    candidateUsers.value = []
    ElMessage.error(`当前${resourceLabel.value}缺少上级信息，无法添加成员`)
    return
  }

  const requestSequence = ++candidateRequestSequence
  candidateLoading.value = true
  try {
    const response = await listUsers(scope)
    if (requestSequence !== candidateRequestSequence) return
    const memberIds = new Set(members.value.map(userIdOf))
    candidateUsers.value = response.list.filter(
      (user) => !user.isBlocked && !memberIds.has(userIdOf(user)),
    )
  } catch {
    if (requestSequence !== candidateRequestSequence) return
    candidateUsers.value = []
  } finally {
    if (requestSequence === candidateRequestSequence) candidateLoading.value = false
  }
}

function resetDialog(): void {
  activeTab.value = 'basic'
  form.name = props.name
  form.remark = props.remark
  form.managerId = props.managerId
  memberSearch.value = ''
  candidateSearch.value = ''
  selectedCandidateIds.value = []
  addDialogVisible.value = false
  nextTick(() => formRef.value?.clearValidate())
}

function switchTab(tab: ResourceEditTab): void {
  activeTab.value = tab
  if (tab === 'users') void loadMembers()
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

async function openAddDialog(): Promise<void> {
  addDialogVisible.value = true
  candidateSearch.value = ''
  selectedCandidateIds.value = []
  await loadCandidates()
}

function toggleCandidate(userId: string, checked: CheckboxValueType): void {
  if (Boolean(checked)) {
    if (!selectedCandidateIds.value.includes(userId)) {
      selectedCandidateIds.value = [...selectedCandidateIds.value, userId]
    }
    return
  }
  selectedCandidateIds.value = selectedCandidateIds.value.filter((id) => id !== userId)
}

function toggleAllVisibleCandidates(checked: CheckboxValueType): void {
  const visibleIds = filteredCandidates.value.map(userIdOf).filter(Boolean)
  if (Boolean(checked)) {
    selectedCandidateIds.value = [...new Set([...selectedCandidateIds.value, ...visibleIds])]
    return
  }
  const visibleSet = new Set(visibleIds)
  selectedCandidateIds.value = selectedCandidateIds.value.filter((id) => !visibleSet.has(id))
}

async function addSelectedUsers(): Promise<void> {
  if (!selectedCandidateIds.value.length || allocating.value) return
  allocating.value = true
  try {
    const result = await allocateUsers({
      type: allocationType.value,
      operate: 'add',
      resourceId: props.resourceId,
      userIdList: selectedCandidateIds.value,
    })
    ElMessage.success(`已添加 ${result.affectedCount} 名成员`)
    addDialogVisible.value = false
    await loadMembers()
    emit('members-changed')
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
  () => [props.modelValue, props.resourceId, props.name, props.remark, props.managerId] as const,
  ([visible]) => {
    memberRequestSequence += 1
    members.value = []
    if (visible) resetDialog()
  },
  { flush: 'post', immediate: true },
)
</script>

<template>
  <el-dialog
    v-model="dialogVisible"
    width="860px"
    class="vault-card-edit-dialog tenant-edit-dialog resource-edit-dialog"
    :close-on-click-modal="false"
    :close-on-press-escape="!submitting"
    :show-close="!submitting"
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
          :aria-current="activeTab === 'basic' ? 'page' : undefined"
          @click="switchTab('basic')"
        >
          基础信息
        </button>
        <button
          type="button"
          class="tenant-edit-tabs__item"
          :class="{ 'is-active': activeTab === 'users' }"
          :aria-current="activeTab === 'users' ? 'page' : undefined"
          @click="switchTab('users')"
        >
          用户管理
        </button>
      </nav>
    </template>

    <div class="tenant-edit-dialog__content resource-edit-dialog__content">
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

      <section v-show="activeTab === 'users'" class="resource-members">
        <header class="resource-members__toolbar">
          <div class="resource-members__heading">
            <strong>用户列表</strong>
            <span>{{ members.length }} 人</span>
          </div>
          <div class="resource-members__actions">
            <el-input
              v-model="memberSearch"
              clearable
              class="resource-members__search"
              placeholder="搜索姓名或工号"
            >
              <template #prefix>
                <el-icon><Search /></el-icon>
              </template>
            </el-input>
            <el-tooltip content="添加成员" placement="top">
              <button
                type="button"
                class="resource-members__add"
                aria-label="添加成员"
                @click="openAddDialog"
              >
                <el-icon><Plus /></el-icon>
              </button>
            </el-tooltip>
          </div>
        </header>

        <div v-loading="memberLoading" class="resource-members__table-wrap">
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
                    :class="{ 'is-manager': userIdOf(user) === managerId }"
                  >
                    {{ userIdOf(user) === managerId ? '负责人' : '成员' }}
                  </span>
                </td>
                <td>
                  <span class="resource-member-status" :class="{ 'is-blocked': user.isBlocked }">
                    {{ user.isBlocked ? '已停用' : '正常' }}
                  </span>
                </td>
                <td class="resource-members__operation">
                  <el-tooltip
                    :content="userIdOf(user) === managerId ? '请先更换管理员' : '移除成员'"
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
      </section>
    </div>

    <template #footer>
      <el-button :disabled="submitting" @click="dialogVisible = false">
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

    <el-dialog
      v-model="addDialogVisible"
      width="600px"
      class="vault-card-edit-dialog resource-member-add-dialog"
      title="添加成员"
      append-to-body
      align-center
      destroy-on-close
      :close-on-click-modal="false"
    >
      <div class="resource-member-add-dialog__body">
        <el-input
          v-model="candidateSearch"
          clearable
          class="resource-member-add-dialog__search"
          placeholder="搜索姓名或工号"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>

        <div v-loading="candidateLoading" class="resource-member-add-dialog__list">
          <label v-if="filteredCandidates.length" class="resource-member-candidate is-all">
            <el-checkbox
              :model-value="allVisibleCandidatesSelected"
              :indeterminate="someVisibleCandidatesSelected"
              @change="toggleAllVisibleCandidates"
            />
            <strong>选择当前结果</strong>
            <span>{{ filteredCandidates.length }} 人</span>
          </label>
          <label
            v-for="user in filteredCandidates"
            :key="userIdOf(user)"
            class="resource-member-candidate"
          >
            <el-checkbox
              :model-value="selectedCandidateIds.includes(userIdOf(user))"
              @change="(checked) => toggleCandidate(userIdOf(user), checked)"
            />
            <span class="resource-member-user__avatar">{{ userNameOf(user).slice(0, 1) }}</span>
            <span class="resource-member-candidate__identity">
              <strong>{{ userNameOf(user) }}</strong>
              <small>{{ userIdOf(user) }}</small>
            </span>
          </label>
          <div
            v-if="!candidateLoading && !filteredCandidates.length"
            class="resource-members__empty"
          >
            <el-icon><UserFilled /></el-icon>
            <strong>暂无可添加用户</strong>
          </div>
        </div>
      </div>

      <template #footer>
        <el-button :disabled="allocating" @click="addDialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="allocating"
          :disabled="!selectedCandidateIds.length"
          @click="addSelectedUsers"
        >
          添加{{ selectedCandidateIds.length ? ` (${selectedCandidateIds.length})` : '' }}
        </el-button>
      </template>
    </el-dialog>
  </el-dialog>
</template>
