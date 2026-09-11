import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { User } from '@/types/user'
import { AUTH_TOKEN_STORAGE_KEY, tokenStore } from '@/utils/token'
import { storage } from '@/utils/storage'
import { getMe } from '@/api/me'
import { useRbacStore } from '@/stores/rbac'
import { useUserStore } from '@/stores/user'
import { localLogin, type LocalLoginRequest } from '@/api/auth'
import { clearNavigationMemory } from '@/composables/use-navigation-memory'

const STORAGE_KEY = AUTH_TOKEN_STORAGE_KEY

/**
 * 认证 store。**唯一**能直接读写 token 持久化的地方。
 *
 * 流程:
 *  - 应用启动时 useAuthStore() 读 localStorage 拿回 token,塞到 tokenStore,提供 isAuthenticated
 *  - login(credentials) 调用本地认证接口并保存后端签发的短期 JWT
 *  - 启动时如果有 token,后台静默 /auth/me 拉用户信息
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
    clearNavigationMemory()
    token.value = ''
    tokenStore.clear()
    storage.remove(STORAGE_KEY)
  }

  function setCurrentUser(user: User | null): void {
    currentUser.value = user
  }

  /** 使用本地用户名密码登录；用户资料在系统 Ready 后读取 */
  async function login(credentials: LocalLoginRequest): Promise<void> {
    const result = await localLogin(credentials)
    clearNavigationMemory()
    setToken(result.accessToken)
    setCurrentUser(null)
    useRbacStore().clear()
    useUserStore().clear()
  }

  /** 静默刷新当前用户；启动期通过 silent 抑制重复错误提示 */
  async function refreshMe(): Promise<void> {
    if (!token.value) return
    try {
      const me = await getMe({ silent: true })
      setCurrentUser(me)
    } catch {
      setCurrentUser(null)
    }
  }

  function logout(): void {
    clearToken()
    setCurrentUser(null)
    // 顺手清掉 RBAC 缓存,避免换账号后看到旧权限
    useRbacStore().clear()
    useUserStore().clear()
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
