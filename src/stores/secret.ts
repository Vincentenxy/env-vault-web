import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { SecretMeta, SecretReveal } from '@/types/secret'
import type { PageRequest, PageResp, Uuid } from '@/types/api'
import {
  listSecrets,
  createSecret,
  revealSecret,
  type ListSecretsRequest,
  type CreateSecretRequest,
  type RevealSecretRequest,
} from '@/api/secret'
import { withAuthError } from '@/composables/use-api-call'

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
  const items = ref<SecretMeta[]>([])
  const total = ref(0)
  const loading = ref(false)
  const context = ref<SecretContext | null>(null)
  const lastQuery = ref<PageRequest>({ pageNum: 1, pageSize: 20 })

  async function fetchList(req: ListSecretsRequest): Promise<PageResp<SecretMeta>> {
    loading.value = true
    if ('environmentId' in req && req.environmentId) {
      context.value = { kind: 'env', parent: req.environmentId }
    } else if ('folderId' in req && req.folderId) {
      context.value = { kind: 'folder', parent: req.folderId }
    }
    const merged = { pageNum: req.pageNum ?? 1, pageSize: req.pageSize ?? 20, ...req }
    lastQuery.value = merged
    try {
      const resp = await withAuthError(() => listSecrets(merged))
      items.value = resp.list
      total.value = resp.total
      return resp
    } finally {
      loading.value = false
    }
  }

  async function create(req: CreateSecretRequest): Promise<SecretMeta> {
    const created = await withAuthError(() => createSecret(req))
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
    return withAuthError(() => revealSecret(req))
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
    clear,
  }
})
