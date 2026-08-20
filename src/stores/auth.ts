import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { User } from '@/types/user'
import { tokenStore } from '@/utils/token'
import { storage } from '@/utils/storage'
import { getMe } from '@/api/me'
import { useRbacStore } from '@/stores/rbac'

const STORAGE_KEY = 'envvault.auth.token'

/**
 * 认证 store。**唯一**能直接读写 token 持久化的地方。
 *
 * 流程:
 *  - 应用启动时 useAuthStore() 读 localStorage 拿回 token,塞到 tokenStore,提供 isAuthenticated
 *  - login(token) 只把 token 写持久化 + tokenStore,不在前端预校验 JWT claims
 *  - 启动时如果有 token,后台静默 /me 拉用户信息;失败不清除用户提供的 token
 *  - logout 清空 token + tokenStore + currentUser
 */
export const useAuthStore = defineStore('auth', () => {
  const persistedToken = storage.get<string>(STORAGE_KEY, '')
  const token = ref<string>(persistedToken)
  const currentUser = ref<User | null>(null)

  // 同步到 http 拦截器使用的 tokenStore
  tokenStore.set(persistedToken)

  const isAuthenticated = computed(() => Boolean(token.value))
  const roles = computed(() => currentUser.value?.roles ?? [])

  function setToken(next: string): void {
    token.value = next
    tokenStore.set(next)
    storage.set(STORAGE_KEY, next)
  }

  function clearToken(): void {
    token.value = ''
    tokenStore.clear()
    storage.remove(STORAGE_KEY)
  }

  function setCurrentUser(user: User | null): void {
    currentUser.value = user
  }

  /** 保存 Bearer token。实际鉴权结果由后续业务请求的后端响应决定。 */
  async function login(rawToken: string): Promise<void> {
    setToken(rawToken)
    setCurrentUser(null)
    useRbacStore().clear()
  }

  /** 静默刷新当前用户。失败不抛且不清空 token:
   *  - token 由用户显式提供,前端不判断 claims 或签名是否有效。
   *  - `/me` 失败只表示拿不到用户资料,后续请求仍照常携带 Authorization。
   *  启动期刷新不希望弹错误 toast,通过 `silent: true` 抑制。
   *  顺手拉一次 global 权限,让 usePermission 启动即可用。
   */
  async function refreshMe(): Promise<void> {
    if (!token.value) return
    try {
      const me = await getMe({ silent: true })
      setCurrentUser(me)
      const rbac = useRbacStore()
      await rbac.fetchMyPermissions({ scopeType: 'global' }).catch(() => undefined)
    } catch {
      setCurrentUser(null)
    }
  }

  function logout(): void {
    clearToken()
    setCurrentUser(null)
    // 顺手清掉 RBAC 缓存,避免换账号后看到旧权限
    useRbacStore().clear()
  }

  return {
    token,
    currentUser,
    isAuthenticated,
    roles,
    setToken,
    clearToken,
    setCurrentUser,
    login,
    refreshMe,
    logout,
  }
})
