/**
 * Token 存储抽象。
 *
 * 设计目的:打破 `http.ts`(读 token)与 `useAuthStore`(写 token)之间的循环引用。
 * http 拦截器只依赖此处的 getter,不依赖 store。
 *
 * 实际持久化由 useAuthStore 通过 localStorage 完成,本模块只保存"运行时最新值"。
 */

let currentToken = ''

export const tokenStore = {
  get(): string {
    return currentToken
  },
  set(next: string): void {
    currentToken = next
  },
  clear(): void {
    currentToken = ''
  },
}
