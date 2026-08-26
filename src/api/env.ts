import type { Environment } from '@/types/env'
import type { Uuid } from '@/types/api'
import { http } from './http'

/** POST /api/v1/env/list */
export interface ListEnvironmentsRequest {
  projectId: Uuid
}
export function listEnvironments(req: ListEnvironmentsRequest): Promise<Environment[]> {
  return http.post('/env/list', req)
}

export interface CreateEnvironmentItem {
  code: string
  name: string
  remark: string
  orderNo?: number
  isCheckPerm: boolean
}

/** POST /api/v1/env/create */
export interface CreateEnvironmentRequest {
  projectId: Uuid
  environments: CreateEnvironmentItem[]
}
export function createEnvironment(req: CreateEnvironmentRequest): Promise<Environment[]> {
  return http.post('/env/create', req)
}

/** POST /api/v1/env/update */
export interface UpdateEnvironmentRequest {
  id: Uuid
  name: string
  remark: string
  orderNo: number
  isCheckPerm: boolean
}
export function updateEnvironment(req: UpdateEnvironmentRequest): Promise<Environment> {
  return http.post('/env/update', req)
}

export interface EnvironmentLookup {
  id: Uuid
}

/** POST /api/v1/env/info */
export function getEnvironment(req: EnvironmentLookup): Promise<Environment> {
  return http.post('/env/info', req)
}
