import type { Uuid } from './api'

/** 资源创建人/更新人的展示信息,来源是后端用户内存缓存。 */
export interface Actor {
  createdBy: string
  createdByLabel: string
  updatedBy: string
  updatedByLabel: string
}

export interface User {
  id: Uuid
  userId: string
  nickname: string
  nickName?: string
  name?: string
  username?: string
  email?: string
  phone?: string
  tenantId?: Uuid
  orgId?: Uuid
  avatarUrl?: string
  departmentName?: string
  organizationName?: string
  roles?: Array<{ resourceType: string; resourceId?: Uuid; roleType: string }>
}
