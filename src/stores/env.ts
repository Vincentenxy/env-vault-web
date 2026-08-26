import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Environment } from '@/types/env'
import type { Uuid } from '@/types/api'
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
 * - items: 当前 projectId 对应的环境列表
 * - total / loading: 当前 projectId 的状态
 */
export const useEnvStore = defineStore('env', () => {
  const items = ref<Environment[]>([])
  const total = ref(0)
  const loading = ref(false)
  const currentProjectId = ref<Uuid | ''>('')

  async function fetchList(req: ListEnvironmentsRequest): Promise<Environment[]> {
    loading.value = true
    currentProjectId.value = req.projectId
    try {
      const environments = await withApiCall(() => listEnvironments(req))
      items.value = environments
      total.value = environments.length
      return environments
    } finally {
      loading.value = false
    }
  }

  async function create(req: CreateEnvironmentRequest): Promise<Environment[]> {
    const created = await withApiCall(() => createEnvironment(req))
    // 命中当前 project 时刷新第一页
    if (currentProjectId.value === req.projectId) {
      await fetchList({ projectId: req.projectId })
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
    fetchList,
    create,
    fetchOne,
    clear,
  }
})
