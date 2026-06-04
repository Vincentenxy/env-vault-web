import type { Actor } from './user'
import type { Uuid } from './api'

export interface Project extends Actor {
  id: Uuid
  orgId: Uuid
  code: string
  name: string
  comment: string
  createdAt: string
  updatedAt: string
}

/** 创建 project 时可选内联的环境列表。 */
export interface EnvSpec {
  code: string
  name: string
  comment?: string
}
