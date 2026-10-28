import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import ElementPlus from 'element-plus'
import { createPinia } from 'pinia'
import SecretListView from './SecretListView.vue'
import { getOrganizationsWithProjects } from '@/api/organization'
import { listEnvironments } from '@/api/env'
import { listFolders } from '@/api/folder'
import {
  getSecretTags,
  listSecretsByFolderGroup,
  updateFolderGroupSecrets,
  updateSecretTags,
  type SecretTag,
} from '@/api/secret'
import { createTag, listTags, type Tag } from '@/api/tag'
import TagCreateDialog from '@/components/TagCreateDialog.vue'
import type { Folder } from '@/types/folder'

const realNavigation = vi.hoisted(() => ({ enabled: false }))
vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-router')>()
  return {
    ...actual,
    useRoute: () => (realNavigation.enabled ? actual.useRoute() : { query: {} }),
    useRouter: () =>
      realNavigation.enabled
        ? actual.useRouter()
        : { replace: vi.fn(), push: vi.fn(), resolve: () => ({ fullPath: '' }) },
  }
})
vi.mock('@/composables/use-navigation-memory', () => ({
  useNavigationMemory: (_scope: string, defaults: Record<string, unknown>) => ({
    saved: defaults,
    track: vi.fn(),
  }),
}))
vi.mock('@/composables/use-manager-selection', () => ({
  useManagerSelection: () => ({ resolveManagerId: vi.fn() }),
}))
vi.mock('@/api/organization', () => ({ getOrganizationsWithProjects: vi.fn() }))
vi.mock('@/api/env', () => ({ listEnvironments: vi.fn() }))
vi.mock('@/api/audit', () => ({ listAuditRecords: vi.fn() }))
vi.mock('@/api/folder', () => ({
  createSecretFolder: vi.fn(),
  deleteFolder: vi.fn(),
  listFolders: vi.fn(),
  updateFolder: vi.fn(),
}))
vi.mock('@/api/secret', () => ({
  batchCreateSecrets: vi.fn(),
  deleteFolderGroupSecret: vi.fn(),
  getSecretBatchDetail: vi.fn(),
  getSecretHistory: vi.fn(),
  getSecretTags: vi.fn(),
  listSecretsByFolderGroup: vi.fn(),
  updateFolderGroupSecrets: vi.fn(),
  updateSecretTags: vi.fn(),
}))
vi.mock('@/api/tag', () => ({ createTag: vi.fn(), getTag: vi.fn(), listTags: vi.fn() }))

const credentialTag: SecretTag = {
  id: 'tag-1',
  code: 'credential',
  name: '凭据',
  allowValueSearch: false,
}
const databaseTag: Tag = {
  id: 'tag-2',
  tenantId: 'tenant-1',
  code: 'database',
  name: '数据库',
  remark: '数据库连接信息',
  allowValueSearch: true,
  createAt: '',
  updateAt: '',
}
const createdTag: Tag = {
  id: 'tag-new',
  tenantId: 'tenant-1',
  code: 'production',
  name: '生产配置',
  remark: '生产环境专用',
  allowValueSearch: false,
  createAt: '',
  updateAt: '',
}

function setDialogInput(selector: string, value: string): void {
  const input = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)
  expect(input).not.toBeNull()
  input!.value = value
  input!.dispatchEvent(new Event('input', { bubbles: true }))
}

beforeEach(() => {
  realNavigation.enabled = false
  vi.resetAllMocks()
  vi.mocked(getOrganizationsWithProjects).mockResolvedValue({
    orgList: [{ id: 'org-1', name: '研发组织', projectList: [{ id: 'project-1', name: '平台' }] }],
    collaborationProjectList: [],
  })
  vi.mocked(listEnvironments).mockResolvedValue([
    {
      id: 'env-1',
      projectId: 'project-1',
      code: 'dev',
      name: '开发',
      remark: '',
      orderNo: 10,
      isCheckPerm: false,
      createBy: '',
      updateBy: '',
      createAt: '',
      updateAt: '',
    },
  ])
  vi.mocked(listFolders).mockImplementation(async (request) => ({
    list:
      request.type === 'common'
        ? []
        : [
            {
              id: 'folder-1',
              groupId: 'folder-group-1',
              environmentId: 'env-1',
              parentId: null,
              level: 1,
              code: 'application',
              name: '应用配置',
              comment: '',
              type: 'customer',
              createdBy: '',
              createdByLabel: '',
              updatedBy: '',
              updatedByLabel: '',
              createdAt: '',
              updatedAt: '',
            },
          ],
    total: request.type === 'common' ? 0 : 1,
    pageNum: 1,
    pageSize: 6,
  }))
  vi.mocked(listSecretsByFolderGroup).mockResolvedValue({
    secretList: [
      {
        groupId: 'secret-group-1',
        key: 'DATABASE_PASSWORD',
        remark: '数据库密码',
        values: {
          dev: {
            secretId: 'secret-1',
            folderId: 'folder-1',
            value: 'test-value',
            version: 1,
            valueType: '',
            updateAt: '',
          },
        },
        tagList: [credentialTag],
      },
    ],
  })
  vi.mocked(getSecretTags).mockResolvedValue({
    groupId: 'secret-group-1',
    tenantId: 'tenant-1',
    tagList: [credentialTag],
  })
  vi.mocked(listTags).mockResolvedValue({
    list: [
      { ...credentialTag, tenantId: 'tenant-1', remark: '', createAt: '', updateAt: '' },
      databaseTag,
    ],
    total: 2,
  })
  vi.mocked(updateSecretTags).mockResolvedValue({
    groupId: 'secret-group-1',
    tenantId: 'tenant-1',
    tagList: [credentialTag, databaseTag],
  })
  vi.mocked(createTag).mockResolvedValue(createdTag)
})

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
  sessionStorage.clear()
  localStorage.clear()
})

function folderFixture(code: string, type: 'common' | 'customer'): Folder {
  return {
    id: `folder-${code}`,
    groupId: `group-${code}`,
    environmentId: 'env-1',
    parentId: null,
    level: 1,
    code,
    name: code,
    comment: '',
    type,
    createdBy: '',
    createdByLabel: '',
    updatedBy: '',
    updatedByLabel: '',
    createdAt: '',
    updatedAt: '',
  }
}

describe('SecretListView folder sections', () => {
  it('opens folder details without navigating and switches directly to editing', async () => {
    const wrapper = mount(SecretListView, {
      global: { plugins: [ElementPlus, createPinia()], stubs: { ManagerSelect: true } },
      attachTo: document.body,
    })
    await flushPromises()
    expect(wrapper.find('[aria-label="编辑应用配置"]').exists()).toBe(false)
    await wrapper.get('[aria-label="管理卡片"]').trigger('click')
    expect(wrapper.find('[aria-label="编辑应用配置"]').exists()).toBe(false)
    expect(wrapper.find('[aria-label="删除应用配置"]').exists()).toBe(true)
    const detail = wrapper.get('[aria-label="查看应用配置详情"]')
    expect(detail.element.nextElementSibling?.getAttribute('aria-label')).toBe('收藏')
    await detail.trigger('click')
    await flushPromises()
    const dialog = wrapper.getComponent({ name: 'CardEditDialog' })
    expect(listSecretsByFolderGroup).not.toHaveBeenCalled()
    expect(dialog.props('readOnly')).toBe(true)
    expect(dialog.get<HTMLInputElement>('input').element.value).toBe('应用配置')
    expect(dialog.get('input').attributes('readonly')).toBeDefined()
    expect(
      dialog.findAllComponents({ name: 'ElButton' }).some((button) => button.text() === '保存'),
    ).toBe(false)
    expect(dialog.find('.el-dialog__footer [aria-label="编辑"]').exists()).toBe(false)
    await dialog.get('.el-dialog__header [aria-label="编辑"]').trigger('click')
    await flushPromises()
    expect(dialog.props('readOnly')).toBe(false)
    expect(dialog.props('modelValue')).toBe(true)
    expect(dialog.get<HTMLInputElement>('input').element.value).toBe('应用配置')
    expect(dialog.get('input').attributes('readonly')).toBeUndefined()
    expect(
      dialog.findAllComponents({ name: 'ElButton' }).some((button) => button.text() === '保存'),
    ).toBe(true)
    wrapper.unmount()
  })

  it('records each directory step and restores it on browser back and forward', async () => {
    realNavigation.enabled = true
    vi.mocked(listFolders).mockImplementation(async (request) => {
      const list = request.parentFolderId
        ? [folderFixture('service-a', 'common')]
        : request.type === 'common'
          ? [folderFixture('groups', 'common')]
          : []
      return { list, total: list.length, pageNum: 1, pageSize: request.pageSize ?? 6 }
    })
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/profile', component: { render: () => null } },
        { path: '/app/secrets', name: 'SecretList', component: SecretListView },
      ],
    })
    await router.push('/profile')
    await router.push('/app/secrets')
    const wrapper = mount(defineComponent({ render: () => h(RouterView) }), {
      global: { plugins: [router, ElementPlus, createPinia()] },
      attachTo: document.body,
    })
    await flushPromises()
    await wrapper.get('article.vault-folder').trigger('click')
    await flushPromises()
    await wrapper.get('.vault-groups article').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.query.groupId).toBe('group-service-a')
    router.back()
    await flushPromises()
    expect(wrapper.find('.vault-groups article').exists()).toBe(true)
    expect(router.currentRoute.value.query.folderId).toBe('group-groups')
    expect(router.currentRoute.value.query.groupId).toBeUndefined()
    router.back()
    await flushPromises()
    expect(wrapper.find('article.vault-folder').exists()).toBe(true)
    expect(router.currentRoute.value.query.folderId).toBeUndefined()
    router.forward()
    await flushPromises()
    expect(wrapper.find('.vault-groups article').exists()).toBe(true)
    wrapper.unmount()
  })

  it('loads common folders separately, measures remaining height and keeps groups children scoped to their parent', async () => {
    const originalRect = HTMLElement.prototype.getBoundingClientRect
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const rect = originalRect.call(this)
      if (this.matches('.vault-page__content.is-folder-list')) {
        return { ...rect, width: 1000, height: 650 } as DOMRect
      }
      if (this.matches('.vault-folder-section--common')) {
        return { ...rect, width: 1000, height: 215 } as DOMRect
      }
      return rect
    })
    vi.mocked(listFolders).mockImplementation(async (request) => {
      if (request.parentFolderId) {
        return {
          list: [folderFixture('service-a', 'common')],
          total: 1,
          pageNum: 1,
          pageSize: request.pageSize ?? 6,
        }
      }
      const list =
        request.type === 'common'
          ? [folderFixture('groups', 'common'), folderFixture('global', 'common')]
          : [folderFixture('application', 'customer')]
      return { list, total: list.length, pageNum: 1, pageSize: request.pageSize ?? 6 }
    })
    const wrapper = mount(SecretListView, {
      global: { plugins: [ElementPlus, createPinia()] },
      attachTo: document.body,
    })
    await flushPromises()

    expect(wrapper.get('[aria-label="通用目录"]').findAll('article')).toHaveLength(2)
    expect(wrapper.get('[aria-label="用户目录"]').findAll('article')).toHaveLength(1)
    expect(wrapper.get('.vault-load-more').text()).toContain('已全部加载 3 个目录')
    expect(vi.mocked(listFolders).mock.calls.map(([request]) => request)).toEqual([
      { projectId: 'project-1', type: 'common', pageNum: 1, pageSize: 200 },
      { projectId: 'project-1', type: 'customer', pageNum: 1, pageSize: 8 },
    ])

    await wrapper.get('[aria-label="通用目录"] article').trigger('click')
    await flushPromises()
    const childRequest = vi.mocked(listFolders).mock.calls.at(-1)![0]
    expect(childRequest.parentFolderId).toBe('folder-groups')
    expect(childRequest.type).toBeUndefined()
    expect(childRequest.projectId).toBeUndefined()
    expect(wrapper.text()).toContain('service-a')
    wrapper.unmount()
  })

  it('counts the actual unique folders when both responses contain overlapping directories', async () => {
    const list = [
      folderFixture('groups', 'common'),
      folderFixture('global', 'common'),
      folderFixture('application', 'customer'),
    ]
    vi.mocked(listFolders).mockResolvedValue({ list, total: 3, pageNum: 1, pageSize: 200 })
    const wrapper = mount(SecretListView, {
      global: { plugins: [ElementPlus, createPinia()] },
      attachTo: document.body,
    })
    await flushPromises()

    expect(wrapper.findAll('article.vault-folder')).toHaveLength(3)
    expect(wrapper.get('.vault-load-more').text()).toContain('已全部加载 3 个目录')
    wrapper.unmount()
  })

  it('does not treat a failed common-folder request as an empty section', async () => {
    vi.mocked(listFolders).mockRejectedValueOnce(new Error('network unavailable'))
    const wrapper = mount(SecretListView, {
      global: { plugins: [ElementPlus, createPinia()] },
      attachTo: document.body,
    })
    await flushPromises()
    expect(listFolders).toHaveBeenCalledTimes(1)
    expect(wrapper.findAll('article.vault-folder')).toHaveLength(0)
    expect(wrapper.text()).toContain('加载失败')
    wrapper.unmount()
  })
})

describe('SecretListView tag column', () => {
  it('supports dragging and keyboard resizing from every table header', async () => {
    const wrapper = mount(SecretListView, {
      global: { plugins: [ElementPlus, createPinia()] },
      attachTo: document.body,
    })
    await flushPromises()
    await wrapper.get('article.vault-folder').trigger('click')
    await flushPromises()

    const labels = wrapper
      .findAll('.vault-table__resize-handle')
      .map((handle) => handle.attributes('aria-label'))
    expect(labels).toEqual([
      '调整密钥名称列宽',
      '调整开发环境列宽',
      '调整标签列宽',
      '调整说明列宽',
      '调整操作列宽',
    ])

    const handle = wrapper.get('[aria-label="调整密钥名称列宽"]')
    handle.element.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 200 }),
    )
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 280 }))
    window.dispatchEvent(new MouseEvent('mouseup'))
    await wrapper.vm.$nextTick()
    expect(wrapper.get('col.vault-table__column--key').attributes('style')).toContain('310px')

    await handle.trigger('keydown', { key: 'ArrowLeft' })
    expect(wrapper.get('col.vault-table__column--key').attributes('style')).toContain('300px')
    wrapper.unmount()
  })

  it('updates tags inline without creating a secret version when no secret content changed', async () => {
    const wrapper = mount(SecretListView, {
      global: { plugins: [ElementPlus, createPinia()] },
      attachTo: document.body,
    })
    await flushPromises()
    await wrapper.get('article.vault-folder').trigger('click')
    await flushPromises()

    expect(wrapper.findAll('th').map((header) => header.text())).toContain('标签')
    expect(wrapper.find('[aria-label="查看标签凭据详情"]').exists()).toBe(true)

    await wrapper.get('[aria-label="编辑密钥"]').trigger('click')
    await flushPromises()
    const editor = wrapper.get('.vault-table__tag-editor').getComponent({ name: 'ElSelect' })
    editor.vm.$emit('update:modelValue', ['tag-1', 'tag-2'])
    await flushPromises()

    expect(wrapper.get('input[aria-label="版本修改信息"]').attributes('placeholder')).toBe(
      '仅修改标签时无需填写',
    )
    await wrapper.get('[aria-label="保存修改"]').trigger('click')
    await flushPromises()

    expect(updateSecretTags).toHaveBeenCalledWith('secret-group-1', ['tag-1', 'tag-2'])
    expect(updateFolderGroupSecrets).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('shows name, code and description, then selects a tag created in the current tenant', async () => {
    const wrapper = mount(SecretListView, {
      global: { plugins: [ElementPlus, createPinia()] },
      attachTo: document.body,
    })
    await flushPromises()
    await wrapper.get('article.vault-folder').trigger('click')
    await flushPromises()
    await wrapper.get('[aria-label="编辑密钥"]').trigger('click')
    await flushPromises()

    const editor = wrapper.get('.vault-table__tag-editor').getComponent({ name: 'ElSelect' })
    await editor.get('.el-select__wrapper').trigger('click')
    await flushPromises()
    expect(document.body.textContent).toContain('数据库(database)')
    expect(document.body.textContent).toContain('数据库连接信息')

    document.querySelector<HTMLButtonElement>('[aria-label="新增标签"]')!.click()
    await flushPromises()
    expect(wrapper.findComponent(TagCreateDialog).exists()).toBe(true)
    setDialogInput('input[aria-label="标签 Code"]', 'production')
    setDialogInput('input[aria-label="标签名称"]', '生产配置')
    setDialogInput('textarea[aria-label="标签描述"]', '生产环境专用')
    document.querySelector<HTMLElement>('[aria-label="允许值检索"]')!.click()
    ;[...document.querySelectorAll('button')]
      .find((button) => button.textContent?.trim() === '创建')!
      .click()
    await flushPromises()

    expect(createTag).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      code: 'production',
      name: '生产配置',
      remark: '生产环境专用',
      allowValueSearch: false,
    })
    expect(editor.props('modelValue')).toContain('tag-new')
    wrapper.unmount()
  })
})

describe('SecretListView card pagination', () => {
  it('appends the next folder page through the load-more action', async () => {
    const firstPageFolder: Folder = {
      id: 'folder-1',
      groupId: 'folder-group-1',
      environmentId: 'env-1',
      parentId: null,
      level: 1,
      code: 'application',
      name: '应用配置',
      comment: '',
      type: 'customer',
      createdBy: '',
      createdByLabel: '',
      updatedBy: '',
      updatedByLabel: '',
      createdAt: '',
      updatedAt: '',
    }
    const secondPageFolder = {
      ...firstPageFolder,
      id: 'folder-7',
      groupId: 'folder-group-7',
      code: 'release',
      name: '发布配置',
    }
    const thirdPageFolder = {
      ...firstPageFolder,
      id: 'folder-13',
      groupId: 'folder-group-13',
      code: 'archive',
      name: '归档配置',
    }
    vi.mocked(listFolders).mockImplementation(async (request) => ({
      list:
        request.type === 'common'
          ? []
          : request.pageNum === 1
            ? Array.from({ length: 6 }, (_, index) => ({
                ...firstPageFolder,
                id: `folder-${index + 1}`,
                groupId: `folder-group-${index + 1}`,
                code: `application-${index + 1}`,
                name: `应用配置${index + 1}`,
              }))
            : request.pageNum === 2
              ? Array.from({ length: 6 }, (_, index) => ({
                  ...secondPageFolder,
                  id: `folder-${index + 7}`,
                  groupId: `folder-group-${index + 7}`,
                  code: `release-${index + 7}`,
                  name: `发布配置${index + 7}`,
                }))
              : [thirdPageFolder],
      total: request.type === 'common' ? 0 : 13,
      pageNum: request.pageNum ?? 1,
      pageSize: 6,
    }))

    const wrapper = mount(SecretListView, {
      global: { plugins: [ElementPlus, createPinia()] },
      attachTo: document.body,
    })
    await flushPromises()

    expect(wrapper.findAll('article.vault-folder')).toHaveLength(6)
    expect(wrapper.get('.vault-load-more').text()).toContain('已加载 6 / 13')
    const scrollContainer = wrapper.get('.vault-page__content.is-folder-list').element
    Object.defineProperties(scrollContainer, {
      scrollHeight: { configurable: true, value: 1000 },
      scrollTop: { configurable: true, value: 850 },
      clientHeight: { configurable: true, value: 100 },
    })
    await wrapper.get('.vault-page__content.is-folder-list').trigger('scroll')
    await flushPromises()

    expect(wrapper.findAll('article.vault-folder')).toHaveLength(12)
    expect(wrapper.get('.vault-load-more').text()).toContain('已加载 12 / 13')
    await wrapper.get('.vault-load-more .el-button').trigger('click')
    await flushPromises()

    expect(wrapper.findAll('article.vault-folder')).toHaveLength(13)
    expect(wrapper.get('.vault-load-more').text()).toContain('已全部加载 13')
    expect(
      vi.mocked(listFolders).mock.calls.map(([request]) => [request.type, request.pageNum]),
    ).toEqual([
      ['common', 1],
      ['customer', 1],
      ['customer', 2],
      ['customer', 3],
    ])
    wrapper.unmount()
  })
})
