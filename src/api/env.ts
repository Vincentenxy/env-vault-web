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
