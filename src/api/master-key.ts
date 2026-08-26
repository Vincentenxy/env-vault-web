import type { AxiosRequestConfig } from 'axios'
import type { MasterKeyStatus, SubmitMasterKeySharesRequest } from '@/types/master-key'
import { http } from './http'

/** GET /api/v1/pub/masterKey/status */
export function getMasterKeyStatus(config?: AxiosRequestConfig): Promise<MasterKeyStatus> {
  return http.get('/pub/masterKey/status', config)
}

/** POST /api/v1/pub/masterKey/shares */
export function submitMasterKeyShares(
  req: SubmitMasterKeySharesRequest,
  config?: AxiosRequestConfig,
): Promise<MasterKeyStatus> {
  return http.post('/pub/masterKey/shares', req, config)
}
