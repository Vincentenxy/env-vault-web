import { useRbacStore } from '@/stores/rbac'
import type { PermissionCode } from '@/constants/permission'

/**
 * 权限判断 composable。
 *
 * 数据来源:`useRbacStore`。
 * 当前 scope 默认为 global,业务页通过 `rbacStore.setCurrentScope({...})` 切换。
 *
 * 设计要点:
 *  - `has()` 在「当前 scope」之外再叠加查 global 缓存,解决绑在 global
 *    的账号(典型 platform_admin)切到 project/org scope 时按钮误判的
 *    场景。后端 cascade 的事它在请求时自己合并,前端只负责把这两个
 *    缓存的并集暴露给 UI。
 *  - 全部走内存读 cache,**不触发任何网络请求**。之前在 has() 里
 *    fire-and-forget 拉 global 的实现会导致渲染期间反复调用
 *    /api/v1/rbac/me/permissions,已彻底移除。
 *  - 真正的写操作仍以后端 RBAC 校验为准,前端只是 UI 防御。
 */
export function usePermission() {
  const rbac = useRbacStore()

  function has(permission: PermissionCode): boolean {
    // 1) 当前 scope(最常见路径,store 切到哪个 scope 就是哪份 Set)
    if (rbac.granted.has(permission)) return true
    // 2) 回退到 global 缓存 —— 仅当 platform_admin / global 授权用户
    //    切到子 scope 时,不会因为子 scope 的 Set 里没显式列该权限而误判
    const g = rbac.cache.get('__global__')
    if (g?.has(permission)) return true
    return false
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
