import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { SecretEntry, SecretGroup, SecretReveal } from '@/types/secret'
import type { PageRequest, PageResp, Uuid } from '@/types/api'
import {
  listSecrets,
  createSecret,
  revealSecret,
  updateSecret,
  batchCreateSecrets,
  type ListSecretsRequest,
  type CreateSecretRequest,
  type RevealSecretRequest,
  type UpdateSecretRequest,
  type BatchCreateSecretsRequest,
} from '@/api/secret'
import { withApiCall } from '@/composables/use-api-call'

/**
 * 当前 secret 列表的"查询上下文":
 *  - environmentId 非空:列 env 下所有 secret
 *  - folderId 非空:列该 folder 下的 secret
 */
type SecretContext = { kind: 'env'; parent: Uuid } | { kind: 'folder'; parent: Uuid }

/**
 * Secret store。
 * 列表按 (env | folder) 分桶。切 env 或切 folder 时重新拉取。
 */
export const useSecretStore = defineStore('secret', () => {
  const items = ref<SecretGroup[]>([])
  const total = ref(0)
  const loading = ref(false)
  const context = ref<SecretContext | null>(null)
  const lastQuery = ref<PageRequest>({ pageNum: 1, pageSize: 20 })

  async function fetchList(req: ListSecretsRequest): Promise<PageResp<SecretGroup>> {
    loading.value = true
    if ('environmentId' in req && req.environmentId) {
      context.value = { kind: 'env', parent: req.environmentId }
    } else if ('folderId' in req && req.folderId) {
      context.value = { kind: 'folder', parent: req.folderId }
    }
    const merged = { pageNum: req.pageNum ?? 1, pageSize: req.pageSize ?? 20, ...req }
    lastQuery.value = merged
    try {
      const resp = await withApiCall(() => listSecrets(merged))
      // 业务上 total>0 才有数据;list 为 null 时兜底为 []
      items.value = (resp.total > 0 ? resp.list : null) ?? []
      total.value = resp.total
      return resp
    } finally {
      loading.value = false
    }
  }

  async function create(req: CreateSecretRequest): Promise<SecretEntry> {
    const created = await withApiCall(() => createSecret(req))
    // 创建到当前上下文时刷新第一页
    if (context.value && context.value.kind === 'folder' && context.value.parent === req.folderId) {
      await fetchList({
        folderId: req.folderId,
        pageNum: 1,
        pageSize: lastQuery.value.pageSize ?? 20,
      })
    } else if (context.value && context.value.kind === 'env') {
      // env 视图下新建到任何 folder,都刷新一遍(后端会按 env 过滤)
      const ctx = context.value
      await fetchList({
        environmentId: ctx.parent,
        pageNum: 1,
        pageSize: lastQuery.value.pageSize ?? 20,
      })
    }
    return created
  }

  /**
   * 拉取单条 secret 的明文。需要 `secret:reveal` 权限。
   * 不写入 items(列表不带 value,避免泄露)。
   */
  async function fetchReveal(req: RevealSecretRequest): Promise<SecretReveal> {
    return withApiCall(() => revealSecret(req))
  }

  /**
   * 更新 secret。请求体里只携带真正需要变更的字段:
   *  - value 不传 → 服务端保持原 value
   *  - comment 始终可改(允许清空为 '')
   *  - key 不可改(API 层未暴露 key 字段)
   * 返回最新的 SecretEntry;不主动刷新 items(单条变更不至于需要全表重拉)。
   */
  async function update(req: UpdateSecretRequest): Promise<SecretEntry> {
    const updated = await withApiCall(() => updateSecret(req))
    return updated
  }

  /**
   * 批量创建 secret。后端会按 env 拆分,一条 secretList 项可以拆出多条 secret
   * (每个 env 一条)。响应是 data: null,成功时 store 仅返回 null。
   * 刷新策略:按当前 list 上下文(folder 或 env)拉第一页,本批的 folder 不一定和当前
   * 选中 folder 一致,所以不强行按 folderId 命中。
   */
  async function batchCreate(req: BatchCreateSecretsRequest): Promise<null> {
    await withApiCall(() => batchCreateSecrets(req))
    if (context.value) {
      if (context.value.kind === 'folder') {
        const ctx = context.value
        await fetchList({
          folderId: ctx.parent,
          pageNum: 1,
          pageSize: lastQuery.value.pageSize ?? 20,
        })
      } else if (context.value.kind === 'env') {
        const ctx = context.value
        await fetchList({
          environmentId: ctx.parent,
          pageNum: 1,
          pageSize: lastQuery.value.pageSize ?? 20,
        })
      }
    }
    return null
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
    fetchReveal,
    update,
    batchCreate,
    clear,
  }
})
