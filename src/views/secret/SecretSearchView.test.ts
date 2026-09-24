import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus, { ElCascader, ElCheckboxGroup, ElPagination, ElSelect } from 'element-plus'
import SecretSearchView from './SecretSearchView.vue'
import { getTenantWithOrgProject } from '@/api/tenant'
import { listEnvironments } from '@/api/env'
import { listFolders } from '@/api/folder'
import type { Environment } from '@/types/env'
import { listSecretSearchTags, searchSecrets } from '@/api/secret-search'
import { createSecretSearchPreview } from './secret-search.mock'
import type { SecretSearchResultPage } from '@/types/secret-search'

vi.mock('@/api/tenant', () => ({ getTenantWithOrgProject: vi.fn() }))
vi.mock('@/api/env', () => ({ listEnvironments: vi.fn() }))
vi.mock('@/api/folder', () => ({ listFolders: vi.fn() }))
vi.mock('@/api/secret-search', () => ({
  searchSecrets: vi.fn(),
  listSecretSearchTags: vi.fn(),
}))

function env(code: string, orderNo: number): Environment {
  return {
    id: code,
    code,
    name: code,
    orderNo,
    projectId: 'project-1',
    remark: '',
    isCheckPerm: false,
    createBy: '',
    updateBy: '',
    createAt: '',
    updateAt: '',
  }
}

const wrappers: ReturnType<typeof mount>[] = []
async function setup() {
  const wrapper = mount(SecretSearchView, { global: { plugins: [ElementPlus] } })
  wrappers.push(wrapper)
  await flushPromises()
  return wrapper
}

async function select(wrapper: Awaited<ReturnType<typeof setup>>, path: string[] | undefined) {
  wrapper.getComponent(ElCascader).vm.$emit('update:modelValue', path?.length ? [path] : [])
  await flushPromises()
}

beforeEach(() => {
  vi.resetAllMocks()
  sessionStorage.clear()
  vi.mocked(getTenantWithOrgProject).mockResolvedValue({
    tenantList: [
      {
        id: 'tenant-1',
        name: '租户',
        orgList: [
          {
            id: 'org-1',
            name: '组织',
            projectList: [
              { id: 'project-1', name: '项目一' },
              { id: 'project-2', name: '项目二' },
            ],
          },
        ],
      },
    ],
  })
  vi.mocked(listEnvironments).mockResolvedValue([env('prod', 40), env('dev', 10)])
  vi.mocked(listFolders).mockResolvedValue({ list: [], total: 0, pageNum: 1, pageSize: 200 })
  vi.mocked(searchSecrets).mockResolvedValue({ list: [], total: 0 })
  vi.mocked(listSecretSearchTags).mockResolvedValue({ list: [], total: 0 })
})
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  document.body.innerHTML = ''
})

describe('秘钥检索范围与分页', () => {
  it('在搜索框内部展示 Key、备注和短关键词规则说明', async () => {
    const wrapper = await setup()
    const helpButton = wrapper.get('.secret-search__input [aria-label="搜索说明"]')
    await helpButton.trigger('click')
    await flushPromises()

    expect(document.body.textContent).toContain('同时匹配秘钥 Key 和备注')
    expect(document.body.textContent).toContain('至少 3 个连续的中文、字母或数字')
    expect(document.body.textContent).toContain('选择项目或文件夹后，可搜索 1 至 2 个字符')
  })

  it('租户和组织查询全部环境，仅选择项目时按排序默认选第一个环境', async () => {
    const wrapper = await setup()
    await select(wrapper, ['tenant-1'])
    expect(wrapper.findComponent(ElCheckboxGroup).exists()).toBe(false)
    await select(wrapper, ['tenant-1', 'org-1'])
    expect(listEnvironments).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('查询所选范围下全部环境内的秘钥')
    await select(wrapper, ['tenant-1', 'org-1', 'project-1'])
    expect(listEnvironments).toHaveBeenCalledWith({ projectId: 'project-1' })
    expect(wrapper.getComponent(ElCheckboxGroup).props('modelValue')).toEqual(['dev'])
    expect(
      wrapper
        .getComponent(ElCheckboxGroup)
        .findAll<HTMLInputElement>('input[type="checkbox"]')
        .map((input) => input.element.value),
    ).toEqual(['dev', 'prod'])
  })

  it('同项目目录保留环境，清空范围后移除环境条件', async () => {
    const wrapper = await setup()
    await select(wrapper, ['tenant-1', 'org-1', 'project-1'])
    wrapper.getComponent(ElCheckboxGroup).vm.$emit('update:modelValue', ['prod'])
    await select(wrapper, ['tenant-1', 'org-1', 'project-1', 'folder-group-1'])
    expect(wrapper.getComponent(ElCheckboxGroup).props('modelValue')).toEqual(['prod'])
    expect(listEnvironments).toHaveBeenCalledTimes(1)
    await select(wrapper, undefined)
    expect(wrapper.findComponent(ElCheckboxGroup).exists()).toBe(false)
    expect(wrapper.text()).toContain('查询所有可访问范围')
  })

  it('环境全部取消后禁止搜索，空结果由后端返回', async () => {
    const wrapper = await setup()
    await select(wrapper, ['tenant-1', 'org-1', 'project-1'])
    wrapper.getComponent(ElCheckboxGroup).vm.$emit('update:modelValue', [])
    await flushPromises()
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('请至少选择一个环境')
    await select(wrapper, [])
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(searchSecrets).toHaveBeenCalledWith(
      { scopes: [], envList: [], tagIdList: [], keyword: '', pageNum: 1, pageSize: 20 },
      expect.any(AbortSignal),
    )
    expect(wrapper.text()).toContain('未找到匹配的秘钥')
  })

  it('旧项目迟到的环境响应不能覆盖新项目环境', async () => {
    let resolveFirst!: (value: Environment[]) => void
    vi.mocked(listEnvironments)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve
          }),
      )
      .mockResolvedValueOnce([env('stage', 20)])
    const wrapper = await setup()
    await select(wrapper, ['tenant-1', 'org-1', 'project-1'])
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()
    await select(wrapper, ['tenant-1', 'org-1', 'project-2'])
    resolveFirst([env('dev', 10)])
    await flushPromises()
    expect(wrapper.getComponent(ElCheckboxGroup).props('modelValue')).toEqual(['stage'])
    expect(wrapper.text()).not.toContain('prod')
  })

  it('范围查询失败展示重试入口并禁止搜索', async () => {
    vi.mocked(getTenantWithOrgProject).mockRejectedValueOnce(new Error('unavailable'))
    const wrapper = await setup()
    expect(wrapper.text()).toContain('范围加载失败')
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()
    await wrapper.get('[aria-label="刷新范围"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).not.toContain('范围加载失败')
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeUndefined()
  })

  it('跨项目多选隐藏环境，回到一个项目后默认选择第一个环境', async () => {
    const wrapper = await setup()
    expect(wrapper.getComponent(ElCascader).props('props')).toMatchObject({
      multiple: true,
      checkStrictly: true,
    })
    await select(wrapper, ['tenant-1', 'org-1', 'project-1'])
    wrapper.getComponent(ElCascader).vm.$emit('update:modelValue', [
      ['tenant-1', 'org-1', 'project-1'],
      ['tenant-1', 'org-1', 'project-2'],
    ])
    await flushPromises()
    expect(wrapper.findComponent(ElCheckboxGroup).exists()).toBe(false)
    expect(wrapper.getComponent(ElCascader).props('modelValue')).toHaveLength(2)
    await select(wrapper, ['tenant-1', 'org-1', 'project-2'])
    expect(wrapper.getComponent(ElCheckboxGroup).props('modelValue')).toEqual(['dev'])
  })

  it('同项目多个目录共用环境，追加上级租户后清除环境限制', async () => {
    const wrapper = await setup()
    await select(wrapper, ['tenant-1', 'org-1', 'project-1'])
    wrapper.getComponent(ElCheckboxGroup).vm.$emit('update:modelValue', ['prod'])
    wrapper.getComponent(ElCascader).vm.$emit('update:modelValue', [
      ['tenant-1', 'org-1', 'project-1', 'folder-1'],
      ['tenant-1', 'org-1', 'project-1', 'folder-2'],
    ])
    await flushPromises()
    expect(wrapper.getComponent(ElCheckboxGroup).props('modelValue')).toEqual(['prod'])
    wrapper
      .getComponent(ElCascader)
      .vm.$emit('update:modelValue', [['tenant-1'], ['tenant-1', 'org-1', 'project-1']])
    await flushPromises()
    expect(wrapper.findComponent(ElCheckboxGroup).exists()).toBe(false)
    const memory = JSON.parse(
      sessionStorage.getItem('env-vault:navigation:v1:secret-search') ?? '{}',
    )
    expect(JSON.parse(memory.scopePaths)).toHaveLength(2)
    expect(memory.envCodes).toEqual([])
  })

  it('翻页保留匹配范围，每项仍展示完整环境且默认显示明文值', async () => {
    const sample = createSecretSearchPreview().groups
    vi.mocked(searchSecrets)
      .mockResolvedValueOnce({ total: 21, list: [sample[0]!] })
      .mockResolvedValueOnce({ total: 21, list: [sample[1]!] })
    const wrapper = await setup()
    await select(wrapper, ['tenant-1', 'org-1', 'project-1', 'folder-1'])
    await wrapper.get('input[aria-label="检索关键词"]').setValue('DOMAIN')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('SERVICE_DOMAIN')
    expect(wrapper.text()).toContain('https://pay.dev.example.com')
    expect(wrapper.text()).toContain('https://pay.example.com')
    expect(wrapper.getComponent(ElPagination).props('total')).toBe(21)
    wrapper.getComponent(ElPagination).vm.$emit('current-change', 2)
    await flushPromises()
    expect(searchSecrets).toHaveBeenLastCalledWith(
      {
        scopes: [{ scopeType: 'folder', scopeId: 'folder-1' }],
        envList: ['dev'],
        tagIdList: [],
        keyword: 'DOMAIN',
        pageNum: 2,
        pageSize: 20,
      },
      expect.any(AbortSignal),
    )
    expect(wrapper.text()).toContain('REQUEST_TIMEOUT')
    expect(wrapper.text()).not.toContain('SERVICE_DOMAIN')
  })

  it('新关键词取消旧请求，迟到的结果不能覆盖新结果', async () => {
    let resolveOld!: (value: SecretSearchResultPage) => void
    vi.mocked(searchSecrets).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve
        }),
    )
    const wrapper = await setup()
    await wrapper.get('input[aria-label="检索关键词"]').setValue('OLD')
    await wrapper.get('form').trigger('submit')
    const oldSignal = vi.mocked(searchSecrets).mock.calls[0]![1]!
    await wrapper.get('input[aria-label="检索关键词"]').setValue('NEW')
    expect(oldSignal.aborted).toBe(true)
    const sample = createSecretSearchPreview().groups
    vi.mocked(searchSecrets).mockResolvedValueOnce({ total: 1, list: [sample[1]!] })
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    resolveOld({ total: 1, list: [sample[0]!] })
    await flushPromises()
    expect(wrapper.text()).toContain('REQUEST_TIMEOUT')
    expect(wrapper.text()).not.toContain('SERVICE_DOMAIN')
    expect(wrapper.get('.secret-search__results').attributes('aria-busy')).toBe('false')
  })

  it('搜索失败提供重试，改变条件后清空旧页码和错误', async () => {
    vi.mocked(searchSecrets).mockRejectedValueOnce(new Error('搜索超时，请缩小范围'))
    const wrapper = await setup()
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('搜索超时，请缩小范围')
    const retry = wrapper.findAll('button').find((button) => button.text() === '重试')!
    await retry.trigger('click')
    await flushPromises()
    expect(wrapper.text()).not.toContain('搜索超时，请缩小范围')
    expect(searchSecrets).toHaveBeenCalledTimes(2)
    await wrapper.get('input[aria-label="检索关键词"]').setValue('changed')
    expect(wrapper.findComponent(ElPagination).exists()).toBe(false)
  })

  it('按当前范围加载标签候选并将多选标签加入搜索条件', async () => {
    vi.mocked(listSecretSearchTags).mockResolvedValue({
      total: 1,
      list: [
        {
          id: 'tag-1',
          tenantId: 'tenant-1',
          tenantName: '租户',
          code: 'database',
          name: '数据库',
          remark: '数据库连接信息',
        },
      ],
    })
    const wrapper = await setup()
    await select(wrapper, ['tenant-1', 'org-1', 'project-1'])
    const tagSelect = wrapper.getComponent(ElSelect)
    tagSelect.vm.$emit('visible-change', true)
    await flushPromises()
    expect(listSecretSearchTags).toHaveBeenCalledWith(
      {
        scopes: [{ scopeType: 'project', scopeId: 'project-1' }],
        envList: ['dev'],
        keyword: '',
        pageNum: 1,
        pageSize: 50,
      },
      expect.any(AbortSignal),
    )
    tagSelect.vm.$emit('update:modelValue', ['tag-1'])
    await flushPromises()
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(searchSecrets).toHaveBeenLastCalledWith(
      {
        scopes: [{ scopeType: 'project', scopeId: 'project-1' }],
        envList: ['dev'],
        tagIdList: ['tag-1'],
        keyword: '',
        pageNum: 1,
        pageSize: 20,
      },
      expect.any(AbortSignal),
    )
  })
})
