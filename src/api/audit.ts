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
