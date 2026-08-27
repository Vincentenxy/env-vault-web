import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios'
import { ApiError } from '@/types/api'
import { ErrorCode } from '@/constants/error-code'
import { AUTH_TOKEN_STORAGE_KEY, tokenStore } from '@/utils/token'
import { notify } from '@/utils/notify'
import { storage } from '@/utils/storage'
import { buildMasterKeyLocation, isMasterKeyRoute } from '@/utils/master-key-route'

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
 *  - `code: -2` → 系统主密钥未就绪,保留当前地址并跳转主密钥页面
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
 * 当前策略:后端 `msg` 已经可读,直接透传;只有 `msg` 为空时给个兜底
 * 系统启动和认证跳转在提示函数外集中处理,普通业务页面不按错误码分流
 */
function friendlyMessage(err: ApiError): string {
  if (err.message) return err.message
  return '请求失败,请稍后重试'
}

function notifyApiError(err: ApiError): void {
  notify.error(friendlyMessage(err))
}

let redirectingToLogin = false
let redirectingToMasterKey = false

function isUnauthorized(err: ApiError): boolean {
  return err.httpStatus === 401 || err.code === 401 || err.code === ErrorCode.Unauthorized
}

function isSystemStarting(err: ApiError): boolean {
  return err.code === ErrorCode.SystemStarting
}

/** 系统未就绪时保留当前地址并进入受认证的主密钥页面 */
function redirectToMasterKey(): void {
  if (
    typeof window === 'undefined' ||
    redirectingToMasterKey ||
    isMasterKeyRoute(window.location.pathname)
  ) {
    return
  }

  redirectingToMasterKey = true
  const currentLocation = `${window.location.pathname}${window.location.search}${window.location.hash}`
  window.location.replace(buildMasterKeyLocation(currentLocation))
}

function redirectToLogin(): void {
  if (
    typeof window === 'undefined' ||
    redirectingToLogin ||
    window.location.pathname === '/login'
  ) {
    return
  }
  redirectingToLogin = true
  tokenStore.clear()
  storage.remove(AUTH_TOKEN_STORAGE_KEY)
  const redirect = `${window.location.pathname}${window.location.search}${window.location.hash}`
  window.location.replace(`/login?redirect=${encodeURIComponent(redirect)}`)
}

function handleApiError(err: ApiError, silent = false): void {
  // 启动状态由独立页面处理，不展示会在跳转后立即消失的错误提示
  if (isSystemStarting(err)) {
    redirectToMasterKey()
    return
  }

  // silent 只控制提示,认证失效仍必须清理 token 并返回登录页
  if (!silent) notifyApiError(err)
  if (isUnauthorized(err)) redirectToLogin()
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
      handleApiError(err, response.config.silent)
      throw err
    }

    if (data.code === ErrorCode.Success) {
      return normalizePageList(data.data)
    }

    // 非零业务码统一包装为 ApiError,特殊跳转由 handleApiError 集中处理
    const err = new ApiError({
      code: data.code,
      httpStatus: response.status,
      msg: data.msg || '请求失败',
      requestId,
    })
    handleApiError(err, response.config.silent)
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
    handleApiError(err, error?.config?.silent)
    throw err
  },
)

/** 类型友好的 request wrapper。`responseType` 默认 JSON。 */
export function request<T>(config: AxiosRequestConfig): Promise<T> {
  return http.request<unknown, T>(config)
}
