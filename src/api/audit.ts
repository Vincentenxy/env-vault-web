import type { PageRequest, PageResp } from '@/types/api'
import type { AuditRecord, AuditResult } from '@/types/audit'
import { http } from './http'

export interface ListAuditRecordsRequest extends PageRequest {
  resourceType: string
  resourceId: string
  actionCode?: string
  resultCode?: AuditResult
}

/** 按一个逻辑资源分页查询不可变操作日志。 */
export function listAuditRecords(req: ListAuditRecordsRequest): Promise<PageResp<AuditRecord>> {
  return http.post('/audit/list', req)
}

export interface ListGlobalAuditRequest extends PageRequest {
  resourceType?: string
  resourceId?: string
  actionCode?: string
  resultCode?: AuditResult
  /** 被查询的操作人 ID；当前调用者的身份始终由后端认证上下文获取。 */
  createBy?: string
  startAt?: string
  endAt?: string
  batchId?: string
  correlationId?: string
  traceId?: string
}

export function listGlobalAuditRecords(
  req: ListGlobalAuditRequest,
  signal?: AbortSignal,
): Promise<Pick<PageResp<AuditRecord>, 'total' | 'list'>> {
  return http.post('/audit/global/list', req, { signal, silent: true })
}
