import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Folder, FolderLevel } from '@/types/folder'
import type { PageRequest, PageResp, Uuid } from '@/types/api'
import {
  listFolders,
  createFolder,
  type ListFoldersRequest,
  type CreateFolderRequest,
} from '@/api/folder'
import { withApiCall } from '@/composables/use-api-call'

/**
 * 当前 folder 列表的"查询上下文":
 *  - level=1 时,parent 字段存的是 envId
 *  - level=2 时,parent 字段存的是 folderParentId
 */
interface FolderContext {
  level: FolderLevel
  parent: Uuid
}

/**
 * Folder store。
 * 列表按 (level, parent) 分桶。切 env 或切父 folder 时重新拉取。
 *
 * 重要:`level` 字段后端 Entity schema 不下发(后端只下发 id/parentId/code/name/...),
 * 客户端读 `level` 必须依赖这里的上下文回填。`fetchList` / `create` 会根据请求模式
 * 把 `level` 写回到 items 上,这样视图层 `f.level === 1` 的过滤才能正确工作。
 */
export const useFolderStore = defineStore('folder', () => {
  const items = ref<Folder[]>([])
  const total = ref(0)
  const loading = ref(false)
  const context = ref<FolderContext | null>(null)
  const lastQuery = ref<PageRequest>({ pageNum: 1, pageSize: 20 })

  async function fetchList(req: ListFoldersRequest): Promise<PageResp<Folder>> {
    loading.value = true
    let stampedLevel: FolderLevel
    let envId: Uuid | undefined
    if ('environmentId' in req && req.environmentId) {
      context.value = { level: 1, parent: req.environmentId }
      stampedLevel = 1
      envId = req.environmentId
    } else if ('folderParentId' in req && req.folderParentId) {
      context.value = { level: 2, parent: req.folderParentId }
      stampedLevel = 2
    } else {
      // 防御:理论上不会到这里
      stampedLevel = 1
    }
    const merged = { pageNum: req.pageNum ?? 1, pageSize: req.pageSize ?? 20, ...req }
    lastQuery.value = merged
    try {
      const resp = await withApiCall(() => listFolders(merged))
      // 业务上 total>0 才有数据;list 为 null 时兜底为 []
      // 后端不返回 level,这里按上下文回填,保证视图层 f.level 过滤可用
      items.value = ((resp.total > 0 ? resp.list : null) ?? []).map((f) => {
        // env 模式 + includeSubfolders=true → 后端在 L1 上挂了 subfolders
        // L2 子项缺 level/environmentId/subfolders,需要回填
        if (stampedLevel === 1 && envId !== undefined && f.subfolders) {
          return {
            ...f,
            level: 1 as const,
            subfolders: f.subfolders.map((c) => ({
              ...c,
              level: 2 as const,
              environmentId: envId,
              subfolders: undefined,
            })),
          }
        }
        return { ...f, level: stampedLevel }
      })
      total.value = resp.total
      return resp
    } finally {
      loading.value = false
    }
  }

  async function create(req: CreateFolderRequest): Promise<Folder> {
    // 新版 CreateFolderRequest 用 envList + parentCode,不再有单个 parentId,
    // 这里无法判断"是否落到了当前 context",不做自动刷新,调用方自己处理。
    // ProjectDetailView 已迁到直接调 createFolder,本方法保留为旧调用方的兜底。
    const created = await withApiCall(() => createFolder(req))
    // 后端不返回 level,按请求参数回填
    return { ...created, level: req.level }
  }

  function clear(): void {
    items.value = []
    total.value = 0
    context.value = null
  }

  return {
    items,
    total,
    loading,
    context,
    lastQuery,
    fetchList,
    create,
    clear,
  }
})
