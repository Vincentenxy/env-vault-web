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

/**
 * `/folder/listByProject` 返回的树节点。
 *
 * 跟 `Folder` 区别:
 *  - 不带 environmentId / parentId / level(从树结构上就能推断,后端省略)
 *  - `envList` 是 `FolderEnvBinding[]`,每条带 env 专属 `folderId`
 *  - `subFolders` 字段是单层 L2 children(空数组表示无 L2)
 *
 * 设计目的:前端一次拿全项目下所有 folder,渲染为"env 列为勾选"扁平表;
 * 不再需要按 env 多次请求 + 客户端拼树。
 */
export interface FolderNode {
  id: Uuid
  code: string
  name: string
  comment: string
  /** 该 folder 挂载到的 env 列表(每条带 env 专属 folderId) */
  envList: FolderEnvBinding[]
  /** L2 children;L2 节点本身不再有 subFolders */
  subFolders: FolderNode[]
}

/** FolderNode.envList 的元素 —— 描述"该 folder 在某个 env 下的真实 id"。 */
export interface FolderEnvBinding {
  /** env id */
  id: Uuid
  /** env code(例 dev / test / prod) */
  code: string
  /**
   * 该 folder 在该 env 下的真实 folderId。
   * 写入 secret 时必须用它,不能用 FolderNode.id —— 同一逻辑 folder
   * 在 dev / test / prod 下可能各有自己的 folderId。
   */
  folderId: Uuid
}
