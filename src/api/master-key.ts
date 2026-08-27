import type { AxiosRequestConfig } from 'axios'
import type { MasterKeyStatus, SubmitMasterKeyShareRequest } from '@/types/master-key'
import { http } from './http'

/** GET /api/v1/masterKey/status */
export function getMasterKeyStatus(config?: AxiosRequestConfig): Promise<MasterKeyStatus> {
  return http.get('/masterKey/status', config)
}

/** POST /api/v1/masterKey/share */
export function submitMasterKeyShare(
  req: SubmitMasterKeyShareRequest,
  config?: AxiosRequestConfig,
): Promise<MasterKeyStatus> {
  return http.post('/masterKey/share', req, config)
}
