<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useUserStore, type UserOption } from '@/stores/user'

const props = withDefaults(
  defineProps<{
    modelValue: string
    disabled?: boolean
  }>(),
  { disabled: false },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const auth = useAuthStore()
const userStore = useUserStore()
const selectedValue = computed({
  get: () => props.modelValue,
  set: (value: string) => emit('update:modelValue', value),
})

const options = computed<UserOption[]>(() => {
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

function loadUsers(visible = true): void {
  if (!visible) return
  void userStore.ensureLoaded().catch(() => undefined)
}

onMounted(loadUsers)
</script>

<template>
  <el-select
    v-model="selectedValue"
    class="manager-select"
    filterable
    clearable
    :disabled="disabled"
    :loading="userStore.loading"
    loading-text="正在加载用户"
    :no-data-text="userStore.loadFailed ? '用户列表加载失败' : '暂无用户'"
    placeholder="请选择管理员"
    @visible-change="loadUsers"
  >
    <el-option v-for="user in options" :key="user.id" :label="user.name" :value="user.id">
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
