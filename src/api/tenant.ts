import type { AxiosRequestConfig } from 'axios'
import type { PageRequest, PageResp } from '@/types/api'
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
  managerId?: string
  orgCount?: number
  memberCount?: number
  managerName?: string
  createdAt?: string
  updatedAt?: string
}

export interface CreateTenantRequest {
  code: string
  name: string
  managerId: string
  remark?: string
}

export interface ListTenantsRequest extends PageRequest {
  code?: string
  name?: string
}

export interface UpdateTenantRequest {
  id: string
  name: string
  remark: string
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

/** POST /api/v1/tenant/list */
export function listTenants(req: ListTenantsRequest = {}): Promise<PageResp<Tenant>> {
  return http.post('/tenant/list', req)
}

/** POST /api/v1/tenant/update */
export function updateTenant(req: UpdateTenantRequest): Promise<Tenant> {
  return http.post('/tenant/update', req)
}
