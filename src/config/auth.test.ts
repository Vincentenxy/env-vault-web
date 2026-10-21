import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearCompanyLoginRedirect,
  getAuthConfig,
  getCompanyLoginUrl,
  isCompanyAuth,
  loadAuthConfig,
  redirectToCompanyLogin,
  redirectToCompanyLogout,
} from './auth'

const platform = vi.hoisted(() => ({ embedded: false }))
vi.mock('@/utils/platform', () => ({
  get isPlatformEmbedded() {
    return platform.embedded
  },
}))

async function configure(value: unknown = {}): Promise<void> {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => value }),
  )
  await loadAuthConfig()
}

describe('company login entry', () => {
  beforeEach(async () => {
    platform.embedded = false
    sessionStorage.clear()
    vi.stubEnv('VITE_AUTH_MODE', 'company')
    vi.stubEnv('VITE_COMPANY_LOGIN_URL', '/tologin.do')
    vi.stubEnv('VITE_COMPANY_RETURN_URL_PARAM', 'url')
    await configure()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('uses the platform login path and preserves the complete return URL', () => {
    vi.stubEnv('VITE_COMPANY_LOGIN_URL', '/tologin.do')
    const target = new URL(getCompanyLoginUrl())
    expect(target.origin).toBe(window.location.origin)
    expect(target.pathname).toBe('/tologin.do')
    expect(target.searchParams.get('url')).toBe(window.location.href)
  })

  it('accepts a different provider and configurable return parameter without rebuilding', async () => {
    await configure({
      loginUrl: 'https://login.example.test/login?client=envvault',
      returnUrlParam: 'service',
    })
    const target = new URL(getCompanyLoginUrl())
    expect(target.origin).toBe('https://login.example.test')
    expect(target.searchParams.get('client')).toBe('envvault')
    expect(target.searchParams.get('service')).toBe(window.location.href)
    expect(target.searchParams.has('url')).toBe(false)
  })

  it('returns to the business page instead of the intermediate login page', () => {
    vi.stubEnv('VITE_COMPANY_LOGIN_URL', '/tologin.do')
    const target = new URL(getCompanyLoginUrl('/envvault/app/secrets?projectId=example'))
    expect(target.searchParams.get('url')).toBe(
      `${window.location.origin}/envvault/app/secrets?projectId=example`,
    )
  })

  it('does not accept an external return address', () => {
    vi.stubEnv('VITE_COMPANY_LOGIN_URL', '/tologin.do')
    const target = new URL(getCompanyLoginUrl('https://example.test/'))
    expect(target.searchParams.get('url')).toBe(window.location.href)
  })

  it('can use a fixed gateway entry without appending return parameters', async () => {
    await configure({ loginUrl: '/oauth2/start?rd=%2Fenvvault%2F', returnUrlParam: '' })
    const target = new URL(getCompanyLoginUrl())
    expect(target.search).toBe('?rd=%2Fenvvault%2F')
  })

  it('loads runtime settings before exposing the authentication mode', async () => {
    await configure({ mode: 'local', loginLabel: '企业登录' })
    expect(isCompanyAuth).toBe(false)
    expect(getAuthConfig().loginLabel).toBe('企业登录')
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth-config.json'),
      expect.objectContaining({ cache: 'no-store', credentials: 'same-origin', redirect: 'error' }),
    )
  })

  it('uses build defaults only when the optional runtime file is absent', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }))
    await loadAuthConfig()
    expect(isCompanyAuth).toBe(true)
    expect(getAuthConfig().loginUrl).toBe('/tologin.do')
  })

  it.each([
    null,
    [],
    { mode: 'invalid' },
    { loginUrl: '' },
    { loginUrl: 'javascript:alert(1)' },
    { loginUrl: 'https://user:password@example.test' },
    { loginUrl: '/login' },
    { loginLabel: '' },
    { returnUrlParam: '\nurl' },
    { loginURL: '/sso' },
  ])('rejects malformed configuration %j instead of changing modes', async (value) => {
    await expect(configure(value)).rejects.toThrow()
    expect(isCompanyAuth).toBe(true)
  })

  it('does not fall back to local login on configuration network or HTTP errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    await expect(loadAuthConfig()).rejects.toThrow('offline')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }))
    await expect(loadAuthConfig()).rejects.toThrow('认证配置加载失败')
  })

  it('aborts a stuck configuration request', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url, options) =>
          new Promise((_resolve, reject) => {
            options.signal.addEventListener('abort', () => reject(new Error('aborted')))
          }),
      ),
    )
    const pending = expect(loadAuthConfig()).rejects.toThrow('aborted')
    await vi.advanceTimersByTimeAsync(10_000)
    await pending
  })

  it('limits repeated automatic redirects but permits an explicit login retry', () => {
    const assign = vi.fn()
    const location = { origin: window.location.origin, href: window.location.href, assign }
    vi.stubGlobal('window', { location })
    expect(redirectToCompanyLogin(undefined, true)).toBe(true)
    expect(redirectToCompanyLogin(undefined, true)).toBe(false)
    expect(assign).toHaveBeenCalledOnce()
    expect(redirectToCompanyLogin()).toBe(true)
    clearCompanyLoginRedirect()
    expect(redirectToCompanyLogin(undefined, true)).toBe(true)
  })

  it('returns to the parent route when embedded and redirects the parent window', () => {
    platform.embedded = true
    const assign = vi.fn()
    const parentLocation = {
      origin: window.location.origin,
      href: `${window.location.origin}/app-envvault/app/secrets?folder=one`,
      assign,
    }
    vi.stubGlobal('window', { location: window.location, parent: { location: parentLocation } })
    redirectToCompanyLogin('/ignored-frame-route')
    expect(new URL(assign.mock.lastCall?.[0] ?? '').searchParams.get('url')).toBe(
      parentLocation.href,
    )
  })

  it('can exit a configured provider without conflating local and platform logout', async () => {
    expect(redirectToCompanyLogout()).toBe(false)
    await configure({ logoutUrl: '/sso/logout?client=vault', logoutReturnUrlParam: 'redirect' })
    const assign = vi.fn()
    vi.stubGlobal('window', {
      location: { origin: window.location.origin, href: window.location.href, assign },
    })
    expect(redirectToCompanyLogout()).toBe(true)
    const target = new URL(assign.mock.lastCall?.[0] ?? '')
    expect(target.pathname).toBe('/sso/logout')
    expect(target.searchParams.get('client')).toBe('vault')
    expect(target.searchParams.get('redirect')).toBe(`${window.location.origin}/login`)
    await configure({ mode: 'local', logoutUrl: '/sso/logout' })
    expect(redirectToCompanyLogout()).toBe(false)
  })
})
