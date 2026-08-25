<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useUserStore, type UserOption } from '@/stores/user'

const props = withDefaults(
  defineProps<{
    modelValue: string
    disabled?: boolean
    tenantId?: string
    orgId?: string
    projectId?: string
    selectedName?: string
  }>(),
  { disabled: false, tenantId: '', orgId: '', projectId: '', selectedName: '' },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const auth = useAuthStore()
const userStore = useUserStore()
const scopedUsers = ref<UserOption[]>([])
const scopedLoading = ref(false)
const scopedLoadFailed = ref(false)
let scopedRequestSequence = 0
const selectedValue = computed({
  get: () => props.modelValue,
  set: (value: string) => emit('update:modelValue', value),
})
const scopeKey = computed(() =>
  props.projectId
    ? `project:${props.projectId}`
    : props.orgId
      ? `org:${props.orgId}`
      : props.tenantId
        ? `tenant:${props.tenantId}`
        : '',
)

const options = computed<UserOption[]>(() => {
  if (scopeKey.value) {
    const users = new Map(scopedUsers.value.map((user) => [user.id, user]))
    if (props.modelValue && !users.has(props.modelValue)) {
      users.set(props.modelValue, {
        id: props.modelValue,
        name: props.selectedName || props.modelValue,
      })
    }
    return [...users.values()]
  }

  const users = new Map(userStore.items.map((user) => [user.id, user]))
  const current = auth.currentUser
  if (current?.userId) {
    const listedUser = users.get(current.userId)
    users.set(current.userId, {
      id: current.userId,
      name:
        listedUser?.name || current.nickname || current.nickName || current.name || current.userId,
      email: listedUser?.email || current.email,
    })
  }
  return [...users.values()]
})

const loading = computed(() => (scopeKey.value ? scopedLoading.value : userStore.loading))
const loadFailed = computed(() => (scopeKey.value ? scopedLoadFailed.value : userStore.loadFailed))

async function loadScopedUsers(key: string): Promise<void> {
  const requestSequence = ++scopedRequestSequence
  scopedLoading.value = true
  scopedLoadFailed.value = false
  try {
    const [type, resourceId] = key.split(':')
    if (!resourceId) return
    const users = await userStore.fetchByScope(
      type === 'project'
        ? { projectId: resourceId }
        : type === 'org'
          ? { orgId: resourceId }
          : { tenantId: resourceId },
    )
    if (requestSequence !== scopedRequestSequence || key !== scopeKey.value) return
    scopedUsers.value = users
  } catch {
    if (requestSequence !== scopedRequestSequence || key !== scopeKey.value) return
    scopedUsers.value = []
    scopedLoadFailed.value = true
  } finally {
    if (requestSequence === scopedRequestSequence) scopedLoading.value = false
  }
}

function loadUsers(visible = true): void {
  if (!visible) return
  if (scopeKey.value) {
    void loadScopedUsers(scopeKey.value)
    return
  }
  void userStore.ensureLoaded().catch(() => undefined)
}

onMounted(loadUsers)

watch(scopeKey, (key) => {
  scopedRequestSequence += 1
  scopedUsers.value = []
  scopedLoadFailed.value = false
  if (key) void loadScopedUsers(key)
})
</script>

<template>
  <el-select
    v-model="selectedValue"
    class="manager-select"
    filterable
    clearable
    :disabled="disabled"
    :loading="loading"
    loading-text="正在加载用户"
    :no-data-text="loadFailed ? '用户列表加载失败' : '暂无用户'"
    placeholder="请选择管理员"
    @visible-change="loadUsers"
  >
    <el-option
      v-for="user in options"
      :key="user.id"
      :label="user.name"
      :value="user.id"
      :disabled="user.disabled"
    >
      <span class="manager-select__option-name">{{ user.name }}</span>
      <span class="manager-select__option-meta">{{ user.email || user.id }}</span>
    </el-option>
  </el-select>
</template>

<style lang="scss" scoped>
.manager-select {
  width: 100%;

  &__option-name {
    color: var(--v-text-primary);
  }

  &__option-meta {
    float: right;
    max-width: 55%;
    overflow: hidden;
    color: var(--v-text-tertiary);
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
</style>
