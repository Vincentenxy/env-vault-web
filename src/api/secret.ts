import type { SecretMeta, SecretReveal } from '@/types/secret'
import type { PageRequest, PageResp, Uuid } from '@/types/api'
import { http } from './http'

/**
 * POST /api/v1/secret/list
 * environmentId 与 folderId 二选一:
 *  - environmentId: 列 env 下所有 folder 的 secret(全 env 视图)
 *  - folderId: 列该 folder 下的 secret
 */
export type ListSecretsRequest = PageRequest &
  (
    | { environmentId: Uuid; folderId?: never }
    | { environmentId?: never; folderId: Uuid }
  )

export function listSecrets(req: ListSecretsRequest): Promise<PageResp<SecretMeta>> {
  return http.post('/secret/list', req)
}

/**
 * POST /api/v1/secret/create
 * - folderId 必填
 * - key 必填,后端校验 `^[A-Z][A-Z0-9_]*$`
 * - value 必填
 * - comment 可选
 */
export interface CreateSecretRequest {
  folderId: Uuid
  key: string
  value: string
  comment?: string
}
export function createSecret(req: CreateSecretRequest): Promise<SecretMeta> {
  return http.post('/secret/create', req)
}

/**
 * POST /api/v1/secret/reveal
 * 仅返回明文 value + 版本号。需要 `secret:reveal` 权限。
 * - id 必填
 */
export interface RevealSecretRequest {
  id: Uuid
}
export function revealSecret(req: RevealSecretRequest): Promise<SecretReveal> {
  return http.post('/secret/reveal', req)
}
