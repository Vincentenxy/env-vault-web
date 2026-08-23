import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { Scope } from '@/types/rbac'
import type { PermissionCode } from '@/constants/permission'

/**
 * 仅保留页面 scope 状态。最新 Apifox 未提供 RBAC 查询接口,
 * 因此前端不发权限请求,最终授权由业务接口的 401/403 响应决定。
 */
export const useRbacStore = defineStore('rbac', () => {
  const currentScope = ref<Scope>({ scopeType: 'global' })
  const loading = ref(false)
  const cache = ref<Map<string, Set<string>>>(new Map())
  const granted = computed<Set<string>>(() => new Set())

  async function fetchMyPermissions(_scope: Scope): Promise<Set<string>> {
    return new Set()
  }

  async function setCurrentScope(scope: Scope): Promise<void> {
    currentScope.value = scope
  }

  async function hasInScope(_code: PermissionCode, _scope: Scope): Promise<boolean> {
    return true
  }

  function clear(): void {
    currentScope.value = { scopeType: 'global' }
    cache.value = new Map()
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
