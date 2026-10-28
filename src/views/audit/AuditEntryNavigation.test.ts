import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import ElementPlus, { ElSelect } from 'element-plus'
import { listGlobalAuditRecords } from '@/api/audit'
import { listTenants } from '@/api/tenant'
import { listManagedUsers, type UserManagementListItem } from '@/api/user'
import {
  listPersonalSecretHistory,
  listPersonalSecrets,
  type PersonalSecret,
} from '@/api/personal-secret'
import UserManagementView from '@/views/settings/UserManagementView.vue'
import PersonalSecretPanel from '@/views/settings/components/PersonalSecretPanel.vue'
import AuditLogView from './AuditLogView.vue'

vi.mock('@/api/audit', () => ({ listGlobalAuditRecords: vi.fn() }))
vi.mock('@/api/tenant', () => ({ listTenants: vi.fn() }))
vi.mock('@/api/user', () => ({ listManagedUsers: vi.fn() }))
vi.mock('@/api/personal-secret', () => ({
  listPersonalSecrets: vi.fn(),
  listPersonalSecretHistory: vi.fn(),
  createPersonalSecret: vi.fn(),
  updatePersonalSecret: vi.fn(),
  deletePersonalSecret: vi.fn(),
  revealPersonalSecretHistory: vi.fn(),
}))

const user: UserManagementListItem = {
  id: 'database-user-uuid',
  userId: 'staff-1001',
  nickname: '王明',
  username: 'wangming',
  email: 'wangming@example.com',
  phone: '',
  tenantId: 'tenant-1',
  tenantName: '研发租户',
  orgId: 'org-1',
  orgName: '研发中心',
  isBlocked: false,
  createAt: '2026-01-01T00:00:00Z',
  updateAt: '2026-10-01T00:00:00Z',
}
const secret: PersonalSecret = {
  id: 'personal-secret-uuid',
  name: '工作平台',
  credentialType: 'password',
  account: 'private-account',
  loginUrl: 'https://example.com',
  remark: '',
  value: 'private-password-do-not-place-in-url',
  version: 2,
  createBy: 'staff-1001',
  createByName: '王明',
  updateBy: 'staff-1001',
  updateByName: '王明',
  createAt: '2026-01-01T00:00:00Z',
  updateAt: '2026-10-01T00:00:00Z',
}
const wrappers: ReturnType<typeof mount>[] = []

async function setup(path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/app/settings/users', name: 'UserManagement', component: UserManagementView },
      { path: '/app/settings/profile', name: 'UserProfile', component: PersonalSecretPanel },
      { path: '/app/audit', name: 'AuditLog', component: AuditLogView },
    ],
  })
  await router.push(path)
  await router.isReady()
  const wrapper = mount(RouterView, {
    attachTo: document.body,
    global: {
      plugins: [ElementPlus, router],
      stubs: { UserEditDialog: true, LockedUserSecretDialog: true },
    },
  })
  wrappers.push(wrapper)
  await flushPromises()
  return { wrapper, router }
}

beforeEach(() => {
  vi.resetAllMocks()
  sessionStorage.clear()
  vi.mocked(listTenants).mockResolvedValue({
    pageNum: 1,
    pageSize: 200,
    total: 1,
    list: [{ id: 'tenant-1', code: 'tenant', name: '研发租户' }],
  })
  vi.mocked(listManagedUsers).mockResolvedValue({
    pageNum: 1,
    pageSize: 20,
    total: 1,
    list: [user],
  })
  vi.mocked(listPersonalSecrets).mockResolvedValue({ total: 1, list: [secret] })
  vi.mocked(listPersonalSecretHistory).mockResolvedValue({ total: 0, list: [] })
  vi.mocked(listGlobalAuditRecords).mockResolvedValue({ total: 0, list: [] })
})
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  document.body.innerHTML = ''
  sessionStorage.clear()
})

describe('操作记录快捷入口', () => {
  it('用户行按工号查询用户资料日志，保留编辑入口', async () => {
    const { wrapper, router } = await setup('/app/settings/users')
    expect(wrapper.find('[aria-label="编辑王明的用户信息"]').exists()).toBe(true)
    await wrapper.get('[aria-label="查看王明的操作记录"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('AuditLog')
    expect(router.currentRoute.value.query).toEqual({
      resourceType: 'user',
      resourceId: user.userId,
      timeRange: 'all',
      pageNum: '1',
      pageSize: '20',
    })
    expect(listGlobalAuditRecords).toHaveBeenLastCalledWith(
      expect.objectContaining({
        resourceType: 'user',
        resourceId: user.userId,
        createBy: undefined,
        startAt: undefined,
        endAt: undefined,
      }),
      expect.any(AbortSignal),
    )
    expect(router.currentRoute.value.fullPath).not.toContain(user.id)
  })

  it('用户列表查询记录对应全部租户或当前租户，返回列表保留租户选择', async () => {
    const { wrapper, router } = await setup('/app/settings/users')
    await wrapper.get('[aria-label="查看用户列表查询记录"]').trigger('click')
    await flushPromises()
    expect(listGlobalAuditRecords).toHaveBeenLastCalledWith(
      expect.objectContaining({ resourceType: 'userCollection', resourceId: 'all' }),
      expect.any(AbortSignal),
    )
    router.back()
    await flushPromises()
    const select = wrapper.getComponent(ElSelect)
    select.vm.$emit('update:modelValue', 'tenant-1')
    select.vm.$emit('change', 'tenant-1')
    await flushPromises()
    await wrapper.get('[aria-label="查看用户列表查询记录"]').trigger('click')
    await flushPromises()
    expect(listGlobalAuditRecords).toHaveBeenLastCalledWith(
      expect.objectContaining({ resourceType: 'userCollection', resourceId: 'tenant-1' }),
      expect.any(AbortSignal),
    )
    router.back()
    await flushPromises()
    expect(wrapper.getComponent(ElSelect).props('modelValue')).toBe('tenant-1')
  })

  it('个人密钥按密钥 ID 查询操作记录，与历史版本入口独立，链接不携带密码', async () => {
    const { wrapper, router } = await setup('/app/settings/profile')
    expect(wrapper.text()).not.toContain(secret.value)
    expect(wrapper.find('[aria-label="历史版本"]').exists()).toBe(true)
    await wrapper.get('[aria-label="查看工作平台的操作记录"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({
      resourceType: 'personalSecret',
      resourceId: secret.id,
      timeRange: 'all',
      pageNum: '1',
      pageSize: '20',
    })
    expect(listGlobalAuditRecords).toHaveBeenLastCalledWith(
      expect.objectContaining({
        resourceType: 'personalSecret',
        resourceId: secret.id,
        createBy: undefined,
      }),
      expect.any(AbortSignal),
    )
    expect(listPersonalSecretHistory).not.toHaveBeenCalled()
    expect(router.currentRoute.value.fullPath).not.toContain(secret.value)
    expect(router.currentRoute.value.fullPath).not.toContain(secret.account)
    router.back()
    await flushPromises()
    await wrapper.get('[aria-label="历史版本"]').trigger('click')
    await flushPromises()
    expect(listPersonalSecretHistory).toHaveBeenLastCalledWith({
      personalSecretId: secret.id,
      pageNum: 1,
      pageSize: 10,
    })
    expect(router.currentRoute.value.name).toBe('UserProfile')
  })
})
