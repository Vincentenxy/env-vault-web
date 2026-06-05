/**
 * 与后端统一响应 `code` 字段对齐的业务错误码常量表。
 *
 * **前端处理策略(简化)**:
 *  - `code: 0` → 业务成功,直接拿 `data`。
 *  - `code !== 0` → 业务失败,统一抛 `ApiError`,展示后端下发的 `msg`。
 *  - 前端**不**基于具体错误码做差异化 UI(跳登录 / 跳 403 / 提示级联等),
 *    所有非 0 码都走"展示 msg"这一条路径。
 *
 * 下表保留所有已知错误码,作为"与后端契约的参考"。后续如果有业务码需要
 * 特殊处理(例如 1401 跳登录),在拦截器或 store 层针对性判断即可,**不要
 * 把差异化逻辑散落到 view**。
 */
export const ErrorCode = {
  /** 业务成功 */
  Success: 0,
  /** 业务通用失败(未明确分类的所有失败都先用这个码) */
  GenericError: -1,
  /** 请求参数错误(后端用于字段级校验) */
  BadRequest: 1002,
  /** 鉴权失效(token 过期 / 未登录) */
  Unauthorized: 1401,
  /** 权限不足 */
  Forbidden: 1403,
  /** 资源不存在 */
  NotFound: 1404,
  /** 操作冲突(例如有活跃子资源时删除) */
  Conflict: 1409,
  /** 后端内部错误 */
  Internal: 1500,
  /** 服务暂不可用 */
  ServiceUnavailable: 1503,
} as const

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode]
