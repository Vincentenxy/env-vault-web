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

/**
 * POST /api/v1/secret/update
 * - id 必填,定位要更新的 secret
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
export function updateSecret(req: UpdateSecretRequest): Promise<SecretMeta> {
  return http.post('/secret/update', req)
}

/**
 * POST /api/v1/secrets/batchCreate
 * 批量创建密钥(后端接口待上线,前端先按以下约定开发):
 *  - secretList[] 每项:一个密钥定义(共享 key + comment)
 *  - 每项里按 envCode 平铺 `{ folderId, value }`,key/comment 和这些 envCode 字段是兄弟级
 *    (示例:`{ key, comment, dev: { folderId, value }, test: { folderId, value } }`)
 *  - 后端按 env 拆分成 N 条 secret(每条挂到对应 env 的 folderId 下,value 取对应 env 的 value)
 *  - 某 env 缺 folderId 或 value 缺失 = 不为该 env 创建 secret
 *  - folderId 由前端按"所选 folder 的 name/code 在每个 env 的 tree 里反查"得出
 *    (默认假设每个 env 下都有同名 folder,反查不到的 env 跳过)
 *  - 后端响应:成功 `{ code: 0, msg: "success", data: null }`,失败 `{ code: -1, ... }`
 */
export interface BatchEnvValue {
  folderId: Uuid
  value: string
}
export interface BatchSecretItem {
  key: string
  comment?: string
  /** envCode -> { folderId, value }。运行时会有动态的 envCode 属性(dev/test/sim 等) */
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
