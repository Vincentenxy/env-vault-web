import type { AxiosRequestConfig } from 'axios'
import type { Folder, FolderNode, FolderLevel } from '@/types/folder'
import type { PageRequest, PageResp, Uuid } from '@/types/api'
import { http } from './http'

/**
 * POST /api/v1/folder/list
 * 查询范围二选一:
 *  - projectId:列出项目下的一级 folder
 *  - parentFolderId:列出 groups folder 下的二级 folder(只查单层)
 */
export type ListFoldersRequest = PageRequest & {
  code?: string | null
  name?: string | null
} & (
    | {
        projectId: Uuid
        parentFolderId?: never
      }
    | {
        parentFolderId: Uuid
        projectId?: never
      }
  )

export function listFolders(
  req: ListFoldersRequest,
  config?: AxiosRequestConfig,
): Promise<PageResp<Folder>> {
  return http.post('/folder/list', req, config)
}

export interface ListProjectFolderTreeRequest {
  projectId: Uuid
}
export interface FolderListByProjectData {
  folderList: FolderNode[]
}

function toFolderNode(folder: Folder, subFolders: FolderNode[] = []): FolderNode {
  const raw = folder as Folder & Record<string, unknown>
  const folderGroupId = [raw.groupId, raw.group_id, raw.folderGroupId, raw.folder_group_id].find(
    (value): value is string => typeof value === 'string' && value.length > 0,
  )
  return {
    id: folder.id,
    folderGroupId: folderGroupId ?? '',
    code: folder.code,
    name: folder.name,
    comment: folder.comment,
    envList: [],
    subFolders,
  }
}

/** 使用最新 `/folder/list` 组合项目目录树。 */
export async function listProjectFolderTree(
  req: ListProjectFolderTreeRequest,
  config?: AxiosRequestConfig,
): Promise<FolderListByProjectData> {
  const roots = await listFolders({ projectId: req.projectId, pageNum: 1, pageSize: 200 }, config)
  const folderList = await Promise.all(
    (roots.list ?? []).map(async (folder) => {
      const raw = folder as Folder & Record<string, unknown>
      const type = typeof raw.type === 'string' ? raw.type.toLowerCase() : ''
      const hasChildren = folder.code.toLowerCase() === 'groups' || type === 'groups'
      if (!hasChildren) return toFolderNode(folder)
      const children = await listFolders(
        { parentFolderId: folder.id, pageNum: 1, pageSize: 200 },
        config,
      )
      return toFolderNode(
        folder,
        (children.list ?? []).map((child) => toFolderNode(child)),
      )
    }),
  )
  return { folderList }
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
  managerId: Uuid
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
 * POST /api/v1/folder/create
 * 秘钥中心创建配置目录使用的请求格式;groups 子目录携带 parentFolderId。
 * type 由秘钥中心创建文件夹弹框选择:common 表示通用配置,customer 表示用户配置。
 */
export interface CreateSecretFolderRequest {
  projectId: Uuid
  code: string
  name: string
  managerId: Uuid
  remark?: string
  type: 'common' | 'customer'
  parentFolderId?: Uuid
}

export function createSecretFolder(
  req: CreateSecretFolderRequest,
  config?: AxiosRequestConfig,
): Promise<Folder> {
  return http.post('/folder/create', req, config)
}

/** POST /api/v1/folder/update，按逻辑分组统一更新各环境下的配置目录。 */
export interface UpdateFolderRequest {
  groupId: Uuid
  name: string
  remark: string
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
