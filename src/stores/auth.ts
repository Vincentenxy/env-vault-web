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
import { clearCompanyLoginRedirect, isCompanyAuth } from '@/config/auth'
import { ApiError } from '@/types/api'
import { ErrorCode } from '@/constants/error-code'
import { getMasterKeyStatus } from '@/api/master-key'
import { useMasterKeyStore } from '@/stores/master-key'

const STORAGE_KEY = AUTH_TOKEN_STORAGE_KEY

/**
 * 认证状态统一管理本地 Token 和公司会话
 *
 * 流程:
 *  - 本地模式读取持久化 Token，登录后保存后端签发的短期 JWT
 *  - 公司模式忽略本地 Token，通过受认证的接口确认网关提供的身份
 *  - 主密钥未就绪时由启动状态接口完成认证，不将 -2 当成认证成功
 *  - logout 清理当前应用状态，公司 Cookie 由配置的统一退出入口处理
 */
export const useAuthStore = defineStore('auth', () => {
  // 公司模式不使用独立登录遗留的凭据
  const persistedToken = isCompanyAuth ? '' : storage.get<string>(STORAGE_KEY, '')
  const token = ref<string>(persistedToken)
  const currentUser = ref<User | null>(null)
  const checkingSession = ref(false)
  const sessionChecked = ref(false)
  const companyVerified = ref(false)
  const sessionUnauthorized = ref(false)
  const sessionError = ref('')
  let sessionPromise: Promise<void> | undefined

  // 同步到 http 拦截器使用的 tokenStore
  tokenStore.set(persistedToken)

  const isAuthenticated = computed(() =>
    isCompanyAuth ? companyVerified.value : Boolean(token.value),
  )
  const roles = computed(() => currentUser.value?.roles ?? [])
  const initializingSession = computed(() => checkingSession.value && !sessionChecked.value)

  function setToken(next: string): void {
    token.value = next
    tokenStore.set(next)
    if (!isCompanyAuth) storage.set(STORAGE_KEY, next)
  }

  function clearToken(): void {
    clearNavigationMemory()
    token.value = ''
    tokenStore.clear()
    if (!isCompanyAuth) storage.remove(STORAGE_KEY)
  }

  function setCurrentUser(user: User | null): void {
    currentUser.value = user
    if (isCompanyAuth) companyVerified.value = Boolean(user)
  }

  /** 进入受保护页面前确认网关提供的身份 */
  async function checkCompanySession(): Promise<void> {
    checkingSession.value = true
    sessionError.value = ''
    sessionUnauthorized.value = false
    try {
      try {
        setCurrentUser(await getMe({ silent: true, authProbe: true }))
      } catch (error) {
        if (!(error instanceof ApiError) || error.code !== ErrorCode.SystemStarting) throw error
        // 主密钥未就绪时 /auth/me 会在 JWT 校验之前被拦截
        // 启动状态接口仍校验 JWT 和用户锁定状态，可以用于确认身份
        const status = await getMasterKeyStatus({ silent: true, authProbe: true })
        useMasterKeyStore().status = status
        if (status.ready) setCurrentUser(await getMe({ silent: true, authProbe: true }))
        else companyVerified.value = true
      }
      clearCompanyLoginRedirect()
    } catch (error) {
      setCurrentUser(null)
      sessionUnauthorized.value =
        error instanceof ApiError &&
        (error.httpStatus === 401 || error.code === 401 || error.code === ErrorCode.Unauthorized)
      sessionError.value = error instanceof Error ? error.message : '身份验证失败，请重试'
    } finally {
      checkingSession.value = false
      sessionChecked.value = true
    }
  }

  function ensureCompanySession(force = false): Promise<void> {
    if (!isCompanyAuth) return Promise.resolve()
    if (sessionPromise) return sessionPromise
    if (sessionChecked.value && !force) return Promise.resolve()
    sessionPromise = checkCompanySession().finally(() => {
      sessionPromise = undefined
    })
    return sessionPromise
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
    if (isCompanyAuth) {
      await ensureCompanySession(true)
      return
    }
    if (!isAuthenticated.value) return
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
    sessionChecked.value = true
    sessionUnauthorized.value = false
    sessionError.value = ''
    useMasterKeyStore().status = null
    // 顺手清掉 RBAC 缓存,避免换账号后看到旧权限
    useRbacStore().clear()
    useUserStore().clear()
  }

  return {
    token,
    currentUser,
    checkingSession,
    initializingSession,
    sessionUnauthorized,
    sessionError,
    isAuthenticated,
    roles,
    setToken,
    clearToken,
    setCurrentUser,
    login,
    refreshMe,
    ensureCompanySession,
    logout,
  }
})
