import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Organization } from '@/types/organization'
import type { PageRequest, PageResp } from '@/types/api'
import {
  listOrganizations,
  createOrganization,
  type CreateOrganizationRequest,
} from '@/api/organization'
import { withApiCall } from '@/composables/use-api-call'

/**
 * 组织 store。
 * 列表数据走远端分页,本地不缓存所有 org 列表(只缓存最近一次查询的 page 视图)。
 * 写操作完成后,触发 list 重新拉。
 */
export const useOrganizationStore = defineStore('organization', () => {
  const items = ref<Organization[]>([])
  const total = ref(0)
  const loading = ref(false)
  const lastQuery = ref<PageRequest>({ pageNum: 1, pageSize: 20 })

  async function fetchList(req: PageRequest = {}): Promise<PageResp<Organization>> {
    loading.value = true
    const merged = { pageNum: req.pageNum ?? 1, pageSize: req.pageSize ?? 20, ...req }
    lastQuery.value = merged
    try {
      const resp = await withApiCall(() => listOrganizations(merged))
      // 业务上 total>0 才有数据;list 为 null 时兜底为 []
      items.value = (resp.total > 0 ? resp.list : null) ?? []
      total.value = resp.total
      return resp
    } finally {
      loading.value = false
    }
  }

  async function create(req: CreateOrganizationRequest): Promise<Organization> {
    const created = await withApiCall(() => createOrganization(req))
    // 重新拉第一页,简单可靠
    await fetchList({ pageNum: 1, pageSize: lastQuery.value.pageSize ?? 20 })
    return created
  }

  return {
    items,
    total,
    loading,
    lastQuery,
    fetchList,
    create,
  }
})
