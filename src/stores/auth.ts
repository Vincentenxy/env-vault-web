import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { User } from '@/types/user'
import { ApiError } from '@/types/api'
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
 *  - login(token) 把 token 写持久化 + tokenStore + 调 /me 验证并 setCurrentUser
 *  - 启动时如果有 token,后台静默 refreshMe,失败不报错(只是未登录)
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

  /**
   * 使用 Bearer token 登录:写入持久化 + 调 /me 验证。
   * 失败抛 ApiError,由调用方决定 UI。
   * 成功后顺手把 rbac 切到 global scope 拉一次权限。
   */
  async function login(rawToken: string): Promise<User> {
    setToken(rawToken)
    try {
      const me = await getMe()
      setCurrentUser(me)
      // 拉一次 global 权限;失败不阻断登录(只是按钮 disabled)
      const rbac = useRbacStore()
      await rbac.fetchMyPermissions({ scopeType: 'global' }).catch(() => undefined)
      return me
    } catch (e) {
      if (e instanceof ApiError && e.code === 1401) {
        clearToken()
      }
      throw e
    }
  }

  /** 静默刷新当前用户。失败不抛:
   *  - 1401:清空 token(已失效,避免后续请求持续 1401)
   *  - 其它:只清空 currentUser(网络/服务异常,token 仍可能是好的)
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
    } catch (e) {
      if (e instanceof ApiError && e.code === 1401) {
        clearToken()
      }
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
