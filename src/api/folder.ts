import type { AxiosRequestConfig } from 'axios'
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

export function listFolders(
  req: ListFoldersRequest,
  config?: AxiosRequestConfig,
): Promise<PageResp<Folder>> {
  return http.post('/folder/list', req, config)
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
export function createFolder(
  req: CreateFolderRequest,
  config?: AxiosRequestConfig,
): Promise<Folder> {
  return http.post('/folder/create', req, config)
}

/**
 * POST /api/v1/folder/update
 *  - id/code 二选一;按 code 更新时必须同时传 parentId(env id)
 *  - name 必填
 *  - code 创建后不可改,前端不传
 */
export interface UpdateFolderRequest {
  id?: Uuid
  code?: string
  parentId?: Uuid
  name: string
  comment?: string
}
export function updateFolder(
  req: UpdateFolderRequest,
  config?: AxiosRequestConfig,
): Promise<Folder> {
  return http.post('/folder/update', req, config)
}

/**
 * POST /api/v1/folder/delete
 * 软删 folder **及其下所有 secret**,单事务。
 *  - id/code 二选一;按 code 删除时必须同时传 parentId(env id)
 */
export interface DeleteFolderRequest {
  id?: Uuid
  code?: string
  parentId?: Uuid
}
export function deleteFolder(
  req: DeleteFolderRequest,
  config?: AxiosRequestConfig,
): Promise<{ deleted: boolean }> {
  return http.post('/folder/delete', req, config)
}
