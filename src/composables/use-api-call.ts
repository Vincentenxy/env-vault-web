import { ApiError } from '@/types/api'
import { useAuthStore } from '@/stores/auth'
import { router } from '@/router'

/**
 * 把 store 内的 API 调用包一层,统一处理 1401(token 失效):
 *  - 清空 token / currentUser
 *  - 跳到 /login 并把当前路径作为 redirect
 *  - 然后把原始错误继续抛给调用方
 *
 * 其它错误码(code 1403 / 1404 / 1409 / -1)原样抛出,由 store / view 自行决定。
 */
export async function withAuthError<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    if (e instanceof ApiError && e.code === 1401) {
      const auth = useAuthStore()
      auth.logout()
      const current = router.currentRoute.value
      if (current.name !== 'Login') {
        await router.replace({ name: 'Login', query: { redirect: current.fullPath } })
      }
    }
    throw e
  }
}
