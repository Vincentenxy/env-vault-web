import type { Uuid } from './api'

/** 资源创建人/更新人的展示信息,来源是后端用户内存缓存。 */
export interface Actor {
  createdBy: string
  createdByLabel: string
  updatedBy: string
  updatedByLabel: string
}

export interface User {
  userId: string
  name: string
  email?: string
  roles?: Array<{ resourceType: string; resourceId?: Uuid; roleType: string }>
}
