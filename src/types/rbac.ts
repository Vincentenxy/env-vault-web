import type { Uuid } from './api'

export interface Role {
  roleType: string
  name: string
  comment?: string
  defaultPermissions: string[]
}

export interface RoleGrant {
  userId: string
  roleType: string
  resourceType: string
  resourceId?: Uuid
  expiresAt?: string
  grantedBy?: string
  grantedAt?: string
}
