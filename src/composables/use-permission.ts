import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import type { PermissionCode } from '@/constants/permission'

/**
 * 权限判断 composable。
 *
 * 本期未接入后端授权列表,所有判断默认返回 false,等 `useAuthStore` 接入
 * 实际授权数据后这里直接基于扁平 permission 集合判定。
 */
export function usePermission() {
  const auth = useAuthStore()

  const granted = computed<Set<PermissionCode>>(() => new Set())

  function has(permission: PermissionCode): boolean {
    void auth
    return granted.value.has(permission)
  }

  function hasAll(perms: PermissionCode[]): boolean {
    return perms.every(has)
  }

  function hasAny(perms: PermissionCode[]): boolean {
    return perms.some(has)
  }

  return { has, hasAll, hasAny }
}
