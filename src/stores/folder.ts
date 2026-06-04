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
import { withAuthError } from '@/composables/use-api-call'

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
    if ('environmentId' in req && req.environmentId) {
      context.value = { level: 1, parent: req.environmentId }
      stampedLevel = 1
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
      const resp = await withAuthError(() => listFolders(merged))
      // 后端不返回 level,这里按上下文回填,保证视图层 f.level 过滤可用
      items.value = resp.list.map((f) => ({ ...f, level: stampedLevel }))
      total.value = resp.total
      return resp
    } finally {
      loading.value = false
    }
  }

  async function create(req: CreateFolderRequest): Promise<Folder> {
    const created = await withAuthError(() => createFolder(req))
    // 后端不返回 level,按请求参数回填
    const stamped: Folder = { ...created, level: req.level }
    // 创建到当前上下文时刷新第一页
    if (
      context.value &&
      context.value.level === req.level &&
      context.value.parent === req.parentId
    ) {
      const ctx = context.value
      const next: ListFoldersRequest =
        ctx.level === 1
          ? { environmentId: ctx.parent, pageNum: 1, pageSize: lastQuery.value.pageSize ?? 20 }
          : { folderParentId: ctx.parent, pageNum: 1, pageSize: lastQuery.value.pageSize ?? 20 }
      await fetchList(next)
    }
    return stamped
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
