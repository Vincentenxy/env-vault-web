import type { AxiosRequestConfig } from 'axios'
import type { Organization } from '@/types/organization'
import type { PageRequest, PageResp } from '@/types/api'
import { http } from './http'

export interface ListOrganizationsRequest extends PageRequest {
  tenantId?: string | null
  name?: string
  code?: string
}

export interface UpdateOrganizationRequest {
  id: string
  name: string
  remark: string
}

export interface OrganizationProjectOption {
  id: string
  name: string
}

export interface OrganizationWithProjects {
  id: string
  name: string
  projectList: OrganizationProjectOption[]
}

export interface OrganizationsWithProjectsData {
  orgList: OrganizationWithProjects[]
}

/** GET /api/v1/org/withProject */
export function getOrganizationsWithProjects(
  config?: AxiosRequestConfig,
): Promise<OrganizationsWithProjectsData> {
  return http.get('/org/withProject', config)
}

/** POST /api/v1/org/list */
export function listOrganizations(
  req: ListOrganizationsRequest = {},
): Promise<PageResp<Organization>> {
  return http.post('/org/list', req)
}

/** POST /api/v1/org/create */
export interface CreateOrganizationRequest {
  tenantId: string
  code: string
  name: string
  managerId: string
  comment?: string
  remark?: string
}
export function createOrganization(req: CreateOrganizationRequest): Promise<Organization> {
  return http.post('/org/create', req)
}

/** POST /api/v1/org/update */
export function updateOrganization(req: UpdateOrganizationRequest): Promise<Organization> {
  return http.post('/org/update', req)
}
