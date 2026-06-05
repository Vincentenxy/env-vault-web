import axios, { type AxiosInstance, type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios'
import { ApiError } from '@/types/api'
import { ErrorCode } from '@/constants/error-code'
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
 *  - 应用内所有 HTTP 响应体都是 `{code, msg, data}` envelope,与 HTTP 状态码无关
 *  - `code: 0` → 业务成功,剥到 `data.data` 后返回
 *  - `code: 其他` → 业务失败,抛 `ApiError`(code/msg/httpStatus/requestId)
 *  - 非 envelope(网络 / nginx 5xx / 网关错误等中间件层错误)→ 统一兜底为 `ApiError`(code: GenericError)
 *  - 成功响应的非数组型 `data.list = null` 会被归一为 `[]`,store / view 不必再 `?? []`
 *  - 请求配置里带 `silent: true` 时跳过 toast(给静默失败场景用)
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

/**
 * 把分页响应的 `list: null` 归一为 `list: []`,避免下游 `.map()` 抛 TypeError。
 * 仅识别"形如 PageResp 的对象"(同时含 list 字段),其它形状不碰。
 */
function normalizePageList(data: any): any {
  if (data && typeof data === 'object' && 'list' in data) {
    if (data.list === null || data.list === undefined) {
      data.list = []
    }
  }
  return data
}

/**
 * 把后端 `msg` 转成对用户友好的文案。
 *
 * 当前策略:后端 `msg` 已经可读,直接透传;只有 `msg` 为空时给个兜底。
 * 之前按错误码做的差异化映射已移除(前端不再基于具体码做 UI 分流)。
 */
function friendlyMessage(err: ApiError): string {
  if (err.message) return err.message
  return '请求失败,请稍后重试'
}

function notifyApiError(err: ApiError): void {
  notify.error(friendlyMessage(err))
}

http.interceptors.response.use(
  (response) => {
    const data = response.data
    const requestId = response.headers['x-request-id'] as string | undefined

    if (!isEnvelope(data)) {
      // 2xx 但非 envelope:协议异常,统一兜底
      const err = new ApiError({
        code: ErrorCode.GenericError,
        httpStatus: response.status,
        msg: '服务器返回了非预期格式',
        requestId,
      })
      if (!response.config.silent) notifyApiError(err)
      throw err
    }

    if (data.code === ErrorCode.Success) {
      return normalizePageList(data.data)
    }

    // 业务失败:code !== 0 统一抛 ApiError,展示后端 msg
    const err = new ApiError({
      code: data.code,
      httpStatus: response.status,
      msg: data.msg || '请求失败',
      requestId,
    })
    if (!response.config.silent) notifyApiError(err)
    throw err
  },
  (error) => {
    const response = error?.response
    const requestId = response?.headers?.['x-request-id'] as string | undefined
    const httpStatus = response?.status ?? 0
    const data = response?.data

    let err: ApiError
    if (isEnvelope(data)) {
      // 应用内 4xx/5xx 也带 envelope:走业务失败流程
      err = new ApiError({
        code: data.code,
        httpStatus,
        msg: data.msg || '请求失败',
        requestId,
      })
    } else {
      // 真正的传输层错误(网络断开 / nginx 5xx / CORS / timeout 等)
      err = new ApiError({
        code: ErrorCode.GenericError,
        httpStatus,
        msg: error?.message || '网络异常,请稍后重试',
        requestId,
      })
    }
    if (!error?.config?.silent) notifyApiError(err)
    throw err
  },
)

/** 类型友好的 request wrapper。`responseType` 默认 JSON。 */
export function request<T>(config: AxiosRequestConfig): Promise<T> {
  return http.request<unknown, T>(config)
}
