import axios, { type AxiosInstance, type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios'
import { ApiError, ConflictError, NotFoundError } from '@/types/api'
import { tokenStore } from '@/utils/token'

/**
 * 全局唯一的 Axios 实例。
 *
 * 请求拦截:
 *  - 从 tokenStore 注入 Authorization
 *  - 自动补 x-request-id(UUID)
 *
 * 响应拦截:
 *  - 业务信封 {code, msg, data} 剥到 data
 *  - code !== 0 走错误码 → 抛出 ApiError 子类
 *  - HTTP 错误同样归一为 ApiError
 */

const baseURL = import.meta.env.VITE_API_BASE || '/api/v1'

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
    case 1404:
      return new NotFoundError(common)
    case 1409:
      return new ConflictError(common)
    default:
      return new ApiError(common)
  }
}

http.interceptors.response.use(
  (response) => {
    const data = response.data
    if (isEnvelope(data)) {
      if (data.code === 0) {
        return data.data
      }
      throw buildErrorFromEnvelope(data, response.status, response.headers['x-request-id'])
    }
    return data
  },
  (error) => {
    const data = error?.response?.data
    if (isEnvelope(data)) {
      throw buildErrorFromEnvelope(
        data,
        error.response.status,
        error.response.headers?.['x-request-id'],
      )
    }
    throw new ApiError({
      code: -1,
      httpStatus: error?.response?.status ?? 0,
      msg: error?.message ?? 'request failed',
      requestId: error?.response?.headers?.['x-request-id'],
    })
  },
)

/** 类型友好的 request wrapper。`responseType` 默认 JSON。 */
export function request<T>(config: AxiosRequestConfig): Promise<T> {
  return http.request<unknown, T>(config)
}
