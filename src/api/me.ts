import type { AxiosRequestConfig } from 'axios'
import type { User } from '@/types/user'
import { http } from './http'

/** GET /api/v1/me */
export function getMe(config?: AxiosRequestConfig): Promise<User> {
  return http.get('/me', config)
}
