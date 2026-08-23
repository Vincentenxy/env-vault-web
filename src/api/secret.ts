import type { SecretEntry, SecretGroup } from '@/types/secret'
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
  ({ environmentId: Uuid; folderId?: never } | { environmentId?: never; folderId: Uuid })

export function listSecrets(req: ListSecretsRequest): Promise<PageResp<SecretGroup>> {
  return http.post('/secret/list', req)
}

/**
 * 秘钥中心按 folderGroupId 查询一个逻辑文件夹下的全部密钥。
 * 响应数据包裹在 `secretList` 中,每条密钥的环境值位于 `values` 下。
 */
export interface FolderGroupSecretValue {
  secretId: Uuid
  folderId: Uuid
  value: string
  version: number
  valueType: string
}

export interface FolderGroupSecret {
  groupId: Uuid
  key: string
  remark?: string
  values: Record<string, FolderGroupSecretValue>
}

export interface ListFolderGroupSecretsResponse {
  secretList: FolderGroupSecret[]
}

export function listSecretsByFolderGroup(req: {
  folderGroupId: Uuid
}): Promise<ListFolderGroupSecretsResponse> {
  return http.post('/secret/list', req)
}

export interface UpdateFolderGroupSecretValueRequest {
  secretId: Uuid
  envCode: string
  folderId: Uuid
  value: string
}

export interface UpdateFolderGroupSecretItemRequest {
  groupId: Uuid
  key: string
  remark?: string
  values?: UpdateFolderGroupSecretValueRequest[]
}

export interface UpdateFolderGroupSecretsRequest {
  commitMsg: string
  secrets: UpdateFolderGroupSecretItemRequest[]
}

export interface UpdateFolderGroupSecretsResponse {
  batchId: Uuid
}

export function updateFolderGroupSecrets(
  req: UpdateFolderGroupSecretsRequest,
): Promise<UpdateFolderGroupSecretsResponse> {
  return http.post('/secret/update', req)
}

/** 删除一个逻辑密钥及其在所有项目环境下的值。 */
export interface DeleteFolderGroupSecretRequest {
  groupId: Uuid
}

export function deleteFolderGroupSecret(req: DeleteFolderGroupSecretRequest): Promise<null> {
  return http.post('/secret/delete', req)
}

/** 查询一个逻辑密钥在各项目环境下的全部历史版本。 */
export interface SecretHistoryItem {
  id: Uuid
  secretId: Uuid
  batchId: Uuid
  groupId: Uuid
  folderId: Uuid
  envCode: string
  value: string
  valueType: string
  version: number
  commitMsg: string
  createBy: string
  createByName: string
  createAt: string
}

export interface SecretEnvironmentHistory {
  total: number
  list: SecretHistoryItem[]
}

/** 响应以环境 ID 为动态键。 */
export type SecretHistoryResponse = Record<Uuid, SecretEnvironmentHistory>

export interface GetSecretHistoryRequest extends PageRequest {
  groupId: Uuid
}

export function getSecretHistory(req: GetSecretHistoryRequest): Promise<SecretHistoryResponse> {
  return http.post('/secret/history', req)
}

/** POST /api/v1/secret/history，通过 batchId 查询提交批次内的全部修改。 */
export interface SecretBatchDetailItem {
  groupId: Uuid
  key: string
  remark: string
  versions: Record<Uuid, SecretHistoryItem>
}

export interface GetSecretBatchDetailRequest {
  batchId: Uuid
}

export type SecretBatchDetailResponse = SecretBatchDetailItem[]

export function getSecretBatchDetail(
  req: GetSecretBatchDetailRequest,
): Promise<SecretBatchDetailResponse> {
  return http.post('/secret/history', req)
}

/**
 * POST /api/v1/secret/list
 *
 * 新形态:
 *  - 秘钥中心按 folderGroupId 定位,请求只需要 folderGroupId
 *  - 项目详情页仍兼容 projectId + folderCode + envList 的旧调用方式
 *  - key 为空时,返回该 folder 下所有 secret
 *  - 响应是平铺的 `SecretAcrossEnvs[]`,每个对象顶层 `key` + `projectCode`,
 *    加上动态 `envCode` 索引的 {value, version, updatedAt} 块
 *
 * 与旧 /secret/list 的区别:
 *  - 旧:按 env 列表,每条一个 env entry(同一个 key 在 4 个 env 下是 4 行)
 *  - 新:按 key 列表,每个 key 一行 N 个环境列,与项目的环境列表一致
 */
export type ListSecretsAcrossEnvsRequest =
  | {
      /** 秘钥中心文件夹的逻辑分组 ID,后端据此查询该文件夹下所有环境的 secret。 */
      folderGroupId: Uuid
      /** 空字符串/不传 = 查询该 folder 下所有 secret;否则按 key 精确查询 */
      key?: string
      /** 仅兼容后端仍要求环境过滤的版本。 */
      envList?: string[]
      projectId?: never
      folderCode?: never
    }
  | {
      /** 项目详情页旧查询方式,秘钥中心不再使用。 */
      projectId: Uuid
      folderCode: string
      key?: string
      envList: string[]
      folderGroupId?: never
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
  /** env 维度的排序字段,后续后端返回,当前暂缺。存在时按此升序;不存在时 fallback 到默认顺序。 */
  sortOrder?: number
}

/**
 * 一行 = 一个 key 在所有 env 上的值平铺。
 * 顶层有 `key`、`projectCode`,余下是 `envCode -> SecretAcrossEnvsEntry`。
 * 与 `SecretGroup` 形态相同,但值含明文 value(走 secret:read 即可看明文)。
 */
export interface SecretAcrossEnvs {
  key: string
  projectCode: string
  /** secret 维度说明,后续后端返回;当前暂缺 */
  comment?: string
  /** secret 维度排序字段,后续后端返回,当前暂缺。存在时按此升序;不存在时 fallback 到默认顺序。 */
  sortOrder?: number
  [envCode: string]: SecretAcrossEnvsEntry | string | number | undefined
}

export function listSecretsAcrossEnvs(
  req: ListSecretsAcrossEnvsRequest,
): Promise<SecretAcrossEnvs[]> {
  return http.post('/secret/list', req)
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
 * POST /api/v1/secret/update (旧接口,仍需保留兼容)
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
 * POST /api/v1/secret/update
 * 一次提交一个 key 在所有 env 上的值和说明，无需 per-env 循环调用。
 * values 数组中只放有变更的 env（含 id + value），comment 可清空。
 */
export interface UpdateSecretsValueEntry {
  id: Uuid
  value: string
}
export interface UpdateSecretsRequest {
  key: string
  comment: string
  values: UpdateSecretsValueEntry[]
}
export function updateSecrets(req: UpdateSecretsRequest): Promise<null> {
  return http.post('/secret/update', req)
}

/**
 * POST /api/v1/secret/create
 * 一次提交多行密钥及其所有项目环境值。
 */
export interface BatchCreateSecretValue {
  envId: Uuid
  value: string
}
export interface BatchCreateSecretItem {
  folderGroupId: Uuid
  key: string
  remark: string
  values: BatchCreateSecretValue[]
}
export interface BatchCreateSecretsRequest {
  secretList: BatchCreateSecretItem[]
}
export function batchCreateSecrets(req: BatchCreateSecretsRequest): Promise<null> {
  return http.post('/secret/create', req)
}
