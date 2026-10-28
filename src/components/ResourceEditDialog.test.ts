import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import ResourceEditDialog, { type EditableResourceType } from './ResourceEditDialog.vue'
import { allocateUsers, listUsers, type UserListItem } from '@/api/user'
import { ApiError } from '@/types/api'
import { createEnvironment, listEnvironments, updateEnvironment } from '@/api/env'

vi.mock('@/api/user', () => ({ allocateUsers: vi.fn(), listUsers: vi.fn() }))
vi.mock('@/api/env', () => ({
  createEnvironment: vi.fn(),
  listEnvironments: vi.fn(),
  updateEnvironment: vi.fn(),
}))

const manager = { userId: 'manager', nickname: '负责人' }
const zhang = { userId: '101', nickname: '张三' }
const li = { userId: '102', nickname: '李四' }
const candidates = [
  manager,
  zhang,
  li,
  { userId: 'blocked', nickname: '停用用户', isBlocked: true },
]
const response = (list: UserListItem[]) => ({ list, total: list.length, pageNum: 1, pageSize: 100 })
const mounted: ReturnType<typeof mount>[] = []

function dialog(resourceType: EditableResourceType = 'tenant', readOnly = false) {
  const wrapper = mount(ResourceEditDialog, {
    props: {
      modelValue: true,
      readOnly,
      resourceType,
      resourceId: `${resourceType}-1`,
      name: '测试资源',
      remark: '',
      managerId: 'manager',
      managerName: '负责人',
      tenantId: 'tenant-1',
      orgId: 'org-1',
      submitting: false,
    },
    global: {
      plugins: [ElementPlus, createPinia()],
      stubs: { ManagerSelect: true, ResourceAuditPanel: true, TenantTagPanel: true },
    },
    attachTo: document.body,
  })
  mounted.push(wrapper)
  return wrapper
}

function button(wrapper: ReturnType<typeof mount>, label: string) {
  return wrapper.findAllComponents({ name: 'ElButton' }).find((item) => item.text() === label)!
}

async function openUsers(wrapper: ReturnType<typeof mount>) {
  await flushPromises()
  await wrapper
    .findAll('.tenant-edit-tabs__item')
    .find((item) => item.text() === '用户管理')!
    .trigger('click')
  await flushPromises()
}

async function openAdd(wrapper: ReturnType<typeof mount>) {
  await openUsers(wrapper)
  vi.mocked(listUsers).mockResolvedValue(response(candidates))
  await wrapper.get('[aria-label="添加成员"]').trigger('click')
  await flushPromises()
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(listUsers).mockResolvedValue(response([manager]))
  vi.mocked(allocateUsers).mockResolvedValue({ affectedCount: 2 })
})
afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount())
  document.body.innerHTML = ''
})

describe('ResourceEditDialog member pages', () => {
  it.each(['tenant', 'organization', 'project'] as const)(
    'shows %s details and members without mutation controls',
    async (resourceType) => {
      const wrapper = dialog(resourceType, true)
      await flushPromises()
      expect(wrapper.get<HTMLInputElement>('.tenant-edit-dialog__form input').element.value).toBe(
        '测试资源',
      )
      expect(wrapper.get('.tenant-edit-dialog__form input').attributes('readonly')).toBeDefined()
      expect(wrapper.get('.tenant-edit-dialog__form textarea').attributes('readonly')).toBeDefined()
      expect(wrapper.findAll('input').some((input) => input.element.value === '负责人')).toBe(true)
      expect(button(wrapper, '保存')).toBeUndefined()
      expect(button(wrapper, '关闭')).toBeDefined()
      await openUsers(wrapper)
      expect(listUsers).toHaveBeenCalledWith(
        resourceType === 'tenant'
          ? { tenantId: 'tenant-1' }
          : resourceType === 'organization'
            ? { orgId: 'organization-1' }
            : { projectId: 'project-1' },
      )
      expect(wrapper.find('[aria-label="添加成员"]').exists()).toBe(false)
      expect(wrapper.find('.resource-members__remove').exists()).toBe(false)
      expect(allocateUsers).not.toHaveBeenCalled()
      expect(button(wrapper, '编辑')).toBeUndefined()
      await wrapper.get('.el-dialog__header [aria-label="编辑"]').trigger('click')
      expect(wrapper.emitted('edit')).toHaveLength(1)
      await wrapper.setProps({ readOnly: false })
      expect(wrapper.get('.tenant-edit-tabs__item.is-active').text()).toBe('用户管理')
      expect(wrapper.text()).toContain('负责人')
      expect(wrapper.find('[aria-label="编辑"]').exists()).toBe(false)
      expect(wrapper.find('[aria-label="添加成员"]').exists()).toBe(true)
    },
  )

  it('loads project environments while preventing creation and permission changes in details', async () => {
    vi.mocked(listEnvironments).mockResolvedValue([
      {
        id: 'env-1',
        projectId: 'project-1',
        code: 'dev',
        name: '开发环境',
        remark: '',
        orderNo: 10,
        isCheckPerm: true,
        createBy: '',
        updateBy: '',
        createAt: '',
        updateAt: '',
      },
    ])
    const wrapper = dialog('project', true)
    await flushPromises()
    await wrapper
      .findAll('.tenant-edit-tabs__item')
      .find((item) => item.text() === '环境管理')!
      .trigger('click')
    await flushPromises()
    expect(listEnvironments).toHaveBeenCalledWith({ projectId: 'project-1' })
    expect(wrapper.text()).toContain('开发环境')
    expect(wrapper.find('[aria-label="新建环境"]').exists()).toBe(false)
    const permissionSwitch = wrapper.getComponent({ name: 'ElSwitch' })
    expect(permissionSwitch.props('disabled')).toBe(true)
    permissionSwitch.vm.$emit('change', false)
    await flushPromises()
    expect(updateEnvironment).not.toHaveBeenCalled()
    expect(createEnvironment).not.toHaveBeenCalled()
  })

  it.each([
    { resourceType: 'tenant' as const, scope: { undistributed: true }, type: 'tenant' },
    { resourceType: 'organization' as const, scope: { tenantId: 'tenant-1' }, type: 'org' },
    { resourceType: 'project' as const, scope: { orgId: 'org-1' }, type: 'project' },
  ])(
    'adds $resourceType members on the same dialog with the correct scope',
    async ({ resourceType, scope, type }) => {
      const wrapper = dialog(resourceType)
      await openAdd(wrapper)
      expect(wrapper.findAllComponents({ name: 'ElDialog' })).toHaveLength(1)
      expect(listUsers).toHaveBeenLastCalledWith(scope)
      expect(wrapper.find('[aria-label="选择负责人"]').exists()).toBe(false)
      expect(wrapper.find('[aria-label="选择停用用户"]').exists()).toBe(false)
      await wrapper.get('[aria-label="选择张三"] input').setValue(true)
      await wrapper.get('[aria-label="选择李四"] input').setValue(true)
      vi.mocked(listUsers).mockResolvedValue(response([manager, zhang, li]))
      await button(wrapper, '添加 (2)').trigger('click')
      await flushPromises()
      expect(allocateUsers).toHaveBeenCalledWith({
        type,
        operate: 'add',
        resourceId: `${resourceType}-1`,
        userIdList: ['101', '102'],
      })
      expect(wrapper.get('[aria-label="添加成员"]').isVisible()).toBe(true)
      expect(wrapper.find('[aria-label="返回成员列表"]').exists()).toBe(false)
      expect(wrapper.emitted('members-changed')).toHaveLength(1)
    },
  )

  it('keeps search and selection when returning within the same dialog', async () => {
    const wrapper = dialog()
    await openAdd(wrapper)
    await wrapper.get('[aria-label="选择张三"] input').setValue(true)
    await wrapper.get('input[aria-label="搜索可添加成员"]').setValue('张三')
    await wrapper.get('[aria-label="返回成员列表"]').trigger('click')
    expect(allocateUsers).not.toHaveBeenCalled()
    await wrapper.get('[aria-label="添加成员"]').trigger('click')
    await flushPromises()
    expect(wrapper.get<HTMLInputElement>('input[aria-label="搜索可添加成员"]').element.value).toBe(
      '张三',
    )
    expect(wrapper.get<HTMLInputElement>('[aria-label="选择张三"] input').element.checked).toBe(
      true,
    )
  })

  it('selects and deselects only the filtered candidates', async () => {
    const wrapper = dialog()
    await openAdd(wrapper)
    await wrapper.get('input[aria-label="搜索可添加成员"]').setValue('张三')
    await wrapper.get('[aria-label="选择当前结果"] input').setValue(true)
    await wrapper.get('input[aria-label="搜索可添加成员"]').setValue('')
    expect(wrapper.get<HTMLInputElement>('[aria-label="选择李四"] input').element.checked).toBe(
      false,
    )
    await wrapper.get('[aria-label="选择李四"] input').setValue(true)
    await wrapper.get('input[aria-label="搜索可添加成员"]').setValue('张三')
    await wrapper.get('[aria-label="选择当前结果"] input').setValue(false)
    await button(wrapper, '添加 (1)').trigger('click')
    await flushPromises()
    expect(vi.mocked(allocateUsers).mock.calls[0]![0].userIdList).toEqual(['102'])
  })

  it('blocks duplicate submission, return, close and tab changes while adding', async () => {
    const wrapper = dialog()
    await openAdd(wrapper)
    await wrapper.get('[aria-label="选择张三"] input').setValue(true)
    let resolve!: (result: { affectedCount: number }) => void
    vi.mocked(allocateUsers).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    const add = button(wrapper, '添加 (1)')
    await add.trigger('click')
    await add.trigger('click')
    await wrapper
      .findAll('.tenant-edit-tabs__item')
      .find((item) => item.text() === '基础信息')!
      .trigger('click')
    expect(wrapper.find('.tenant-edit-tabs__item.is-active').text()).toBe('用户管理')
    expect(wrapper.get('[aria-label="返回成员列表"]').attributes('disabled')).toBeDefined()
    expect(button(wrapper, '关闭').attributes('disabled')).toBeDefined()
    const shell = wrapper.getComponent({ name: 'ElDialog' })
    expect(shell.props('closeOnPressEscape')).toBe(false)
    expect(shell.props('showClose')).toBe(false)
    shell.vm.$emit('update:modelValue', false)
    await flushPromises()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(allocateUsers).toHaveBeenCalledTimes(1)
    resolve({ affectedCount: 1 })
    await flushPromises()
    expect(button(wrapper, '关闭').attributes('disabled')).toBeUndefined()
  })

  it('preserves the selected users when allocation fails and allows retry', async () => {
    const wrapper = dialog()
    await openAdd(wrapper)
    await wrapper.get('[aria-label="选择张三"] input').setValue(true)
    vi.mocked(allocateUsers).mockRejectedValueOnce(
      new ApiError({ code: -1, httpStatus: 200, msg: '添加失败' }),
    )
    await button(wrapper, '添加 (1)').trigger('click')
    await flushPromises()
    expect(wrapper.get('[aria-label="返回成员列表"]').isVisible()).toBe(true)
    expect(wrapper.get<HTMLInputElement>('[aria-label="选择张三"] input').element.checked).toBe(
      true,
    )
    await button(wrapper, '添加 (1)').trigger('click')
    await flushPromises()
    expect(allocateUsers).toHaveBeenCalledTimes(2)
    expect(wrapper.get('[aria-label="添加成员"]').isVisible()).toBe(true)
  })

  it('shows candidate query failure with retry instead of an empty list', async () => {
    const wrapper = dialog()
    await openUsers(wrapper)
    vi.mocked(listUsers).mockRejectedValueOnce(new Error('offline'))
    await wrapper.get('[aria-label="添加成员"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('候选成员加载失败')
    expect(wrapper.text()).not.toContain('暂无可添加用户')
    expect(button(wrapper, '添加').props('disabled')).toBe(true)
    vi.mocked(listUsers).mockResolvedValue(response(candidates))
    await button(wrapper, '重新加载').trigger('click')
    await flushPromises()
    expect(wrapper.find('[aria-label="选择张三"]').exists()).toBe(true)
  })

  it('discards old candidate responses after moving to a different resource', async () => {
    const wrapper = dialog()
    await openUsers(wrapper)
    let resolveOld!: (value: ReturnType<typeof response>) => void
    vi.mocked(listUsers).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolveOld = done
        }),
    )
    await wrapper.get('[aria-label="添加成员"]').trigger('click')
    await wrapper.setProps({ resourceId: 'tenant-2', name: '其他租户' })
    await openUsers(wrapper)
    vi.mocked(listUsers).mockResolvedValueOnce(response([li]))
    await wrapper.get('[aria-label="添加成员"]').trigger('click')
    await flushPromises()
    resolveOld(response([zhang]))
    await flushPromises()
    expect(wrapper.find('[aria-label="选择张三"]').exists()).toBe(false)
    expect(wrapper.find('[aria-label="选择李四"]').exists()).toBe(true)
  })

  it('clears the selection after the management dialog is closed', async () => {
    const wrapper = dialog()
    await openAdd(wrapper)
    await wrapper.get('[aria-label="选择张三"] input').setValue(true)
    await wrapper.setProps({ modelValue: false })
    vi.mocked(listUsers).mockResolvedValue(response([manager]))
    await wrapper.setProps({ modelValue: true })
    await openAdd(wrapper)
    expect(wrapper.get<HTMLInputElement>('[aria-label="选择张三"] input').element.checked).toBe(
      false,
    )
  })
})
