import type { Uuid } from './api'

export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'reveal'
  | 'restore'
  | 'grant_role'
  | 'revoke_role'

export interface AuditRecord {
  id: Uuid
  actor: string
  resourceType: string
  resourceId: Uuid
  action: AuditAction
  /** Secret 写入时可记录密文;前端不感知明文。 */
  encryptedValue?: unknown
  createdAt: string
}
