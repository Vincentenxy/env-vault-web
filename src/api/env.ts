import type { Environment } from '@/types/env'
import type { PageRequest, PageResp, Uuid } from '@/types/api'
import { http } from './http'

/** POST /api/v1/env/list */
export interface ListEnvironmentsRequest extends PageRequest {
  projectId: Uuid
}
export function listEnvironments(req: ListEnvironmentsRequest): Promise<PageResp<Environment>> {
  return http.post('/env/list', req)
}

/**
 * POST /api/v1/env/create
 * 对应 core.yaml `CreateChildEntityRequest`:
 *  - parentId: project id
 *  - code / name: 必填
 *  - comment: 可选
 * 后端不创建默认 folder,需另行调用 /api/v1/folder/create。
 */
export interface CreateEnvironmentRequest {
  parentId: Uuid
  code: string
  name: string
  comment?: string
}
export function createEnvironment(req: CreateEnvironmentRequest): Promise<Environment> {
  return http.post('/env/create', req)
}

/**
 * `id` 与 `code` 互斥,任选其一;`parentId`(projectId)必填。
 * 对应 core.yaml `IdOrCodeRequest`。
 */
export type EnvironmentLookup =
  | { id: Uuid; code?: never; parentId: Uuid }
  | { id?: never; code: string; parentId: Uuid }

/** POST /api/v1/env/info */
export function getEnvironment(req: EnvironmentLookup): Promise<Environment> {
  return http.post('/env/info', req)
}

/**
 * POST /api/v1/env/update
 * - id/code 互斥
 * - parentId 必填
 * - name 必填
 * - code 后端不允许修改,前端不传
 */
export interface UpdateEnvironmentRequest {
  id?: Uuid
  code?: string
  parentId: Uuid
  name: string
  comment?: string
}
export function updateEnvironment(req: UpdateEnvironmentRequest): Promise<Environment> {
  return http.post('/env/update', req)
}

/**
 * POST /api/v1/env/delete
 * - id/code 互斥
 * - `force` 默认 false:有 active child folder/secret 时返回 409
 * - `force=true` 级联软删 folder→secret,需 `env:force_delete` 权限
 */
export interface DeleteEnvironmentRequest {
  id?: Uuid
  code?: string
  parentId: Uuid
  force?: boolean
}
export interface DeleteEnvironmentResponse {
  deleted: boolean
}
export function deleteEnvironment(req: DeleteEnvironmentRequest): Promise<DeleteEnvironmentResponse> {
  return http.post('/env/delete', req)
}
