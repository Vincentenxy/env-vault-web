import type { Organization } from '@/types/organization'
import type { PageRequest, PageResp } from '@/types/api'
import { http } from './http'

/** POST /api/v1/org/list */
export function listOrganizations(req: PageRequest = {}): Promise<PageResp<Organization>> {
  return http.post('/org/list', req)
}

/** POST /api/v1/org/create */
export interface CreateOrganizationRequest {
  code: string
  name: string
  comment?: string
}
export function createOrganization(req: CreateOrganizationRequest): Promise<Organization> {
  return http.post('/org/create', req)
}

/**
 * `id` 与 `code` 互斥,任选其一。
 * 对应 core.yaml `IdOrCodeRequest`;对 org 而言 parentId 不需要,后端会忽略。
 */
export type OrganizationLookup =
  | { id: string; code?: never; parentId?: never }
  | { id?: never; code: string; parentId?: never }

/** POST /api/v1/org/info */
export function getOrganization(req: OrganizationLookup): Promise<Organization> {
  return http.post('/org/info', req)
}

/**
 * POST /api/v1/org/update
 * - id/code 互斥
 * - name 必填(对应 core.yaml UpdateIdOrCodeRequest.required)
 * - code 字段虽然 schema 允许,但后端创建后不可修改,前端不传
 * - comment 可选
 */
export type UpdateOrganizationRequest = {
  id?: string
  code?: string
  name: string
  comment?: string
}
export function updateOrganization(req: UpdateOrganizationRequest): Promise<Organization> {
  return http.post('/org/update', req)
}

/**
 * POST /api/v1/org/delete
 * - id/code 互斥
 * - `force` 默认 false:有 active child project 时返回 409
 * - `force=true` 级联软删 project→env→folder→secret,需 `org:force_delete` 权限
 */
export type DeleteOrganizationRequest = {
  id?: string
  code?: string
  force?: boolean
}
export interface DeleteOrganizationResponse {
  deleted: boolean
}
export function deleteOrganization(
  req: DeleteOrganizationRequest,
): Promise<DeleteOrganizationResponse> {
  return http.post('/org/delete', req)
}
