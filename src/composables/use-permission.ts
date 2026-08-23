import { useRbacStore } from '@/stores/rbac'
import type { PermissionCode } from '@/constants/permission'

/**
 * 权限判断 composable。
 *
 * 最新 Apifox 未提供 RBAC 查询接口,前端不再预拉权限。
 * 操作权限由业务接口的 HTTP 401/403 响应统一裁决。
 */
export function usePermission() {
  const rbac = useRbacStore()

  function has(_permission: PermissionCode): boolean {
    return true
  }

  function hasAll(perms: PermissionCode[]): boolean {
    if (perms.length === 0) return true
    return perms.every(has)
  }

  function hasAny(perms: PermissionCode[]): boolean {
    if (perms.length === 0) return true
    return perms.some(has)
  }

  return { has, hasAll, hasAny, rbac }
}
