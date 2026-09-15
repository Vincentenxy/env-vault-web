import { http } from './http'
import type { PageRequest } from '@/types/api'
import type { SecretSearchResultPage } from '@/types/secret-search'

export interface SearchSecretsRequest extends PageRequest {
  scopes: { scopeType: 'tenant' | 'org' | 'project' | 'folder'; scopeId: string }[]
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
