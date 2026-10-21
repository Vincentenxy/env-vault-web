import { isPlatformEmbedded } from '@/utils/platform'
import { withAppBase } from '@/utils/app-base-path'

/** 公开的认证入口配置，不包含 Cookie、Token 或验签密钥 */
interface AuthConfig {
  mode: 'local' | 'company'
  loginUrl: string
  returnUrlParam: string
  loginLabel: string
  logoutUrl: string
  logoutReturnUrlParam: string
}

const redirectStorageKey = 'envvault.auth.loginRedirectAt'
const redirectCooldown = 30_000

function defaults(): AuthConfig {
  return {
    mode: import.meta.env.VITE_AUTH_MODE || (isPlatformEmbedded ? 'company' : 'local'),
    loginUrl: import.meta.env.VITE_COMPANY_LOGIN_URL?.trim() || '/tologin.do',
    returnUrlParam: import.meta.env.VITE_COMPANY_RETURN_URL_PARAM ?? 'url',
    loginLabel: '统一认证',
    logoutUrl: '',
    logoutReturnUrlParam: 'url',
  }
}

let config: Readonly<AuthConfig> = Object.freeze(defaults())
// 运行时配置在创建 Store 和安装路由守卫之前加载，认证模式在本次页面生命周期内不再变化
export let isCompanyAuth = config.mode === 'company'

export function getAuthConfig(): Readonly<AuthConfig> {
  return config
}

/** 只允许 HTTP(S) 入口，避免无效配置导致脚本执行或登录页自循环 */
function checkEntry(value: string): void {
  const target = new URL(value, window.location.origin)
  if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) {
    throw new Error('认证入口必须为 HTTP(S) 地址且不能包含凭据')
  }
  if (target.origin === window.location.origin && target.pathname === withAppBase('/login')) {
    throw new Error('统一认证入口不能指向 Env Vault 本地登录页')
  }
}

function resolveConfig(value: unknown): Readonly<AuthConfig> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('认证配置必须为 JSON 对象')
  }
  const result = defaults()
  for (const [key, item] of Object.entries(value)) {
    if (
      !Object.prototype.hasOwnProperty.call(result, key) ||
      typeof item !== 'string' ||
      /[\r\n]/.test(item)
    ) {
      throw new Error(`认证配置字段无效: ${key}`)
    }
    Object.assign(result, { [key]: item.trim() })
  }
  if (!['local', 'company'].includes(result.mode) || !result.loginLabel) {
    throw new Error('认证模式或名称无效')
  }
  if (!result.loginUrl) throw new Error('统一认证入口不能为空')
  checkEntry(result.loginUrl)
  if (result.logoutUrl) checkEntry(result.logoutUrl)
  return Object.freeze(result)
}

/** ConfigMap 可覆盖公开配置，同一个前端镜像可以接入不同的认证入口 */
export async function loadAuthConfig(): Promise<void> {
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), 10_000)
  try {
    const response = await fetch(withAppBase('/auth-config.json'), {
      cache: 'no-store',
      credentials: 'same-origin',
      redirect: 'error',
      signal: abort.signal,
    })
    if (!response.ok && response.status !== 404) throw new Error('认证配置加载失败')
    const next = resolveConfig(response.status === 404 ? {} : await response.json())
    config = next
    isCompanyAuth = next.mode === 'company'
  } finally {
    clearTimeout(timer)
  }
}

function currentLocation(): Location {
  return isPlatformEmbedded ? window.parent.location : window.location
}

function entryUrl(entry: string, returnUrlParam: string, returnPath?: string): string {
  const current = currentLocation()
  const target = new URL(entry, current.origin)
  const returnUrl = new URL(
    !isPlatformEmbedded && returnPath ? returnPath : current.href,
    current.origin,
  )
  // 返回地址只允许本站业务页面，登录服务本身可以是可信配置中的外部域名
  if (returnUrlParam) {
    target.searchParams.set(
      returnUrlParam,
      returnUrl.origin === current.origin ? returnUrl.href : current.href,
    )
  }
  return target.href
}

/** 参数名可为 url、redirect、service 等，空字符串表示不需要返回参数 */
export function getCompanyLoginUrl(returnPath?: string): string {
  return entryUrl(config.loginUrl, config.returnUrlParam, returnPath)
}

/** 登录后仍返回 401 时暂停自动跳转，避免公钥或网关配置错误造成无限循环 */
export function redirectToCompanyLogin(returnPath?: string, automatic = false): boolean {
  try {
    const previous = Number(sessionStorage.getItem(redirectStorageKey))
    const elapsed = Date.now() - previous
    if (automatic && previous > 0 && elapsed >= 0 && elapsed < redirectCooldown) return false
    sessionStorage.setItem(redirectStorageKey, String(Date.now()))
  } catch {
    // 禁用浏览器存储时仍允许正常登录，不将存储可用性作为认证条件
  }
  currentLocation().assign(getCompanyLoginUrl(returnPath))
  return true
}

export function clearCompanyLoginRedirect(): void {
  try {
    sessionStorage.removeItem(redirectStorageKey)
  } catch {
    // 浏览器可能禁用会话存储
  }
}

/** 配置统一退出入口时退出平台会话，否则只退出当前应用 */
export function redirectToCompanyLogout(): boolean {
  if (!isCompanyAuth || !config.logoutUrl) return false
  currentLocation().assign(
    entryUrl(config.logoutUrl, config.logoutReturnUrlParam, withAppBase('/login')),
  )
  return true
}
