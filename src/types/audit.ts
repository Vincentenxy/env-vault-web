import type { Uuid } from './api'

export type AuditResult = 'success' | 'failure'

export interface AuditChange {
  field: string
  before?: unknown
  after?: unknown
  changed?: boolean
  redacted: boolean
}

/** 不可变业务审计事件。Secret 明文和密文均不属于该结构。 */
export interface AuditRecord {
  id: Uuid
  eventSource: string
  entryType: string
  callerType: string
  callerName: string
  callerVersion: string
  operationName: string
  actionCode: string
  resultCode: AuditResult
  actorType: string
  resourceType: string
  resourceId: string
  resourceName: string
  scopeType: string
  scopeId: string
  batchId: Uuid | null
  changeDetail: AuditChange[]
  eventDetail: Record<string, unknown>
  failureCode: string
  failureReason: string
  correlationId: string
  protocolStatus: string
  createBy: string
  createByName: string
  createAt: string
}
