import type { Actor } from './user'
import type { Uuid } from './api'

/**
 * 环境实体。`projectId` 指向所属项目;与 core.yaml `Entity` 的 `parentId` 等价。
 */
export interface Environment extends Actor {
  id: Uuid
  projectId: Uuid
  code: string
  name: string
  comment: string
  createdAt: string
  updatedAt: string
}

/** org 层只读环境模板(name/comment 永远是首次创建时的快照)。 */
export interface EnvironmentTemplate extends Actor {
  id: Uuid
  orgId: Uuid
  code: string
  name: string
  comment: string
  createdAt: string
  updatedAt: string
}
