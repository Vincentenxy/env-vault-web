/**
 * API 层公共类型:统一响应、分页、错误。
 */

export type Uuid = string

/** 后端统一响应结构;拦截器会把外层 `code/msg` 吃掉,业务只见到 `data`。 */
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
  list: T[]
  pageSize: number
}

/**
 * 业务错误。HTTP 2xx 但 code !== 0 时,由响应拦截器 reject 此对象。
 * 调用方可用 `instanceof ApiError` + `code` 区分处理。
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

export class NotFoundError extends ApiError {
  constructor(opts: { httpStatus: number; msg: string; requestId?: string }) {
    super({ code: 1404, ...opts })
    this.name = 'NotFoundError'
  }
}

export class ConflictError extends ApiError {
  constructor(opts: { httpStatus: number; msg: string; requestId?: string }) {
    super({ code: 1409, ...opts })
    this.name = 'ConflictError'
  }
}
