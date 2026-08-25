import type { Project, EnvSpec } from '@/types/project'
import type { PageRequest, PageResp, Uuid } from '@/types/api'
import { http } from './http'

export interface ListProjectsRequest extends PageRequest {
  orgId: string
  name?: string
  code?: string
}

export interface CreateProjectRequest {
  orgId: string
  code: string
  name: string
  managerId: Uuid
  remark?: string
  /** 可选;若不传,project 下不创建任何 env,后续在 env 页补建。 */
  environments?: EnvSpec[]
}

export interface UpdateProjectRequest {
  id: Uuid
  name: string
  remark: string
  manager?: string
}

/** POST /api/v1/project/list */
export function listProjects(req: ListProjectsRequest): Promise<PageResp<Project>> {
  return http.post('/project/list', req)
}

/** POST /api/v1/project/create */
export function createProject(req: CreateProjectRequest): Promise<Project> {
  return http.post('/project/create', req)
}

/** POST /api/v1/project/update */
export function updateProject(req: UpdateProjectRequest): Promise<Project> {
  return http.post('/project/update', req)
}

/**
 * `id` 与 `code` 互斥,任选其一。
 * 对应 core.yaml `IdOrCodeRequest`;对 project 而言 `parentId` 必填(orgId 由后端根据
 * 资源关系推断,但保留字段以兼容同构 schema)。
 */
export type ProjectLookup =
  | { id: Uuid; code?: never; parentId: Uuid }
  | { id?: never; code: string; parentId: Uuid }

/** 最新接口没有 project/info,通过 project/list 定位单个项目。 */
export function getProject(req: ProjectLookup): Promise<Project> {
  return listProjects({
    orgId: req.parentId,
    pageNum: 1,
    pageSize: 200,
    ...('code' in req && req.code ? { code: req.code } : {}),
  }).then((response) => {
    const project = response.list.find((item) =>
      'id' in req && req.id ? item.id === req.id : item.code === req.code,
    )
    if (!project) throw new Error('project not found')
    return project
  })
}
