import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AxiosAdapter } from 'axios'
import { http } from './http'
import { tokenStore } from '@/utils/token'

const mocks = vi.hoisted(() => ({ company: true, redirect: vi.fn(), error: vi.fn() }))
vi.mock('@/config/auth', () => ({
  get isCompanyAuth() {
    return mocks.company
  },
  redirectToCompanyLogin: mocks.redirect,
}))
vi.mock('@/utils/notify', () => ({ notify: { error: mocks.error } }))

describe('authentication HTTP boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.company = true
    tokenStore.set('old-local-token')
  })

  it('does not send local Authorization in company mode', async () => {
    const adapter: AxiosAdapter = async (config) => {
      expect(config.headers.has('Authorization')).toBe(false)
      expect(config.headers.has('x-request-id')).toBe(true)
      return {
        data: { code: 0, msg: 'success', data: {} },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      }
    }
    await http.get('/auth/me', { headers: { Authorization: 'Bearer old-local-token' }, adapter })
  })

  it('still sends local Authorization in local mode', async () => {
    mocks.company = false
    const adapter: AxiosAdapter = async (config) => {
      expect(config.headers.get('Authorization')).toBe('Bearer old-local-token')
      return {
        data: { code: 0, msg: 'success', data: {} },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      }
    }
    await http.get('/auth/me', { adapter })
  })

  it.each([-2, 401, 403])(
    'leaves bootstrap code %s to the session check without redirecting',
    async (code) => {
      const adapter: AxiosAdapter = async (config) => ({
        data: { code, msg: 'probe failed', data: null },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      })

      await expect(http.get('/auth/me', { adapter, authProbe: true })).rejects.toMatchObject({
        code,
      })
      expect(mocks.redirect).not.toHaveBeenCalled()
      expect(mocks.error).not.toHaveBeenCalled()
    },
  )
})
