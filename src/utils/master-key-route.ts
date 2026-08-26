/** 系统主密钥未就绪时使用的公开页面 */
export const MASTER_KEY_ROUTE_PATH = '/masterKey'

/** 判断当前浏览器路径是否已经位于主密钥页面 */
export function isMasterKeyRoute(pathname: string): boolean {
  return pathname === MASTER_KEY_ROUTE_PATH || pathname === `${MASTER_KEY_ROUTE_PATH}/`
}

/** 为启动状态跳转附带当前站内地址 */
export function buildMasterKeyLocation(currentLocation: string): string {
  return `${MASTER_KEY_ROUTE_PATH}?redirect=${encodeURIComponent(currentLocation)}`
}

/** 校验激活主密钥后允许返回的站内地址 */
export function resolveMasterKeyRedirect(value: unknown): string {
  const fallback = '/app/secrets'
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
    return fallback
  }

  try {
    const target = new URL(value, 'http://env-vault.local')
    if (target.origin !== 'http://env-vault.local' || isMasterKeyRoute(target.pathname)) {
      return fallback
    }
    return `${target.pathname}${target.search}${target.hash}`
  } catch {
    return fallback
  }
}
