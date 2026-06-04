import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Environment } from '@/types/env'
import type { PageRequest, PageResp, Uuid } from '@/types/api'
import {
  listEnvironments,
  createEnvironment,
  getEnvironment,
  updateEnvironment,
  deleteEnvironment,
  type ListEnvironmentsRequest,
  type CreateEnvironmentRequest,
  type EnvironmentLookup,
  type UpdateEnvironmentRequest,
  type DeleteEnvironmentRequest,
  type DeleteEnvironmentResponse,
} from '@/api/env'
import { withAuthError } from '@/composables/use-api-call'

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
      const resp = await withAuthError(() => listEnvironments(merged))
      items.value = resp.list
      total.value = resp.total
      return resp
    } finally {
      loading.value = false
    }
  }

  async function create(req: CreateEnvironmentRequest): Promise<Environment> {
    const created = await withAuthError(() => createEnvironment(req))
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
    return withAuthError(() => getEnvironment(req))
  }

  /**
   * 更新 env 后,若命中当前 page 视图则就地替换;未命中则仅返回 updated。
   */
  async function update(req: UpdateEnvironmentRequest): Promise<Environment> {
    const updated = await withAuthError(() => updateEnvironment(req))
    const idx = items.value.findIndex((e) => e.id === updated.id)
    if (idx >= 0) items.value[idx] = updated
    return updated
  }

  /**
   * 删除 env。
   * - 后端默认 force=false:有 active child folder/secret 时返回 409
   * - 后端 force=true:级联软删 folder→secret,需 env:force_delete 权限
   */
  async function remove(req: DeleteEnvironmentRequest): Promise<DeleteEnvironmentResponse> {
    const result = await withAuthError(() => deleteEnvironment(req))
    const targetId = 'id' in req && req.id ? req.id : null
    const before = items.value.length
    items.value = items.value.filter((e) => (targetId ? e.id !== targetId : true))
    if (items.value.length < before) {
      total.value = Math.max(0, total.value - 1)
    }
    return result
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
    update,
    remove,
    clear,
  }
})
