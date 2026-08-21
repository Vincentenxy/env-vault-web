import type { AxiosRequestConfig } from 'axios'
import { http } from './http'

export interface TenantProjectOption {
  id: string
  name: string
}

export interface TenantOrganizationOption {
  id: string
  name: string
  projectList: TenantProjectOption[]
}

export interface TenantHierarchyOption {
  id: string
  name: string
  orgList: TenantOrganizationOption[]
}

export interface TenantWithOrgProjectData {
  tenantList: TenantHierarchyOption[]
}

export interface Tenant {
  id: string
  code: string
  name: string
  remark?: string
  createdAt?: string
  updatedAt?: string
}

export interface CreateTenantRequest {
  code: string
  name: string
  remark?: string
}

/** GET /api/v1/tenant/withOrgProject */
export function getTenantWithOrgProject(
  config?: AxiosRequestConfig,
): Promise<TenantWithOrgProjectData> {
  return http.get('/tenant/withOrgProject', config)
}

/** POST /api/v1/tenant/create */
export function createTenant(req: CreateTenantRequest): Promise<Tenant> {
  return http.post('/tenant/create', req)
}
