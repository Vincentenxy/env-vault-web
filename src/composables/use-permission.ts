import { useRbacStore } from '@/stores/rbac'
import type { PermissionCode } from '@/constants/permission'

/**
 * 权限判断 composable。
 *
 * 数据来源:`useRbacStore`。
 * 当前 scope 默认为 global,业务页通过 `rbacStore.setCurrentScope({...})` 切换。
 *
 * 失败安全:store 未初始化(刚刷新页面、还没拉到权限)时,`granted` 是空 Set,
 * 所有 `has()` 返回 false —— 表现为按钮 disabled,与"没权限"一致,不会越权放行。
 */
export function usePermission() {
  const rbac = useRbacStore()

  function has(permission: PermissionCode): boolean {
    return rbac.granted.has(permission)
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
