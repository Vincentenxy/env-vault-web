import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Environment } from '@/types/env'
import type { PageRequest, PageResp, Uuid } from '@/types/api'
import {
  listEnvironments,
  createEnvironment,
  getEnvironment,
  type ListEnvironmentsRequest,
  type CreateEnvironmentRequest,
  type EnvironmentLookup,
} from '@/api/env'
import { withApiCall } from '@/composables/use-api-call'

/**
 * 环境 store。
 * 列表按 projectId 分桶,避免切 project 时再次请求。
 * - items: 当前 projectId 对应的 page 视图
 * - total / loading: 当前 projectId 的状态
 */
export const useEnvStore = defineStore('env', () => {
  const items = ref<Environment[]>([])
  const total = ref(0)
  const loading = ref(false)
  const currentProjectId = ref<Uuid | ''>('')
  const lastQuery = ref<PageRequest>({ pageNum: 1, pageSize: 20 })

  async function fetchList(req: ListEnvironmentsRequest): Promise<PageResp<Environment>> {
    loading.value = true
    currentProjectId.value = req.projectId
    const merged = { pageNum: req.pageNum ?? 1, pageSize: req.pageSize ?? 20, ...req }
    lastQuery.value = merged
    try {
      const resp = await withApiCall(() => listEnvironments(merged))
      // 业务上 total>0 才有数据;list 为 null 时兜底为 []
      items.value = (resp.total > 0 ? resp.list : null) ?? []
      total.value = resp.total
      return resp
    } finally {
      loading.value = false
    }
  }

  async function create(req: CreateEnvironmentRequest): Promise<Environment> {
    const created = await withApiCall(() => createEnvironment(req))
    // 命中当前 project 时刷新第一页
    if (currentProjectId.value === req.parentId) {
      await fetchList({
        projectId: req.parentId,
        pageNum: 1,
        pageSize: lastQuery.value.pageSize ?? 20,
      })
    }
    return created
  }

  /**
   * 按 id 或 code 拉单个 env。
   * 不写入 items(避免 list 分页态污染)。
   */
  async function fetchOne(req: EnvironmentLookup): Promise<Environment> {
    return withApiCall(() => getEnvironment(req))
  }

  function clear(): void {
    items.value = []
    total.value = 0
    currentProjectId.value = ''
  }

  return {
    items,
    total,
    loading,
    currentProjectId,
    lastQuery,
    fetchList,
    create,
    fetchOne,
    clear,
  }
})
