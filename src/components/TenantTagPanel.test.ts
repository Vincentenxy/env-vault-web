import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus, { ElMessageBox } from 'element-plus'
import { createPinia } from 'pinia'
import TenantTagPanel from './TenantTagPanel.vue'
import TenantTagCreatePanel from './TenantTagCreatePanel.vue'
import { createTag, updateTag, deleteTag, listTags, type Tag } from '@/api/tag'
import { useAuthStore } from '@/stores/auth'
import { ApiError } from '@/types/api'

vi.mock('@/api/tag', () => ({
  createTag: vi.fn(),
  updateTag: vi.fn(),
  deleteTag: vi.fn(),
  listTags: vi.fn(),
}))
const tag: Tag = {
  id: 'tag-1',
  tenantId: 'tenant-1',
  code: 'password',
  name: '密码',
  remark: '禁止值检索',
  allowValueSearch: false,
  createAt: '',
  updateAt: '',
}
const mounted: ReturnType<typeof mount>[] = []
function panel(active = true) {
  const pinia = createPinia()
  const auth = useAuthStore(pinia)
  auth.setToken('test-session')
  auth.setCurrentUser({ id: 'user-1', userId: 'user-1', nickname: '测试用户' })
  const wrapper = mount(TenantTagPanel, {
    props: { tenantId: 'tenant-1', active },
    global: { plugins: [ElementPlus, pinia] },
    attachTo: document.body,
  })
  mounted.push(wrapper)
  return wrapper
}
beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  vi.mocked(listTags).mockResolvedValue({ list: [tag], total: 1 })
  vi.mocked(createTag).mockResolvedValue(tag)
  vi.mocked(updateTag).mockResolvedValue(tag)
  vi.mocked(deleteTag).mockResolvedValue()
})
afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount())
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('TenantTagPanel', () => {
  it('loads only when the tenant tab is active', async () => {
    const wrapper = panel(false)
    await flushPromises()
    expect(listTags).not.toHaveBeenCalled()
    await wrapper.setProps({ active: true })
    await flushPromises()
    expect(listTags).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      keyword: '',
      pageNum: 1,
      pageSize: 10,
    })
    expect(wrapper.text()).toContain('禁止')
  })

  it('creates multiple rows with tenant scope and preserves false', async () => {
    const wrapper = panel()
    await flushPromises()
    await wrapper.get('[aria-label="新建 Tag"]').trigger('click')
    await flushPromises()
    const editor = wrapper.getComponent(TenantTagCreatePanel)
    await editor.get('input[aria-label="第 1 行 Code"]').setValue('ip')
    await editor.get('input[aria-label="第 1 行名称"]').setValue('IP 地址')
    const toggle = editor.getComponent({ name: 'ElSwitch' })
    expect(toggle.props('modelValue')).toBe(true)
    toggle.vm.$emit('update:modelValue', false)
    await editor.get('[aria-label="添加 Tag 行"]').trigger('click')
    await editor.get('input[aria-label="第 2 行 Code"]').setValue('token')
    await editor.get('input[aria-label="第 2 行名称"]').setValue('访问令牌')
    await flushPromises()
    await editor
      .findAllComponents({ name: 'ElButton' })
      .find((button) => button.text() === '创建 2 项')!
      .trigger('click')
    await flushPromises()
    expect(createTag).toHaveBeenNthCalledWith(
      1,
      {
        tenantId: 'tenant-1',
        code: 'ip',
        name: 'IP 地址',
        remark: '',
        allowValueSearch: false,
      },
      { silent: true },
    )
    expect(createTag).toHaveBeenNthCalledWith(
      2,
      {
        tenantId: 'tenant-1',
        code: 'token',
        name: '访问令牌',
        remark: '',
        allowValueSearch: true,
      },
      { silent: true },
    )
    expect(localStorage.getItem('env-vault:tag-drafts:v1:user-1:tenant-1')).toBeNull()
    expect(wrapper.get('[aria-label="新建 Tag"]').isVisible()).toBe(true)
  })

  it('prefills editing fields, locks code and submits false unchanged', async () => {
    const wrapper = panel()
    await flushPromises()
    await wrapper.get('[aria-label="编辑 Tag"]').trigger('click')
    await flushPromises()
    const dialog = wrapper.getComponent({ name: 'ElDialog' })
    expect(dialog.findAllComponents({ name: 'ElInput' })[0]!.props('disabled')).toBe(true)
    expect(dialog.getComponent({ name: 'ElSwitch' }).props('modelValue')).toBe(false)
    await dialog
      .findAllComponents({ name: 'ElButton' })
      .find((button) => button.text() === '保存')!
      .trigger('click')
    await flushPromises()
    expect(updateTag).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      id: tag.id,
      name: tag.name,
      remark: tag.remark,
      allowValueSearch: false,
    })
  })

  it('does not delete when confirmation is canceled', async () => {
    vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel')
    const wrapper = panel()
    await flushPromises()
    await wrapper.get('[aria-label="删除 Tag"]').trigger('click')
    await flushPromises()
    expect(deleteTag).not.toHaveBeenCalled()
  })

  it('deletes after confirmation using the current tenant', async () => {
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue(
      Object.assign('confirm' as const, { action: 'confirm' as const, value: '' }),
    )
    const wrapper = panel()
    await flushPromises()
    await wrapper.get('[aria-label="删除 Tag"]').trigger('click')
    await flushPromises()
    expect(deleteTag).toHaveBeenCalledWith({ tenantId: 'tenant-1', id: tag.id })
  })

  it('shows a retry state when listing fails', async () => {
    vi.mocked(listTags).mockRejectedValue(new Error('table missing'))
    const wrapper = panel()
    await flushPromises()
    expect(wrapper.text()).toContain('Tag 加载失败')
    expect(wrapper.text()).toContain('重新加载')
    expect(wrapper.text()).not.toContain('暂无 Tag')
  })

  it('restores unfinished rows after closing and reopening without creating anything', async () => {
    let wrapper = panel()
    await flushPromises()
    await wrapper.get('[aria-label="新建 Tag"]').trigger('click')
    const editor = wrapper.getComponent(TenantTagCreatePanel)
    await editor.get('input[aria-label="第 1 行 Code"]').setValue('database')
    await editor.get('input[aria-label="第 1 行名称"]').setValue('数据库')
    await editor.get('input[aria-label="第 1 行备注"]').setValue('下次继续填写')
    editor.getComponent({ name: 'ElSwitch' }).vm.$emit('update:modelValue', false)
    await flushPromises()
    mounted.splice(mounted.indexOf(wrapper), 1)
    wrapper.unmount()
    wrapper = panel()
    await flushPromises()
    const restored = wrapper.getComponent(TenantTagCreatePanel)
    expect(restored.isVisible()).toBe(true)
    expect(restored.get<HTMLInputElement>('input[aria-label="第 1 行名称"]').element.value).toBe(
      '数据库',
    )
    expect(restored.get<HTMLInputElement>('input[aria-label="第 1 行备注"]').element.value).toBe(
      '下次继续填写',
    )
    expect(restored.getComponent({ name: 'ElSwitch' }).props('modelValue')).toBe(false)
    expect(createTag).not.toHaveBeenCalled()
    await restored.get('[aria-label="返回 Tag 列表"]').trigger('click')
    expect(localStorage.getItem('env-vault:tag-drafts:v1:user-1:tenant-1')).toContain('database')
  })

  it('isolates drafts across tenants and users', async () => {
    const wrapper = panel()
    await flushPromises()
    await wrapper.get('[aria-label="新建 Tag"]').trigger('click')
    const editor = wrapper.getComponent(TenantTagCreatePanel)
    await editor.get('input[aria-label="第 1 行 Code"]').setValue('first')
    await wrapper.setProps({ tenantId: 'tenant-2' })
    await wrapper.get('[aria-label="新建 Tag"]').trigger('click')
    expect(editor.get<HTMLInputElement>('input[aria-label="第 1 行 Code"]').element.value).toBe('')
    await editor.get('input[aria-label="第 1 行 Code"]').setValue('second')
    await wrapper.setProps({ tenantId: 'tenant-1' })
    expect(editor.get<HTMLInputElement>('input[aria-label="第 1 行 Code"]').element.value).toBe(
      'first',
    )
    const auth = useAuthStore()
    auth.setCurrentUser({ id: 'user-2', userId: 'user-2', nickname: '其他用户' })
    await flushPromises()
    expect(editor.isVisible()).toBe(false)
    await wrapper.get('[aria-label="新建 Tag"]').trigger('click')
    expect(editor.get<HTMLInputElement>('input[aria-label="第 1 行 Code"]').element.value).toBe('')
    auth.setCurrentUser({ id: 'user-1', userId: 'user-1', nickname: '测试用户' })
    await flushPromises()
    expect(editor.get<HTMLInputElement>('input[aria-label="第 1 行 Code"]').element.value).toBe(
      'first',
    )
  })

  it('retains failed rows and retries only those rows while preventing duplicate submits', async () => {
    const wrapper = panel()
    await flushPromises()
    await wrapper.get('[aria-label="新建 Tag"]').trigger('click')
    const editor = wrapper.getComponent(TenantTagCreatePanel)
    await editor.get('input[aria-label="第 1 行 Code"]').setValue('first')
    await editor.get('input[aria-label="第 1 行名称"]').setValue('第一个')
    await editor.get('[aria-label="添加 Tag 行"]').trigger('click')
    await editor.get('input[aria-label="第 2 行 Code"]').setValue('second')
    await editor.get('input[aria-label="第 2 行名称"]').setValue('第二个')
    let resolveFirst!: (value: Tag) => void
    vi.mocked(createTag)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve
          }),
      )
      .mockRejectedValueOnce(
        new ApiError({ code: -1, httpStatus: 200, msg: 'tag code already exists' }),
      )
    const submit = editor
      .findAllComponents({ name: 'ElButton' })
      .find((button) => button.text() === '创建 2 项')!
    await submit.trigger('click')
    await submit.trigger('click')
    expect(createTag).toHaveBeenCalledTimes(1)
    expect(editor.get('input[aria-label="第 1 行 Code"]').attributes('disabled')).toBeDefined()
    expect(wrapper.emitted('busy')?.at(-1)).toEqual([true])
    resolveFirst(tag)
    await flushPromises()
    expect(editor.text()).toContain('tag code already exists')
    const stored = localStorage.getItem('env-vault:tag-drafts:v1:user-1:tenant-1')!
    expect(stored).not.toContain('first')
    expect(stored).toContain('second')
    await submit.trigger('click')
    await flushPromises()
    expect(createTag).toHaveBeenCalledTimes(3)
    expect(vi.mocked(createTag).mock.calls[2]![0].code).toBe('second')
    expect(localStorage.getItem('env-vault:tag-drafts:v1:user-1:tenant-1')).toBeNull()
    expect(wrapper.emitted('busy')?.at(-1)).toEqual([false])
  })

  it('validates all rows and rejects duplicate draft codes before submitting', async () => {
    const wrapper = panel()
    await flushPromises()
    await wrapper.get('[aria-label="新建 Tag"]').trigger('click')
    const editor = wrapper.getComponent(TenantTagCreatePanel)
    await editor.get('input[aria-label="第 1 行 Code"]').setValue('same')
    await editor.get('[aria-label="添加 Tag 行"]').trigger('click')
    await editor.get('input[aria-label="第 2 行 Code"]').setValue('same')
    await editor.get('input[aria-label="第 2 行名称"]').setValue('第二个')
    await editor
      .findAllComponents({ name: 'ElButton' })
      .find((button) => button.text() === '创建 2 项')!
      .trigger('click')
    expect(editor.text()).toContain('请输入名称')
    expect(editor.text()).toContain('草稿中的 Code 重复')
    expect(createTag).not.toHaveBeenCalled()
    await editor.get('[aria-label="移除第 2 行"]').trigger('click')
    await editor.get('input[aria-label="第 1 行 Code"]').setValue('INVALID')
    await editor
      .findAllComponents({ name: 'ElButton' })
      .find((button) => button.text() === '创建 1 项')!
      .trigger('click')
    expect(editor.text()).toContain('Code 须以小写字母开头')
    expect(createTag).not.toHaveBeenCalled()
  })

  it('allows editing when storage is unavailable and reports that drafts are not saved', async () => {
    const wrapper = panel()
    await flushPromises()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceeded')
    })
    await wrapper.get('[aria-label="新建 Tag"]').trigger('click')
    const editor = wrapper.getComponent(TenantTagCreatePanel)
    await editor.get('input[aria-label="第 1 行 Code"]').setValue('local')
    expect(editor.text()).toContain('草稿保存失败')
    expect(editor.get<HTMLInputElement>('input[aria-label="第 1 行 Code"]').element.value).toBe(
      'local',
    )
  })

  it('stops sending the remaining rows after the authenticated user changes', async () => {
    const wrapper = panel()
    await flushPromises()
    await wrapper.get('[aria-label="新建 Tag"]').trigger('click')
    const editor = wrapper.getComponent(TenantTagCreatePanel)
    for (const index of [1, 2]) {
      if (index === 2) await editor.get('[aria-label="添加 Tag 行"]').trigger('click')
      await editor.get(`input[aria-label="第 ${index} 行 Code"]`).setValue(`tag${index}`)
      await editor.get(`input[aria-label="第 ${index} 行名称"]`).setValue(`标签${index}`)
    }
    let resolveFirst!: (value: Tag) => void
    vi.mocked(createTag).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve
        }),
    )
    await editor
      .findAllComponents({ name: 'ElButton' })
      .find((button) => button.text() === '创建 2 项')!
      .trigger('click')
    useAuthStore().setCurrentUser({ id: 'user-2', userId: 'user-2', nickname: '其他用户' })
    await flushPromises()
    resolveFirst(tag)
    await flushPromises()
    expect(createTag).toHaveBeenCalledTimes(1)
    const stored = localStorage.getItem('env-vault:tag-drafts:v1:user-1:tenant-1')!
    expect(stored).not.toContain('tag1')
    expect(stored).toContain('tag2')
    expect(localStorage.getItem('env-vault:tag-drafts:v1:user-2:tenant-1')).toBeNull()
  })
})
