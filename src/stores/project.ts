import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Project } from '@/types/project'
import type { PageRequest, PageResp, Uuid } from '@/types/api'
import {
  listProjects,
  createProject,
  getProject,
  updateProject,
  deleteProject,
  type ListProjectsRequest,
  type CreateProjectRequest,
  type ProjectLookup,
  type UpdateProjectRequest,
  type DeleteProjectRequest,
  type DeleteProjectResponse,
} from '@/api/project'
import { withAuthError } from '@/composables/use-api-call'

/**
 * 项目 store。
 * 列表按 orgId 分桶,避免切 org 时再次请求。
 * - items: 当前 orgId 对应的 page 视图
 * - total / loading: 当前 orgId 的状态
 */
export const useProjectStore = defineStore('project', () => {
  const items = ref<Project[]>([])
  const total = ref(0)
  const loading = ref(false)
  const currentOrgId = ref<Uuid | ''>('')
  const lastQuery = ref<PageRequest>({ pageNum: 1, pageSize: 20 })

  async function fetchList(req: ListProjectsRequest): Promise<PageResp<Project>> {
    loading.value = true
    currentOrgId.value = req.orgId as Uuid
    const merged = { pageNum: req.pageNum ?? 1, pageSize: req.pageSize ?? 20, ...req }
    lastQuery.value = merged
    try {
      const resp = await withAuthError(() => listProjects(merged))
      items.value = resp.list
      total.value = resp.total
      return resp
    } finally {
      loading.value = false
    }
  }

  async function create(req: CreateProjectRequest): Promise<Project> {
    const created = await withAuthError(() => createProject(req))
    // 若创建到当前列表所属 org,刷新第一页
    if (currentOrgId.value === req.parentId) {
      await fetchList({
        orgId: req.parentId,
        pageNum: 1,
        pageSize: lastQuery.value.pageSize ?? 20,
      })
    }
    return created
  }

  /**
   * 按 id 或 code 拉单个 project。
   * 不写入 items(避免 list 分页态污染);调用方按需 setCurrent。
   */
  async function fetchOne(req: ProjectLookup): Promise<Project> {
    return withAuthError(() => getProject(req))
  }

  /**
   * 更新 project 后,若命中当前 page 视图则就地替换;未命中则仅返回 updated。
   */
  async function update(req: UpdateProjectRequest): Promise<Project> {
    const updated = await withAuthError(() => updateProject(req))
    const idx = items.value.findIndex((o) => o.id === updated.id)
    if (idx >= 0) items.value[idx] = updated
    return updated
  }

  /**
   * 删除 project。
   * - 后端默认 force=false:有 active child env 时返回 409,需 view 层提示重试
   * - 后端 force=true:级联软删 env→folder→secret,需 project:force_delete 权限
   */
  async function remove(req: DeleteProjectRequest): Promise<DeleteProjectResponse> {
    const result = await withAuthError(() => deleteProject(req))
    const targetId = 'id' in req && req.id ? req.id : null
    const targetCode = 'code' in req && req.code ? req.code : null
    const before = items.value.length
    items.value = items.value.filter((o) => {
      if (targetId) return o.id !== targetId
      if (targetCode) return o.code !== targetCode
      return true
    })
    if (items.value.length < before) {
      total.value = Math.max(0, total.value - 1)
    }
    return result
  }

  return {
    items,
    total,
    loading,
    currentOrgId,
    lastQuery,
    fetchList,
    fetchOne,
    create,
    update,
    remove,
  }
})
