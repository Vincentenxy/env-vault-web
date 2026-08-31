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
  projectRelation?: {
    memberType: 'internal' | 'external'
    expireAt: string | null
  }
}

export interface UserManagementListRequest extends PageRequest {
  tenantId?: string
  keyword?: string
}

export interface UserManagementListItem {
  id: string
  userId: string
  nickname: string
  username: string
  email: string
  phone: string
  tenantId: string
  tenantName: string
  orgId: string
  orgName: string
  isBlocked: boolean
  createAt: string
  updateAt: string
}

export interface UpdateManagedUserRequest {
  userId: string
  nickname: string
  username: string
  email: string
  phone: string
  tenantId: string | null
  orgId: string | null
}

export interface UpdateManagedUserResult {
  id: string
  userId: string
  nickname: string
  username: string
  email: string
  phone: string
  tenantId: string
  orgId: string
  isBlocked: boolean
  createBy: string
  updateBy: string
  createAt: string
  updateAt: string
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

/** POST /api/v1/user/manage/list */
export function listManagedUsers(
  req: UserManagementListRequest = {},
): Promise<PageResp<UserManagementListItem>> {
  return http.post('/user/manage/list', req)
}

/** POST /api/v1/user/manage/update */
export function updateManagedUser(req: UpdateManagedUserRequest): Promise<UpdateManagedUserResult> {
  return http.post('/user/manage/update', req)
}

/** POST /api/v1/user/allocate */
export function allocateUsers(req: AllocateUsersRequest): Promise<AllocateUsersResponse> {
  return http.post('/user/allocate', req)
}
