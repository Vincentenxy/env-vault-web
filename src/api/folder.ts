import type { AxiosRequestConfig } from 'axios'
import type { Folder, FolderNode, FolderLevel } from '@/types/folder'
import type { PageRequest, PageResp, Uuid } from '@/types/api'
import { http } from './http'

/**
 * POST /api/v1/folder/list
 * environmentId 与 folderParentId 二选一:
 *  - environmentId: 列 env 下的 level=1 folder
 *    - includeSubfolders=true 时,响应每条 L1 携带 subfolders 数组(L2,单层)
 *    - includeSubfolders=false(或省略)时,响应只含 L1,subfolders 为 []
 *  - folderParentId: 列该 folder 下的 level=2 folder(只查单层)
 */
export type ListFoldersRequest = PageRequest &
  (
    | {
        environmentId: Uuid
        folderParentId?: never
        includeSubfolders?: boolean
      }
    | { environmentId?: never; folderParentId: Uuid }
  )

export function listFolders(
  req: ListFoldersRequest,
  config?: AxiosRequestConfig,
): Promise<PageResp<Folder>> {
  return http.post('/folder/list', req, config)
}

/**
 * POST /api/v1/folder/listByProject
 * 一次拉取整个 project 下的 folder 树(L1 + L2 + 每个节点的 envList)。
 *
 * 适用于:项目详情页的"目录列表"区,扁平表 + 每行带 env 勾选列。
 * 不再需要按 env 多次拉。
 */
export interface ListFoldersByProjectRequest {
  projectId: Uuid
  /**
   * 是否在响应中携带 L1 的 L2 children。
   * 默认 true(本接口存在的意义就是一次拿全);
   * 显式传 false 时,后端 subFolders 始终返回 [],客户端可按需补拉。
   */
  includeSubfolders?: boolean
}
export interface FolderListByProjectData {
  folderList: FolderNode[]
}
export function listFoldersByProject(
  req: ListFoldersByProjectRequest,
  config?: AxiosRequestConfig,
): Promise<FolderListByProjectData> {
  return http.post('/folder/listByProject', req, config)
}

/**
 * POST /api/v1/folder/create
 *
 * 一次性把同一个 folder 批量建到多个 env 下;level=2 时按 parentCode 在
 * 每个 env 里找对应的 L1 父节点挂载。
 *
 *  - level=1:不传 parentCode;folder 在 envList 每个 env 下直接创建为 L1。
 *  - level=2:必须传 parentCode(父 L1 folder 的 code);
 *             后端在 envList 每个 env 下找这个 code 的 L1,缺失则该 env 跳过(或返回错误,见后端实现)。
 *
 * 后端响应可以返回成功创建出来的 folder 列表(每个 env 一条),
 * 也可能只返回一个聚合结果 —— 视具体后端实现而定。
 */
export interface CreateFolderRequest {
  level: FolderLevel
  code: string
  name: string
  /** 至少 1 个 env id */
  envList: Uuid[]
  /** level=2 时必填:父 L1 folder 的 code */
  parentCode?: string
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
