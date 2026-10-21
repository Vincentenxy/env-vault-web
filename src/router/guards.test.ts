import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter, type RouteRecordRaw } from 'vue-router'
import { installGuards } from './guards'

const stores = vi.hoisted(() => ({
  authenticated: true,
  masterKeyStatus: null as { ready: boolean } | null,
  fetchStatus: vi.fn(),
  company: false,
  ensureCompanySession: vi.fn(),
}))

vi.mock('@/config/auth', () => ({
  get isCompanyAuth() {
    return stores.company
  },
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    get isAuthenticated() {
      return stores.authenticated
    },
    ensureCompanySession: stores.ensureCompanySession,
  }),
}))

vi.mock('@/stores/master-key', () => ({
  useMasterKeyStore: () => ({
    status: stores.masterKeyStatus,
    fetchStatus: stores.fetchStatus,
  }),
}))

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: { template: '<div />' },
  },
  {
    path: '/masterKey',
    name: 'MasterKeySetup',
    component: { template: '<div />' },
    meta: { requiresAuth: true },
  },
  {
    path: '/app/settings/users',
    name: 'UserManagement',
    component: { template: '<div />' },
    meta: { requiresAuth: true, requiresMasterKey: true },
  },
]

describe('router guards', () => {
  beforeEach(() => {
    stores.authenticated = true
    stores.masterKeyStatus = null
    stores.fetchStatus.mockReset()
    stores.company = false
    stores.ensureCompanySession.mockReset()
  })

  it('blocks direct business-route navigation while the master key is not ready', async () => {
    stores.fetchStatus.mockResolvedValue({ ready: false })
    const router = createRouter({ history: createMemoryHistory(), routes })
    installGuards(router)

    await router.push('/app/settings/users')
    await router.isReady()

    expect(router.currentRoute.value.name).toBe('MasterKeySetup')
    expect(router.currentRoute.value.query.redirect).toBe('/app/settings/users')
    expect(stores.fetchStatus).toHaveBeenCalledOnce()
  })

  it('allows business-route navigation after the master key is ready', async () => {
    stores.fetchStatus.mockResolvedValue({ ready: true })
    const router = createRouter({ history: createMemoryHistory(), routes })
    installGuards(router)

    await router.push('/app/settings/users')
    await router.isReady()

    expect(router.currentRoute.value.name).toBe('UserManagement')
    expect(stores.fetchStatus).toHaveBeenCalledOnce()
  })

  it('checks authentication before querying the master key status', async () => {
    stores.authenticated = false
    const router = createRouter({ history: createMemoryHistory(), routes })
    installGuards(router)

    await router.push('/app/settings/users')
    await router.isReady()

    expect(router.currentRoute.value.name).toBe('Login')
    expect(router.currentRoute.value.query.redirect).toBe('/app/settings/users')
    expect(stores.fetchStatus).not.toHaveBeenCalled()
  })

  it('fails closed when the master key status cannot be queried', async () => {
    stores.fetchStatus.mockRejectedValue(new Error('network error'))
    const router = createRouter({ history: createMemoryHistory(), routes })
    installGuards(router)

    await router.push('/app/settings/users')
    await router.isReady()

    expect(router.currentRoute.value.name).toBe('MasterKeySetup')
    expect(router.currentRoute.value.query.redirect).toBe('/app/settings/users')
  })

  it('verifies company identity before checking local login state on direct navigation', async () => {
    stores.company = true
    stores.authenticated = false
    stores.ensureCompanySession.mockImplementation(async () => {
      stores.authenticated = true
    })
    stores.fetchStatus.mockResolvedValue({ ready: true })
    const router = createRouter({ history: createMemoryHistory(), routes })
    installGuards(router)

    await router.push('/app/settings/users')

    expect(router.currentRoute.value.name).toBe('UserManagement')
    expect(stores.ensureCompanySession).toHaveBeenCalledOnce()
  })

  it('does not enter business pages when company identity cannot be verified', async () => {
    stores.company = true
    stores.authenticated = false
    const router = createRouter({ history: createMemoryHistory(), routes })
    installGuards(router)

    await router.push('/app/settings/users')

    expect(router.currentRoute.value.name).toBe('Login')
    expect(stores.fetchStatus).not.toHaveBeenCalled()
  })
})
