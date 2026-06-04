import type { Project, EnvSpec } from '@/types/project'
import type { PageRequest, PageResp, Uuid } from '@/types/api'
import { http } from './http'

export interface ListProjectsRequest extends PageRequest {
  orgId: string
}

export interface CreateProjectRequest {
  parentId: string
  code: string
  name: string
  comment?: string
  /** 可选;若不传,project 下不创建任何 env,后续在 env 页补建。 */
  environments?: EnvSpec[]
}

/** POST /api/v1/project/list */
export function listProjects(req: ListProjectsRequest): Promise<PageResp<Project>> {
  return http.post('/project/list', req)
}

/** POST /api/v1/project/create */
export function createProject(req: CreateProjectRequest): Promise<Project> {
  return http.post('/project/create', req)
}

/**
 * `id` 与 `code` 互斥,任选其一。
 * 对应 core.yaml `IdOrCodeRequest`;对 project 而言 `parentId` 必填(orgId 由后端根据
 * 资源关系推断,但保留字段以兼容同构 schema)。
 */
export type ProjectLookup =
  | { id: Uuid; code?: never; parentId: Uuid }
  | { id?: never; code: string; parentId: Uuid }

/** POST /api/v1/project/info */
export function getProject(req: ProjectLookup): Promise<Project> {
  return http.post('/project/info', req)
}

/**
 * POST /api/v1/project/update
 * - id/code 互斥
 * - name 必填
 * - code 字段后端不允许修改,前端不传
 */
export type UpdateProjectRequest = {
  id?: Uuid
  code?: string
  parentId: Uuid
  name: string
  comment?: string
}
export function updateProject(req: UpdateProjectRequest): Promise<Project> {
  return http.post('/project/update', req)
}

/**
 * POST /api/v1/project/delete
 * - id/code 互斥
 * - `force` 默认 false:有 active child env/folder/secret 时返回 409
 * - `force=true` 级联软删 env→folder→secret,需 `project:force_delete` 权限
 */
export type DeleteProjectRequest = {
  id?: Uuid
  code?: string
  parentId: Uuid
  force?: boolean
}
export interface DeleteProjectResponse {
  deleted: boolean
}
export function deleteProject(req: DeleteProjectRequest): Promise<DeleteProjectResponse> {
  return http.post('/project/delete', req)
}
