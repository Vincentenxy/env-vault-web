import type { Router } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

/**
 * 路由守卫:auth / title 两段。
 *  - auth:已登录访问 /login → 跳 organizations;反之命中 requiresAuth → 跳 login(带 redirect)
 *  - title:meta.title → document.title
 */
export function installGuards(router: Router): void {
  router.beforeEach((to) => {
    const auth = useAuthStore()
    const requiresAuth = to.matched.some((r) => r.meta.requiresAuth === true)

    if (to.name === 'Login' && auth.isAuthenticated) {
      return { name: 'OrganizationList' }
    }

    if (requiresAuth && !auth.isAuthenticated) {
      return { name: 'Login', query: { redirect: to.fullPath } }
    }

    return true
  })

  router.afterEach((to) => {
    const title = (to.meta?.title as string | undefined) ?? ''
    document.title = title ? `${title} · EnvVault` : 'EnvVault'
  })
}
