import { defineStore } from 'pinia'
import { ref } from 'vue'
import { listUsers, type UserListItem } from '@/api/user'

export interface UserOption {
  id: string
  name: string
  email?: string
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function normalizeUser(user: UserListItem): UserOption | null {
  const id = firstString(user.userId, user.id, user.staffUserId, user.staffuserid)
  if (!id) return null
  return {
    id,
    name: firstString(user.name, user.userName, id),
    email: firstString(user.email) || undefined,
  }
}

export const useUserStore = defineStore('user', () => {
  const items = ref<UserOption[]>([])
  const loading = ref(false)
  const loaded = ref(false)
  const loadFailed = ref(false)
  let pending: Promise<void> | null = null

  async function fetchAll(): Promise<void> {
    loading.value = true
    loadFailed.value = false
    try {
      const pageSize = 200
      const normalized = new Map<string, UserOption>()
      let pageNum = 1
      let total = 0

      do {
        const response = await listUsers({ pageNum, pageSize })
        const pageItems = Array.isArray(response.list) ? response.list : []
        pageItems.forEach((item) => {
          const option = normalizeUser(item)
          if (option) normalized.set(option.id, option)
        })
        total = Number(response.total) || normalized.size
        if (!pageItems.length) break
        pageNum += 1
      } while (normalized.size < total)

      items.value = [...normalized.values()]
      loaded.value = true
    } catch (error) {
      items.value = []
      loaded.value = false
      loadFailed.value = true
      throw error
    } finally {
      loading.value = false
    }
  }

  function ensureLoaded(): Promise<void> {
    if (loaded.value) return Promise.resolve()
    if (pending) return pending
    pending = fetchAll().finally(() => {
      pending = null
    })
    return pending
  }

  function clear(): void {
    items.value = []
    loaded.value = false
    loadFailed.value = false
  }

  return { items, loading, loaded, loadFailed, fetchAll, ensureLoaded, clear }
})
