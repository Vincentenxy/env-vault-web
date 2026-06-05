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
  /**
   * 仅当 `folder/list` 请求带 `includeSubfolders: true` 时,
   * 后端在 L1 folder 上附带其下 L2 children(单层、不递归)。
   * L2 条目不带 `level` / `environmentId` / `subfolders` 字段,
   * 调用方需要自行回填才能直接用(参看 folderStore.fetchList)。
   */
  subfolders?: Folder[]
}
