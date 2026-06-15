import type { AxiosRequestConfig } from 'axios'
import type { PageRequest, PageResp, Uuid } from '@/types/api'
import type {
  PermissionDef,
  Role,
  RoleUpsertRequest,
  RoleGrant,
  RoleGrantRequest,
  RoleRevokeRequest,
  RbacUser,
  EffectivePermissionResult,
  Scope,
} from '@/types/rbac'
import { http } from './http'

/* ============================================================
 * 通用别名请求
 *  - rbac.yaml 中 `RoleInfoRequest` / `RoleGrantRequest` 等支持 id/code 双键,
 *    这里用最直观的入参形式,带 id 的用 id,带 code 的用 code。
 * ============================================================ */

function scopePayload(s: Scope): { scopeType: Scope['scopeType']; scopeId?: Uuid } {
  return { scopeType: s.scopeType, scopeId: s.scopeId }
}

/* ============================================================
 * Permissions
 * ============================================================ */

/** POST /rbac/permission/list —— 系统权限码目录 */
export function listPermissions(
  req: PageRequest = {},
  config?: AxiosRequestConfig,
): Promise<PageResp<PermissionDef>> {
  return http.post('/rbac/permission/list', req, config)
}

/**
 * POST /rbac/me/permissions —— 当前用户在指定 scope 下的有效权限码。
 * 这是 `usePermission` 的唯一数据来源。
 */
export function getMyPermissions(
  scope: Scope,
  config?: AxiosRequestConfig,
): Promise<string[]> {
  const request = http.post(
    '/rbac/me/permissions',
    scopePayload(scope),
    config,
  ) as unknown as Promise<string[] | { permissions: string[] }>
  return request.then((data) => (Array.isArray(data) ? data : data.permissions ?? []))
}

/* ============================================================
 * Roles
 * ============================================================ */

/**
 * GET /rbac/role/list —— 列出系统所有角色。
 *
 * 该接口是**无参的 GET**(后端一次性返回全部角色,不分页)。
 * 按 `design/DESIGN.md` §"接口方法选择" 规则:无请求数据的查询使用 GET。
 *
 * 响应:响应拦截器剥 envelope 后,`data.data` 直接是 `Role[]` 数组,
 * 不会再包 `PageResp`(后端对无分页查询统一返回数组,不分页页码)。
 * 保留 config 形参以兼容 axios 调用约定(`silent` / 自定义 header 等)。
 */
export function listRoles(
  config?: AxiosRequestConfig,
): Promise<Role[]> {
  return http.get('/rbac/role/list', config) as unknown as Promise<Role[]>
}

/** POST /rbac/role/info —— 按 id 或 code 查单个角色 */
export function getRole(
  req: { id?: Uuid; code?: string },
  config?: AxiosRequestConfig,
): Promise<Role> {
  return http.post('/rbac/role/info', req, config)
}

/** POST /rbac/role/create */
export function createRole(
  req: RoleUpsertRequest,
  config?: AxiosRequestConfig,
): Promise<Role> {
  return http.post('/rbac/role/create', req, config)
}

/** POST /rbac/role/update —— id 必填,其余字段按需覆盖 */
export function updateRole(
  req: RoleUpsertRequest & { id: Uuid },
  config?: AxiosRequestConfig,
): Promise<Role> {
  return http.post('/rbac/role/update', req, config)
}

/** POST /rbac/role/delete */
export function deleteRole(
  req: { id: Uuid },
  config?: AxiosRequestConfig,
): Promise<{ deleted: boolean }> {
  return http.post('/rbac/role/delete', req, config)
}

/* ============================================================
 * Bindings
 * ============================================================ */

export interface ListRoleBindingsRequest extends PageRequest {
  scope: Scope
}

/** POST /rbac/binding/list —— 列出某 scope 下的所有授权 */
export function listRoleBindings(
  req: ListRoleBindingsRequest,
  config?: AxiosRequestConfig,
): Promise<PageResp<RoleGrant>> {
  return http.post('/rbac/binding/list', { ...scopePayload(req.scope), ...req }, config)
}

/** POST /rbac/binding/grant */
export function grantRole(
  req: RoleGrantRequest,
  config?: AxiosRequestConfig,
): Promise<RoleGrant> {
  return http.post('/rbac/binding/grant', req, config)
}

/** POST /rbac/binding/revoke */
export function revokeRole(
  req: RoleRevokeRequest,
  config?: AxiosRequestConfig,
): Promise<{ deleted: boolean }> {
  return http.post('/rbac/binding/revoke', req, config)
}

/* ============================================================
 * Users
 * ============================================================ */

export interface ListRbacUsersRequest extends PageRequest {
  scope: Scope
}

/** POST /rbac/user/list —— 列出在某 scope 下可见的用户 */
export function listRbacUsers(
  req: ListRbacUsersRequest,
  config?: AxiosRequestConfig,
): Promise<PageResp<RbacUser>> {
  return http.post('/rbac/user/list', { ...scopePayload(req.scope), ...req }, config)
}

/** POST /rbac/user/me —— 当前用户自己的所有直接授权 */
export function getCurrentRbacUser(
  req: PageRequest = {},
  config?: AxiosRequestConfig,
): Promise<PageResp<RoleGrant>> {
  return http.post('/rbac/user/me', req, config)
}

/** POST /rbac/user/grants —— 某用户的所有直接授权 */
export function listUserGrants(
  req: PageRequest & { userId: string },
  config?: AxiosRequestConfig,
): Promise<PageResp<RoleGrant>> {
  return http.post('/rbac/user/grants', req, config)
}

/** POST /rbac/user/permissions —— 某用户在某 scope 下的有效权限 + 来源授权 */
export function getUserPermissions(
  req: { userId: string } & Scope,
  config?: AxiosRequestConfig,
): Promise<EffectivePermissionResult> {
  return http.post('/rbac/user/permissions', req, config)
}
