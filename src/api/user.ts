import type { PageRequest, PageResp } from '@/types/api'
import { http } from './http'

export interface ListUsersRequest extends PageRequest {
  userId?: string
  name?: string
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
}

/** POST /api/v1/user/list */
export function listUsers(req: ListUsersRequest = {}): Promise<PageResp<UserListItem>> {
  return http.post('/user/list', req)
}
