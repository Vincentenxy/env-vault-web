import type { AxiosRequestConfig } from 'axios'
import type { User } from '@/types/user'
import { http } from './http'

/** GET /api/v1/user/me */
export function getMe(config?: AxiosRequestConfig): Promise<User> {
  return http.get('/user/me', config)
}
