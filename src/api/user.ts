import type { PageRequest, PageResp } from '@/types/api'
import { http } from './http'

export interface ListUsersRequest extends PageRequest {
  userId?: string
  name?: string
  tenantId?: string
  orgId?: string
  projectId?: string
  undistributed?: boolean
}

export interface UserListItem {
  id?: string
  userId?: string
  staffUserId?: string
  staffuserid?: string
  nickname?: string
  nickName?: string
  name?: string
  userName?: string
  email?: string
  isBlocked?: boolean
}

export type UserResourceType = 'tenant' | 'org' | 'project'
export type UserAllocationOperation = 'add' | 'remove'

export interface AllocateUsersRequest {
  type: UserResourceType
  operate: UserAllocationOperation
  resourceId: string
  userIdList: string[]
}

export interface AllocateUsersResponse {
  affectedCount: number
}

/** POST /api/v1/user/list */
export async function listUsers(req: ListUsersRequest = {}): Promise<PageResp<UserListItem>> {
  const response = await http.post<unknown, PageResp<UserListItem> | UserListItem[]>(
    '/user/list',
    req,
  )
  if (!Array.isArray(response)) return response
  return {
    pageNum: 1,
    pageSize: response.length,
    total: response.length,
    list: response,
  }
}

/** POST /api/v1/user/allocate */
export function allocateUsers(req: AllocateUsersRequest): Promise<AllocateUsersResponse> {
  return http.post('/user/allocate', req)
}
