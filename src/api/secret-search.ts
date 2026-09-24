import { http } from './http'
import type { PageRequest } from '@/types/api'
import type { SecretSearchResultPage } from '@/types/secret-search'

export interface SecretSearchScopeRequest {
  scopeType: 'tenant' | 'org' | 'project' | 'folder'
  scopeId: string
}

export interface SearchSecretsRequest extends PageRequest {
  scopes: SecretSearchScopeRequest[]
  envList: string[]
  tagIdList: string[]
  keyword: string
}

export interface SecretSearchTagOption {
  id: string
  tenantId: string
  tenantName: string
  code: string
  name: string
  remark: string
}

export interface ListSecretSearchTagsRequest extends PageRequest {
  scopes: SecretSearchScopeRequest[]
  envList: string[]
  keyword: string
}

// 独立检索入口，不改变 secret/list 的两种原有查询模式
export function searchSecrets(
  request: SearchSecretsRequest,
  signal?: AbortSignal,
): Promise<SecretSearchResultPage> {
  return http.post('/secret/search', request, { signal, silent: true })
}

// 标签候选与密钥搜索使用相同范围，避免跨租户逐个加载标签
export function listSecretSearchTags(
  request: ListSecretSearchTagsRequest,
  signal?: AbortSignal,
): Promise<{ total: number; list: SecretSearchTagOption[] }> {
  return http.post('/secret/search/tag/list', request, { signal, silent: true })
}
