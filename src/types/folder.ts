import type { Actor } from './user'
import type { Uuid } from './api'

/** Folder 暂只支持一级(level=1)与二级(level=2)。 */
export type FolderLevel = 1 | 2

export interface Folder extends Actor {
  id: Uuid
  environmentId: Uuid
  parentId: Uuid | null
  level: FolderLevel
  code: string
  name: string
  comment: string
  createdAt: string
  updatedAt: string
}
