import { ElMessage, type MessageOptions } from 'element-plus'

/**
 * 全局消息提示工具。
 *
 * 统一封装 Element Plus 的 ElMessage,集中管理 duration / offset / grouping 等行为,
 * 避免在业务代码里到处散落 `ElMessage({ ... })`。
 *
 * 注意:本工具只负责"展示",不负责"业务错误码映射";后者放在 `api/http.ts` 的拦截器里。
 */
type NotifyType = 'success' | 'warning' | 'info' | 'error'

const DEFAULT_DURATION = 3000
const DEFAULT_OFFSET = 60

function show(type: NotifyType, message: string, options?: MessageOptions): void {
  ElMessage({
    type,
    message,
    duration: DEFAULT_DURATION,
    offset: DEFAULT_OFFSET,
    showClose: true,
    // 短时间内同一消息合并,避免连续失败时 toast 堆叠
    grouping: true,
    ...options,
  })
}

export const notify = {
  success(message: string, options?: MessageOptions): void {
    show('success', message, options)
  },
  warning(message: string, options?: MessageOptions): void {
    show('warning', message, options)
  },
  info(message: string, options?: MessageOptions): void {
    show('info', message, options)
  },
  error(message: string, options?: MessageOptions): void {
    show('error', message, options)
  },
}
