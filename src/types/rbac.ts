import type { Uuid } from './api'

/* ============================================================
 * 权限域
 * ============================================================ */

/** rbac.yaml ScopeType */
export type ScopeType = 'global' | 'organization' | 'project' | 'environment' | 'folder'

/**
 * 任意 scope 的描述。`scopeType = 'global'` 时 `scopeId` 省略。
 * 对应后端 `ScopeRequest`。
 */
export interface Scope {
  scopeType: ScopeType
  scopeId?: Uuid
}

/** 把 scope 拍平成 cache key。global 直接用字符串 `'__global__'`。 */
export function scopeKey(s: Scope): string {
  return s.scopeType === 'global' ? '__global__' : `${s.scopeType}:${s.scopeId ?? ''}`
}

/* ============================================================
 * 权限 / 角色 / 绑定
 * ============================================================ */

/** rbac.yaml `Permission` —— 后端 `/rbac/permission/list` 返回 */
export interface PermissionDef {
  id?: Uuid
  code: string
  resourceType?: string
  action?: string
  description?: string
  isSystem?: boolean
}

/** rbac.yaml `Role` —— 后端 `/rbac/role/{list,info,create,update}` 返回 */
export interface Role {
  id?: Uuid
  code: string
  name: string
  description?: string
  scopeType: ScopeType
  orgId?: Uuid
  projectId?: Uuid
  isSystem?: boolean
  permissions: string[]
}

/** rbac.yaml `RoleUpsertRequest` */
export interface RoleUpsertRequest {
  scopeType: ScopeType
  scopeId?: Uuid
  code: string
  name: string
  description?: string
  permissions: string[]
}

/** rbac.yaml `User` —— `/rbac/user/list` */
export interface RbacUser {
  id?: Uuid
  externalUserId: string
  name?: string
  email?: string
  source?: string
  isDisabled?: boolean
  lastSeenAt?: string
}

/** rbac.yaml `RoleGrant` —— 一次"在某 scope 给某用户授某角色"的实例 */
export interface RoleGrant {
  userId: string
  roleType: string
  resourceType: ScopeType
  resourceId?: Uuid
  expiresAt?: string
  grantedBy?: string
  grantedAt?: string
}

/** rbac.yaml `RoleGrantRequest` —— 授予角色时的入参 */
export interface RoleGrantRequest {
  userId: string
  roleType: string
  scopeType: ScopeType
  scopeId?: Uuid
  expiresAt?: string
}

/** rbac.yaml `RoleRevokeRequest` —— 撤销时的入参 */
export interface RoleRevokeRequest {
  userId: string
  roleType: string
  scopeType: ScopeType
  scopeId?: Uuid
}

/** rbac.yaml `EffectivePermissionResult` —— /rbac/user/permissions 返回 */
export interface EffectivePermissionResult {
  permissions: string[]
  sourceGrants: Array<{
    roleCode: string
    scopeType: ScopeType
    scopeId?: Uuid
  }>
}
