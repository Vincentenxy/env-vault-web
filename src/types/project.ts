import type { Actor } from './user'
import type { Uuid } from './api'

export interface Project extends Actor {
  id: Uuid
  orgId: Uuid
  code: string
  name: string
  comment: string
  remark?: string
  manager?: string
  managerId?: Uuid
  managerName?: string
  admin?: string
  folderCount?: number
  memberCount?: number
  createdAt: string
  updatedAt: string
}

/** 创建 project 时可选内联的环境列表。 */
export interface EnvSpec {
  code: string
  name: string
  remark?: string
  isCheckPerm?: boolean
}
