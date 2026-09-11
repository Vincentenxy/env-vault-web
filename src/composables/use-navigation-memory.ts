import { onBeforeUnmount, watchEffect } from 'vue'

type NavigationValue = string | number | string[]
type NavigationState = Record<string, NavigationValue>
const prefix = 'env-vault:navigation:v1:'
let generation = 0

// 只保存页面声明的导航字段，不接收资源对象或密钥内容
function normalize<T extends NavigationState>(value: unknown, defaults: T): T {
  const source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  return Object.fromEntries(
    Object.entries(defaults).map(([key, fallback]) => {
      const candidate = source[key]
      const valid = Array.isArray(fallback)
        ? Array.isArray(candidate) && candidate.every((item) => typeof item === 'string')
        : typeof fallback === 'number'
          ? typeof candidate === 'number' && Number.isSafeInteger(candidate) && candidate > 0
          : typeof candidate === 'string'
      return [key, valid ? candidate : fallback]
    }),
  ) as T
}

// 会话结束后清理当前位置，同时阻止尚未卸载的页面重新写入旧账号的记忆
export function clearNavigationMemory(): void {
  generation += 1
  try {
    Object.keys(sessionStorage)
      .filter((key) => key.startsWith(prefix))
      .forEach((key) => {
        sessionStorage.removeItem(key)
      })
  } catch {
    // 浏览器禁用存储时仍允许退出登录
  }
}

/** 记住当前标签页的导航位置，页面在异步恢复期间返回 null 可避免覆盖原位置 */
export function useNavigationMemory<T extends NavigationState>(scope: string, defaults: T) {
  const key = `${prefix}${scope}`
  const currentGeneration = generation
  let saved = normalize(null, defaults)
  try {
    saved = normalize(JSON.parse(sessionStorage.getItem(key) ?? 'null'), defaults)
  } catch {
    // 损坏或不可用的浏览器存储回退到页面默认位置
  }

  function track(read: () => T | null): void {
    const persist = () => {
      const state = read()
      if (!state || currentGeneration !== generation) return
      try {
        sessionStorage.setItem(key, JSON.stringify(normalize(state, defaults)))
      } catch {
        // 存储不可用不影响页面查询和导航
      }
    }
    watchEffect(persist, { flush: 'post' })
    // 刷新前同步保存，覆盖同一事件内尚未执行的 Vue watch
    window.addEventListener('beforeunload', persist)
    onBeforeUnmount(() => window.removeEventListener('beforeunload', persist))
  }

  return { saved, track }
}
