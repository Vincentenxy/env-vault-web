import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ApiError } from '@/types/api'
import { useAuthStore } from './auth'
import { tokenStore } from '@/utils/token'

const mocks = vi.hoisted(() => ({
  company: true,
  getMe: vi.fn(),
  getStatus: vi.fn(),
  masterKey: { status: null as { ready: boolean } | null },
}))

vi.mock('@/config/auth', () => ({
  clearCompanyLoginRedirect: vi.fn(),
  get isCompanyAuth() {
    return mocks.company
  },
}))
vi.mock('@/api/me', () => ({ getMe: mocks.getMe }))
vi.mock('@/api/master-key', () => ({ getMasterKeyStatus: mocks.getStatus }))
vi.mock('@/stores/master-key', () => ({ useMasterKeyStore: () => mocks.masterKey }))
vi.mock('@/stores/rbac', () => ({ useRbacStore: () => ({ clear: vi.fn() }) }))
vi.mock('@/stores/user', () => ({ useUserStore: () => ({ clear: vi.fn() }) }))

const user = { id: 'user-id', userId: '101', nickname: 'Tester' }
const starting = () => new ApiError({ code: -2, httpStatus: 200, msg: '系统启动中' })

describe('company authentication', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    tokenStore.clear()
    vi.clearAllMocks()
    mocks.company = true
    mocks.masterKey.status = null
  })

  it('ignores persisted local credentials and confirms identity without a local token', async () => {
    localStorage.setItem('envvault.auth.token', JSON.stringify('old-local-token'))
    mocks.getMe.mockResolvedValue(user)
    const auth = useAuthStore()

    expect(auth.isAuthenticated).toBe(false)
    expect(tokenStore.get()).toBe('')
    await auth.ensureCompanySession()

    expect(auth.isAuthenticated).toBe(true)
    expect(auth.currentUser).toEqual(user)
    expect(mocks.getMe).toHaveBeenCalledWith({ silent: true, authProbe: true })
    expect(localStorage.getItem('envvault.auth.token')).toBe(JSON.stringify('old-local-token'))
  })

  it('deduplicates startup identity requests', async () => {
    let finish!: (value: typeof user) => void
    mocks.getMe.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    const auth = useAuthStore()
    const first = auth.ensureCompanySession()
    const second = auth.ensureCompanySession()

    expect(auth.initializingSession).toBe(true)
    expect(mocks.getMe).toHaveBeenCalledOnce()
    finish(user)
    await Promise.all([first, second])
    await auth.ensureCompanySession()

    expect(auth.checkingSession).toBe(false)
    expect(mocks.getMe).toHaveBeenCalledOnce()
  })

  it('verifies the protected startup endpoint instead of treating -2 as authentication', async () => {
    mocks.getMe.mockRejectedValue(starting())
    mocks.getStatus.mockResolvedValue({ ready: false })
    const auth = useAuthStore()

    await auth.ensureCompanySession()

    expect(auth.isAuthenticated).toBe(true)
    expect(auth.currentUser).toBeNull()
    expect(mocks.getStatus).toHaveBeenCalledWith({ silent: true, authProbe: true })
    expect(mocks.masterKey.status).toEqual({ ready: false })
  })

  it('rejects missing identity even when /auth/me first returns -2', async () => {
    mocks.getMe.mockRejectedValue(starting())
    mocks.getStatus.mockRejectedValue(new ApiError({ code: 401, httpStatus: 401, msg: '未登录' }))
    const auth = useAuthStore()

    await auth.ensureCompanySession()

    expect(auth.isAuthenticated).toBe(false)
    expect(auth.sessionUnauthorized).toBe(true)
  })

  it.each([403, 500])(
    'keeps HTTP %s errors visible without treating them as expired login',
    async (httpStatus) => {
      mocks.getMe.mockRejectedValue(new ApiError({ code: httpStatus, httpStatus, msg: '检查失败' }))
      const auth = useAuthStore()

      await auth.ensureCompanySession()

      expect(auth.isAuthenticated).toBe(false)
      expect(auth.sessionUnauthorized).toBe(false)
      expect(auth.sessionError).toBe('检查失败')
    },
  )

  it('can retry identity verification after a failed attempt', async () => {
    mocks.getMe.mockRejectedValueOnce(new Error('Network Error')).mockResolvedValue(user)
    const auth = useAuthStore()
    await auth.ensureCompanySession()
    expect(auth.isAuthenticated).toBe(false)

    await auth.ensureCompanySession(true)

    expect(auth.isAuthenticated).toBe(true)
    expect(auth.sessionError).toBe('')
  })

  it('preserves token-based local login', async () => {
    mocks.company = false
    localStorage.setItem('envvault.auth.token', JSON.stringify('local-token'))
    const auth = useAuthStore()

    await auth.ensureCompanySession()

    expect(auth.isAuthenticated).toBe(true)
    expect(tokenStore.get()).toBe('local-token')
    expect(mocks.getMe).not.toHaveBeenCalled()
  })
})
