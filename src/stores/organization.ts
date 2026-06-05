import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Organization } from '@/types/organization'
import type { PageRequest, PageResp } from '@/types/api'
import {
  listOrganizations,
  createOrganization,
  getOrganization,
  updateOrganization,
  deleteOrganization,
  type CreateOrganizationRequest,
  type OrganizationLookup,
  type UpdateOrganizationRequest,
  type DeleteOrganizationRequest,
  type DeleteOrganizationResponse,
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

  /**
   * 按 id 或 code 拉单个 org。
   * 不写入 items(避免 list 分页态污染);调用方按需 setCurrent。
   */
  async function fetchOne(req: OrganizationLookup): Promise<Organization> {
    return withApiCall(() => getOrganization(req))
  }

  /**
   * 更新 org 后,若命中当前 page 视图则就地替换;未命中则仅返回 updated,
   * 调用方按需走 fetchList 刷新。
   */
  async function update(req: UpdateOrganizationRequest): Promise<Organization> {
    const updated = await withApiCall(() => updateOrganization(req))
    const idx = items.value.findIndex((o) => o.id === updated.id)
    if (idx >= 0) items.value[idx] = updated
    return updated
  }

  /**
   * 删除 org。
   * - 后端默认 force=false:有 active child project 时返回 409,需 view 层提示重试
   * - 后端 force=true:级联软删 project→env→folder→secret,需 org:force_delete 权限
   * 本地 view 同步:仅在 items 中命中时移除并 total-1。
   */
  async function remove(req: DeleteOrganizationRequest): Promise<DeleteOrganizationResponse> {
    const result = await withApiCall(() => deleteOrganization(req))
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
    lastQuery,
    fetchList,
    fetchOne,
    create,
    update,
    remove,
  }
})
