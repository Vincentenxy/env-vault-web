import { http } from './http'

export interface LocalLoginRequest {
  username: string
  password: string
}

export interface LocalLoginResponse {
  accessToken: string
  tokenType: 'Bearer'
  expiresIn: number
}

/** POST /api/v1/pub/auth/login */
export function localLogin(req: LocalLoginRequest): Promise<LocalLoginResponse> {
  return http.post('/pub/auth/login', req, { silent: true })
}
