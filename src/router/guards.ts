import type { Router } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useMasterKeyStore } from '@/stores/master-key'

/**
 * 路由守卫依次校验登录状态和系统主密钥状态
 * 业务路由只有在主密钥明确就绪后才允许渲染
 */
export function installGuards(router: Router): void {
  router.beforeEach(async (to) => {
    const auth = useAuthStore()
    const requiresAuth = to.matched.some((r) => r.meta.requiresAuth === true)
    const requiresMasterKey = to.matched.some((r) => r.meta.requiresMasterKey === true)

    if (to.name === 'Login' && auth.isAuthenticated) {
      return { name: 'OrganizationList' }
    }

    if (requiresAuth && !auth.isAuthenticated) {
      return { name: 'Login', query: { redirect: to.fullPath } }
    }

    if (requiresMasterKey && auth.isAuthenticated) {
      const masterKey = useMasterKeyStore()
      try {
        const status = masterKey.status ?? (await masterKey.fetchStatus(true))
        if (!status.ready) {
          return { name: 'MasterKeySetup', query: { redirect: to.fullPath } }
        }
      } catch {
        // 状态未知时失败关闭，由主密钥页面展示查询错误和重试入口
        return { name: 'MasterKeySetup', query: { redirect: to.fullPath } }
      }
    }

    return true
  })

  router.afterEach((to) => {
    const title = (to.meta?.title as string | undefined) ?? ''
    document.title = title ? `${title} · EnvVault` : 'EnvVault'
  })
}
