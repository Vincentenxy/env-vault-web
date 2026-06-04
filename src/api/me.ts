import type { User } from '@/types/user'
import { http } from './http'

/** GET /api/v1/me */
export function getMe(): Promise<User> {
  return http.get('/me')
}
