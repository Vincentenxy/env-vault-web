import axios, { type AxiosInstance, type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios'
import { ApiError, ConflictError, NotFoundError } from '@/types/api'
import { ErrorCode, type ErrorCodeValue } from '@/constants/error-code'
import { tokenStore } from '@/utils/token'
import { notify } from '@/utils/notify'

/**
 * 全局唯一的 Axios 实例。
 *
 * 请求拦截:
 *  - 从 tokenStore 注入 Authorization
 *  - 自动补 x-request-id(UUID)
 *
 * 响应拦截:
 *  - 业务信封 {code, msg, data} 剥到 data
 *  - code !== 0 走错误码 → 抛出 ApiError 子类,并通过 notify 提示用户
 *  - HTTP 错误同样归一为 ApiError 并提示
 *  - 请求配置里带 `silent: true` 时跳过提示(给静默失败场景用,例如启动期 refreshMe)
 */

const baseURL = import.meta.env.VITE_API_BASE || '/api/v1'

declare module 'axios' {
  export interface AxiosRequestConfig {
    /** true 时,响应拦截器不再弹错误 toast —— 调用方自己处理 */
    silent?: boolean
  }
}

export const http: AxiosInstance = axios.create({
  baseURL,
  timeout: 30_000,
  headers: {
    'Content-Type': 'application/json',
  },
})

http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const t = tokenStore.get()
  if (t) {
    config.headers.set('Authorization', `Bearer ${t}`)
  }
  if (!config.headers.has('x-request-id')) {
    config.headers.set('x-request-id', crypto.randomUUID())
  }
  return config
})

interface Envelope<T> {
  code: number
  msg: string
  data: T
}

function isEnvelope(value: unknown): value is Envelope<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    'msg' in value &&
    'data' in value
  )
}

function buildErrorFromEnvelope(
  envelope: Envelope<unknown>,
  httpStatus: number,
  requestId: string | undefined,
): ApiError {
  const common = { code: envelope.code, httpStatus, msg: envelope.msg, requestId }
  switch (envelope.code) {
    case ErrorCode.NotFound:
      return new NotFoundError(common)
    case ErrorCode.Conflict:
      return new ConflictError(common)
    default:
      return new ApiError(common)
  }
}

/**
 * 把业务错误码映射成对用户友好的中文提示。
 * 后端 `msg` 字段往往直接来自 Go 内部错误信息,不一定适合直接展示;
 * 这里只对常见码做兜底,其余情况优先用后端 msg。
 */
function friendlyMessage(err: ApiError): string {
  const map: Record<ErrorCodeValue, string> = {
    [ErrorCode.GenericError]: '请求失败,请稍后重试',
    [ErrorCode.BadRequest]: '请求参数有误',
    [ErrorCode.Unauthorized]: '登录已过期,请重新登录',
    [ErrorCode.Forbidden]: '没有访问权限',
    [ErrorCode.NotFound]: '资源不存在或已被删除',
    [ErrorCode.Conflict]: '操作冲突,请刷新后重试',
    [ErrorCode.Internal]: '服务异常,请稍后重试',
    [ErrorCode.ServiceUnavailable]: '服务暂不可用,请稍后重试',
  }
  return map[err.code as ErrorCodeValue] ?? err.message
}

function notifyApiError(err: ApiError): void {
  notify.error(friendlyMessage(err))
}

http.interceptors.response.use(
  (response) => {
    const data = response.data
    if (isEnvelope(data)) {
      if (data.code === 0) {
        return data.data
      }
      const err = buildErrorFromEnvelope(data, response.status, response.headers['x-request-id'])
      if (!response.config.silent) {
        notifyApiError(err)
      }
      throw err
    }
    return data
  },
  (error) => {
    const data = error?.response?.data
    const err = isEnvelope(data)
      ? buildErrorFromEnvelope(
          data,
          error.response.status,
          error.response.headers?.['x-request-id'],
        )
      : new ApiError({
          code: ErrorCode.GenericError,
          httpStatus: error?.response?.status ?? 0,
          msg: error?.message ?? 'request failed',
          requestId: error?.response?.headers?.['x-request-id'],
        })
    if (!error?.config?.silent) {
      notifyApiError(err)
    }
    throw err
  },
)

/** 类型友好的 request wrapper。`responseType` 默认 JSON。 */
export function request<T>(config: AxiosRequestConfig): Promise<T> {
  return http.request<unknown, T>(config)
}
