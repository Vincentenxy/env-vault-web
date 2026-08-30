import type { PageRequest, Uuid } from '@/types/api'
import { http } from './http'

export interface PersonalSecretMetadata {
  id: Uuid
  name: string
  credentialType: 'password'
  account: string
  loginUrl: string
  remark: string
  version: number
  createBy: string
  createByName: string
  updateBy: string
  updateByName: string
  createAt: string
  updateAt: string
}

export interface PersonalSecret extends PersonalSecretMetadata {
  /** 当前列表直接返回的明文密码；预留 reveal 接口供后续切换。 */
  value: string
}

export interface PersonalSecretHistory {
  id: Uuid
  personalSecretId: Uuid
  batchId: Uuid
  name: string
  credentialType: 'password'
  account: string
  loginUrl: string
  remark: string
  version: number
  commitMsg: string
  createBy: string
  createByName: string
  createAt: string
}

export interface PersonalSecretPage<T> {
  total: number
  list: T[]
}

export interface CreatePersonalSecretRequest {
  name: string
  credentialType?: 'password'
  account?: string
  loginUrl?: string
  value: string
  remark?: string
  commitMsg?: string
}

export interface UpdatePersonalSecretRequest {
  id: Uuid
  version: number
  name: string
  credentialType: 'password'
  account: string
  loginUrl: string
  /** 空字符串表示保持当前密码。 */
  value: string
  remark: string
  commitMsg: string
}

export interface PersonalSecretReveal {
  id: Uuid
  value: string
  version: number
}

export interface PersonalSecretHistoryReveal {
  id: Uuid
  personalSecretId: Uuid
  value: string
  version: number
}

export function createPersonalSecret(
  req: CreatePersonalSecretRequest,
): Promise<PersonalSecretMetadata> {
  return http.post('/user/secret/create', req)
}

export function updatePersonalSecret(
  req: UpdatePersonalSecretRequest,
): Promise<PersonalSecretMetadata> {
  return http.post('/user/secret/update', req)
}

export function deletePersonalSecret(req: { id: Uuid; version: number }): Promise<null> {
  return http.post('/user/secret/delete', req)
}

export function listPersonalSecrets(
  req: PageRequest & { keyword?: string },
): Promise<PersonalSecretPage<PersonalSecret>> {
  return http.post('/user/secret/list', req)
}

export function listManagedPersonalSecrets(
  req: PageRequest & { userId: string; keyword?: string },
): Promise<PersonalSecretPage<PersonalSecret>> {
  return http.post('/user/secret/manage/list', req)
}

export function revealPersonalSecret(req: { id: Uuid }): Promise<PersonalSecretReveal> {
  return http.post('/user/secret/reveal', req)
}

export function listPersonalSecretHistory(
  req: PageRequest & { personalSecretId: Uuid },
): Promise<PersonalSecretPage<PersonalSecretHistory>> {
  return http.post('/user/secret/history', req)
}

export function revealPersonalSecretHistory(req: {
  personalSecretId: Uuid
  historyId: Uuid
}): Promise<PersonalSecretHistoryReveal> {
  return http.post('/user/secret/history/reveal', req)
}
