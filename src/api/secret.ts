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
 * POST /api/v1/secrets/list  (复数 —— 新接口,与新增页面保持一致)
 *
 * 新形态:
 *  - 入参按 (projectId, folderCode, key, envList) 定位
 *  - key 为空时,返回该 folder 下所有 secret
 *  - 响应是平铺的 `SecretAcrossEnvs[]`,每个对象顶层 `key` + `projectCode`,
 *    加上 `envCode` 索引的 {value, version, updatedAt} 块
 *    (dev/test/sim/prod 这种 —— 4 个环境一份打平)
 *
 * 与旧 /secret/list 的区别:
 *  - 旧:按 env 列表,每条一个 env entry(同一个 key 在 4 个 env 下是 4 行)
 *  - 新:按 key 列表,每个 key 一行 4 列 (4 个 env 横向并列),与新增/编辑
 *    弹窗里"一行 key 下面 4 个 env 输入框"的视觉一致
 */
export interface ListSecretsAcrossEnvsRequest {
  projectId: Uuid
  folderCode: string
  /** 空字符串/不传 = 查询该 folder 下所有 secret;否则按 key 精确查询 */
  key?: string
  /** 要返回哪些 env 列;典型为 ["dev","test","sim","prod"] */
  envList: string[]
}

/** 单个 env 在新接口响应中的块(包含 value + 元信息) */
export interface SecretAcrossEnvsEntry {
  /**
   * env 专属 id(定位到该 key 在该 env 下的具体 secret)。
   * 后端 list 接口如果没返,前端无法直接走 `/secret/update`,
   * 需要后端补字段或前端用 `reveal` 拿 id 后再 update。
   */
  id: Uuid
  value: string
  version: number
  updatedAt: string
}

/**
 * 一行 = 一个 key 在所有 env 上的值平铺。
 * 顶层有 `key`、`projectCode`,余下是 `envCode -> SecretAcrossEnvsEntry`。
 * 与 `SecretGroup` 形态相同,但值含明文 value(走 secret:read 即可看明文)。
 */
export interface SecretAcrossEnvs {
  key: string
  projectCode: string
  [envCode: string]: SecretAcrossEnvsEntry | string | undefined
}

export function listSecretsAcrossEnvs(
  req: ListSecretsAcrossEnvsRequest,
): Promise<SecretAcrossEnvs[]> {
  return http.post('/secrets/list', req)
}

/**
 * 从 SecretAcrossEnvs 抽出指定 envCode 列表里的 entry。
 * 不存在的 envCode 返回 undefined(对应单元格里展示 "—")。
 */
export function pickEnvEntries(
  group: SecretAcrossEnvs,
  envCodes: string[],
): Record<string, SecretAcrossEnvsEntry | undefined> {
  const out: Record<string, SecretAcrossEnvsEntry | undefined> = {}
  for (const code of envCodes) {
    const v = group[code]
    if (v && typeof v === 'object' && 'value' in v) {
      out[code] = v as SecretAcrossEnvsEntry
    } else {
      out[code] = undefined
    }
  }
  return out
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
 * 批量创建密钥(新格式):
 *  - secretList[] 每项 = 一个 key 的完整定义(key + comment + 4 env 的值)
 *  - 每项里 envList 是 `[{envCode, folderId, value}]` 数组 —— 数组结构
 *    不再依赖 key 的索引签名,字段含义显式、易扩展
 *  - 后端按 envList 在每个 env 下创建一条 secret(挂到该 env 的 folderId 下)
 *  - folderId 必须是「该 folder 在该 env 下的专属 id」,不能共用逻辑 folderId
 */
export interface BatchCreateEnvEntry {
  envCode: string
  /** 该 env 下该 folder 的专属 folderId(从 FolderEnvBinding.folderId 取) */
  folderId: Uuid
  /** 写入该 env 的明文 value;空串 = 该 env 不写值(由后端决定) */
  value: string
}
export interface BatchCreateSecretItem {
  key: string
  comment: string
  envList: BatchCreateEnvEntry[]
}
export interface BatchCreateSecretsRequest {
  secretList: BatchCreateSecretItem[]
}
export function batchCreateSecrets(
  req: BatchCreateSecretsRequest,
): Promise<null> {
  return http.post('/secrets/batchCreate', req)
}
