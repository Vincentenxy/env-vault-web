import { http } from './http'
import type { Uuid } from '@/types/api'

export interface UserAccessToken {
  id: Uuid
  name: string
  token: string
  createAt: string
  expiresAt: string
  lastUsedAt: string | null
}

export interface CreateUserAccessTokenRequest {
  name: string
  expiresAt: string
}

export function createUserAccessToken(req: CreateUserAccessTokenRequest): Promise<UserAccessToken> {
  return http.post('/user/token/create', req)
}

export function listUserAccessTokens(): Promise<UserAccessToken[]> {
  return http.post('/user/token/list', {})
}

export function deleteUserAccessToken(req: { id: Uuid }): Promise<null> {
  return http.post('/user/token/delete', req)
}
