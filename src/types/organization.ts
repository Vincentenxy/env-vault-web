import type { Actor } from './user'
import type { Uuid } from './api'

export interface Organization extends Actor {
  id: Uuid
  tenantId?: Uuid
  code: string
  name: string
  comment: string
  remark?: string
  managerId?: Uuid
  projectCount?: number
  memberCount?: number
  admin?: string
  createdAt: string
  updatedAt: string
}
