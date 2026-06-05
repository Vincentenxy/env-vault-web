import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { getMyPermissions } from '@/api/rbac'
import { withApiCall } from '@/composables/use-api-call'
import type { Scope } from '@/types/rbac'
import { scopeKey } from '@/types/rbac'
import type { PermissionCode } from '@/constants/permission'

/**
 * RBAC store —— 唯一负责权限数据的地方。
 *
 * 设计要点:
 *  - 权限是 scope 绑定的:同一用户在 global / org-A / project-B 下权限可能不同。
 *  - 按 (scopeType, scopeId) 做 key 缓存,避免每次操作都打后端。
 *  - 默认当前 scope = global,登录后立刻拉一遍。
 *  - 业务页面在选定 org/project/env 后,调用 setCurrentScope() 切换 + 确保加载。
 *  - hasInScope(code, scope) 支持临时判断(不切换当前 scope,只在 cache 里查)。
 *
 * usePermission 读 granted(当前 scope 集合);hasAll / hasAny 是其上的辅助。
 */
export const useRbacStore = defineStore('rbac', () => {
  /** scope -> Set<PermissionCode> */
  const cache = ref<Map<string, Set<string>>>(new Map())
  const currentScope = ref<Scope>({ scopeType: 'global' })
  const loading = ref(false)
  /** 每个 scope 是否有 in-flight 请求,避免并发重复拉 */
  const inflight = ref<Map<string, Promise<Set<string>>>>(new Map())

  /** 当前 scope 对应的权限集合(空 Set 表示未加载或无权限) */
  const granted = computed<Set<string>>(() => {
    return cache.value.get(scopeKey(currentScope.value)) ?? new Set<string>()
  })

  /**
   * 把指定 scope 的权限从后端拉下来写入 cache。
   * 同一 scope 并发去重。
   */
  async function fetchMyPermissions(scope: Scope): Promise<Set<string>> {
    const key = scopeKey(scope)
    const hit = cache.value.get(key)
    if (hit) return hit
    const ongoing = inflight.value.get(key)
    if (ongoing) return ongoing

    const task = withApiCall(() => getMyPermissions(scope))
      .then((codes) => {
        const set = new Set(codes)
        cache.value.set(key, set)
        // 触发响应式更新
        cache.value = new Map(cache.value)
        return set
      })
      .finally(() => {
        inflight.value.delete(key)
        inflight.value = new Map(inflight.value)
      })
    inflight.value.set(key, task)
    return task
  }

  /**
   * 切换当前 scope 并确保权限已加载(异步)。
   * 业务页通常这样用:
   *   watch(selectedEnvId, (id) => {
   *     if (id) rbacStore.setCurrentScope({ scopeType: 'environment', scopeId: id })
   *   })
   */
  async function setCurrentScope(scope: Scope): Promise<void> {
    if (scopeKey(scope) === scopeKey(currentScope.value)) return
    currentScope.value = scope
    if (!cache.value.has(scopeKey(scope))) {
      loading.value = true
      try {
        await fetchMyPermissions(scope)
      } finally {
        loading.value = false
      }
    }
  }

  /**
   * 不切换当前 scope,只在 cache 里查指定 scope 是否拥有某权限。
   * cache miss 时会触发一次后端请求,通常用于路由级 / 弹窗级检查。
   */
  async function hasInScope(code: PermissionCode, scope: Scope): Promise<boolean> {
    let set = cache.value.get(scopeKey(scope))
    if (!set) set = await fetchMyPermissions(scope)
    return set.has(code)
  }

  /** 退出登录或权限变更时全清 */
  function clear(): void {
    cache.value = new Map()
    inflight.value = new Map()
    currentScope.value = { scopeType: 'global' }
  }

  return {
    cache,
    currentScope,
    granted,
    loading,
    fetchMyPermissions,
    setCurrentScope,
    hasInScope,
    clear,
  }
})
