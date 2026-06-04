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
 */
export const useFolderStore = defineStore('folder', () => {
  const items = ref<Folder[]>([])
  const total = ref(0)
  const loading = ref(false)
  const context = ref<FolderContext | null>(null)
  const lastQuery = ref<PageRequest>({ pageNum: 1, pageSize: 20 })

  async function fetchList(req: ListFoldersRequest): Promise<PageResp<Folder>> {
    loading.value = true
    if ('environmentId' in req && req.environmentId) {
      context.value = { level: 1, parent: req.environmentId }
    } else if ('folderParentId' in req && req.folderParentId) {
      context.value = { level: 2, parent: req.folderParentId }
    }
    const merged = { pageNum: req.pageNum ?? 1, pageSize: req.pageSize ?? 20, ...req }
    lastQuery.value = merged
    try {
      const resp = await withAuthError(() => listFolders(merged))
      items.value = resp.list
      total.value = resp.total
      return resp
    } finally {
      loading.value = false
    }
  }

  async function create(req: CreateFolderRequest): Promise<Folder> {
    const created = await withAuthError(() => createFolder(req))
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
    return created
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
