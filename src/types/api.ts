/**
 * API 层公共类型:统一响应、分页、错误。
 */

export type Uuid = string

/**
 * 后端统一响应结构;拦截器在 HTTP 2xx 路径上剥到 `data.data`,业务只见到 `data`。
 * `code === 0` 表示业务成功,其他值都视为业务失败(由 `constants/error-code.ts` 集中收集)。
 */
export interface ApiResponse<T> {
  code: number
  msg: string
  data: T
}

export interface PageRequest {
  pageNum?: number
  pageSize?: number
}

export interface PageResp<T> {
  pageNum: number
  total: number
  /**
   * 分页数据。后端约定 `total: 0` 时下发 `[]`,但历史上某些路径会下发 `null`。
   * 拦截器在成功路径上会把 `list: null` 归一为 `list: []`,业务代码不再需要
   * `?? []` 兜底;`list` 在 store / view 看来一定是非空数组。
   */
  list: T[]
  pageSize: number
}

/**
 * 业务错误。HTTP 2xx + `code !== 0`、或 HTTP 4xx/5xx + envelope 时,由响应拦截器
 * 抛出此对象。`message` 通常直接来自后端 `msg`(已对用户可读)。
 *
 * 调用方可用 `instanceof ApiError` + `code` 区分处理 —— 但前端**当前不做
 * 基于具体码的差异化 UI**,所有非 0 码都走"展示 msg"这一条路径。
 */
export class ApiError extends Error {
  readonly code: number
  readonly httpStatus: number
  readonly requestId?: string

  constructor(opts: { code: number; httpStatus: number; msg: string; requestId?: string }) {
    super(opts.msg)
    this.name = 'ApiError'
    this.code = opts.code
    this.httpStatus = opts.httpStatus
    this.requestId = opts.requestId
  }
}
