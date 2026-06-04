import type { Folder, FolderLevel } from '@/types/folder'
import type { PageRequest, PageResp, Uuid } from '@/types/api'
import { http } from './http'

/**
 * POST /api/v1/folder/list
 * environmentId 与 folderParentId 二选一:
 *  - environmentId: 列 env 下的 level=1 folder
 *  - folderParentId: 列该 folder 下的 level=2 folder
 */
export type ListFoldersRequest = PageRequest &
  (
    | { environmentId: Uuid; folderParentId?: never }
    | { environmentId?: never; folderParentId: Uuid }
  )

export function listFolders(req: ListFoldersRequest): Promise<PageResp<Folder>> {
  return http.post('/folder/list', req)
}

/**
 * POST /api/v1/folder/create
 * - level=1: parentId 是 env id(folder 直接挂在 env 下)
 * - level=2: parentId 是 level=1 folder id(env 由父 folder 推断)
 */
export interface CreateFolderRequest {
  level: FolderLevel
  parentId: Uuid
  code: string
  name: string
  comment?: string
}
export function createFolder(req: CreateFolderRequest): Promise<Folder> {
  return http.post('/folder/create', req)
}
