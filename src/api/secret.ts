import type { SecretEntry, SecretGroup, SecretReveal } from '@/types/secret'
import type { PageRequest, PageResp, Uuid } from '@/types/api'
import { http } from './http'

/**
 * POST /api/v1/secret/list
 * environmentId 与 folderId 二选一:
 *  - environmentId: 列 env 下所有 folder 的 secret(全 env 视图)
 *  - folderId: 列该 folder 下的 secret
 *
 * 响应是 `SecretGroup[]`:每个 code 挂若干 env entry。
 */
export type ListSecretsRequest = PageRequest &
  (
    | { environmentId: Uuid; folderId?: never }
    | { environmentId?: never; folderId: Uuid }
  )

export function listSecrets(req: ListSecretsRequest): Promise<PageResp<SecretGroup>> {
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
export function createSecret(req: CreateSecretRequest): Promise<SecretEntry> {
  return http.post('/secret/create', req)
}

/**
 * POST /api/v1/secret/reveal
 * 仅返回明文 value + 版本号。需要 `secret:reveal` 权限。
 * - id 必填(env 专属 id,见 SecretEntry.id)
 */
export interface RevealSecretRequest {
  id: Uuid
}
export function revealSecret(req: RevealSecretRequest): Promise<SecretReveal> {
  return http.post('/secret/reveal', req)
}

/**
 * POST /api/v1/secret/update
 * - id 必填(env 专属 id,定位要更新的 secret)
 * - value 可选:填写则轮换密钥值,后端会 version+1;不填则保持原值
 * - comment 可选:更新说明,可清空
 * - key 不可修改(key 在 folder 内是稳定标识,改名需要走 create+delete 流程)
 * - folderId 不可修改(跨目录迁移不在本期范围)
 */
export interface UpdateSecretRequest {
  id: Uuid
  value?: string
  comment?: string
}
export function updateSecret(req: UpdateSecretRequest): Promise<SecretEntry> {
  return http.post('/secret/update', req)
}

/**
 * POST /api/v1/secrets/batchCreate
 * 批量创建密钥:
 *  - secretList[] 每项:一个密钥定义(共享 key + comment)
 *  - 每项里按 envCode 平铺 `{ folderId, value }`,key/comment 和这些 envCode 字段是兄弟级
 *  - 后端按 env 拆分成 N 条 secret(每条挂到对应 env 的 folderId 下)
 *  - folderId 由前端按"所选 folder 在每个 env 下的真实 id"得出(env 专属)
 */
export interface BatchEnvValue {
  folderId: Uuid
  value: string
}
export interface BatchSecretItem {
  key: string
  comment?: string
  [envCode: string]: string | BatchEnvValue | undefined
}
export interface BatchCreateSecretsRequest {
  secretList: BatchSecretItem[]
}
export function batchCreateSecrets(
  req: BatchCreateSecretsRequest,
): Promise<null> {
  return http.post('/secrets/batchCreate', req)
}
