import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Project } from '@/types/project'
import type { PageRequest, PageResp, Uuid } from '@/types/api'
import {
  listProjects,
  createProject,
  getProject,
  type ListProjectsRequest,
  type CreateProjectRequest,
  type ProjectLookup,
} from '@/api/project'
import { withApiCall } from '@/composables/use-api-call'

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
      const resp = await withApiCall(() => listProjects(merged))
      // 业务上 total>0 才有数据;list 为 null 时兜底为 []
      items.value = (resp.total > 0 ? resp.list : null) ?? []
      total.value = resp.total
      return resp
    } finally {
      loading.value = false
    }
  }

  async function create(req: CreateProjectRequest): Promise<Project> {
    const created = await withApiCall(() => createProject(req))
    // 若创建到当前列表所属 org,刷新第一页
    if (currentOrgId.value === req.orgId) {
      await fetchList({
        orgId: req.orgId,
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
    return withApiCall(() => getProject(req))
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
  }
})
