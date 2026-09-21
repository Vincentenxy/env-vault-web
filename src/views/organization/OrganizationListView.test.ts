import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createPinia } from 'pinia'
import OrganizationListView from './OrganizationListView.vue'
import { getOrganizationsWithProjects, listOrganizations } from '@/api/organization'
import { listProjects } from '@/api/project'
import { getTenantWithOrgProject, listTenants } from '@/api/tenant'

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@/composables/use-navigation-memory', () => ({
  useNavigationMemory: (_scope: string, defaults: Record<string, unknown>) => ({
    saved: defaults,
    track: vi.fn(),
  }),
}))
vi.mock('@/api/organization', () => ({
  getOrganizationsWithProjects: vi.fn(),
  listOrganizations: vi.fn(),
  updateOrganization: vi.fn(),
}))
vi.mock('@/api/project', () => ({
  listProjects: vi.fn(),
  updateProject: vi.fn(),
}))
vi.mock('@/api/tenant', () => ({
  getTenantWithOrgProject: vi.fn(),
  listTenants: vi.fn(),
  updateTenant: vi.fn(),
}))

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getTenantWithOrgProject).mockResolvedValue({ tenantList: [] })
  vi.mocked(getOrganizationsWithProjects).mockResolvedValue({
    orgList: [],
    collaborationProjectList: [],
  })
  vi.mocked(listOrganizations).mockResolvedValue({
    list: [],
    total: 0,
    pageNum: 1,
    pageSize: 10,
  })
  vi.mocked(listProjects).mockResolvedValue({
    list: [],
    total: 0,
    pageNum: 1,
    pageSize: 10,
  })
})

afterEach(() => {
  document.body.innerHTML = ''
  sessionStorage.clear()
  localStorage.clear()
})

describe('OrganizationListView card pagination', () => {
  it('appends the next tenant page through the load-more action', async () => {
    const makeTenant = (id: string) => ({
      id,
      code: id,
      name: `租户${id}`,
      remark: '',
      createdAt: '',
      updatedAt: '',
    })
    vi.mocked(listTenants).mockImplementation(async (request) => ({
      list:
        request?.pageNum === 1
          ? Array.from({ length: 10 }, (_, index) => makeTenant(`tenant-${index + 1}`))
          : request?.pageNum === 2
            ? Array.from({ length: 10 }, (_, index) => makeTenant(`tenant-${index + 11}`))
            : [makeTenant('tenant-21')],
      total: 21,
      pageNum: request?.pageNum ?? 1,
      pageSize: 10,
    }))

    const wrapper = mount(OrganizationListView, {
      global: { plugins: [ElementPlus, createPinia()] },
    })
    await flushPromises()

    expect(wrapper.findAll('.resource-card')).toHaveLength(10)
    expect(wrapper.get('.resource-load-more').text()).toContain('已加载 10 / 21')
    const scrollContainer = wrapper.get('.organization-page').element
    Object.defineProperties(scrollContainer, {
      scrollHeight: { configurable: true, value: 1000 },
      scrollTop: { configurable: true, value: 850 },
      clientHeight: { configurable: true, value: 100 },
    })
    await wrapper.get('.organization-page').trigger('scroll')
    await flushPromises()

    expect(wrapper.findAll('.resource-card')).toHaveLength(20)
    expect(wrapper.get('.resource-load-more').text()).toContain('已加载 20 / 21')
    await wrapper.get('.resource-load-more .el-button').trigger('click')
    await flushPromises()

    expect(wrapper.findAll('.resource-card')).toHaveLength(21)
    expect(wrapper.get('.resource-load-more').text()).toContain('已全部加载 21')
    expect(vi.mocked(listTenants).mock.calls.map(([request]) => request?.pageNum)).toEqual([
      1, 2, 3,
    ])
    wrapper.unmount()
  })
})
