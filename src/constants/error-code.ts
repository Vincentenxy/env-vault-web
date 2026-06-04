/**
 * 与后端统一响应 `code` 字段对齐的业务错误码常量。
 *
 * 错误码定义见后端 README "错误响应" 一节。
 */
export const ErrorCode = {
  GenericError: -1,
  BadRequest: 1002,
  Unauthorized: 1401,
  Forbidden: 1403,
  NotFound: 1404,
  Conflict: 1409,
  Internal: 1500,
  ServiceUnavailable: 1503,
} as const

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode]
