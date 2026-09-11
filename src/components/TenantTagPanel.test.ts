import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus, { ElMessageBox } from 'element-plus'
import TenantTagPanel from './TenantTagPanel.vue'
import { createTag, updateTag, deleteTag, listTags, type Tag } from '@/api/tag'

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
  const wrapper = mount(TenantTagPanel, {
    props: { tenantId: 'tenant-1', active },
    global: { plugins: [ElementPlus] },
    attachTo: document.body,
  })
  mounted.push(wrapper)
  return wrapper
}
beforeEach(() => {
  vi.clearAllMocks()
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

  it('defaults new tags to searchable and creates with tenant scope', async () => {
    const wrapper = panel()
    await flushPromises()
    await wrapper.get('[aria-label="新建 Tag"]').trigger('click')
    await flushPromises()
    const dialog = wrapper.findAllComponents({ name: 'ElDialog' })[0]!
    const inputs = dialog.findAllComponents({ name: 'ElInput' })
    inputs[0]!.vm.$emit('update:modelValue', 'ip')
    inputs[1]!.vm.$emit('update:modelValue', 'IP 地址')
    const toggle = dialog.getComponent({ name: 'ElSwitch' })
    expect(toggle.props('modelValue')).toBe(true)
    await flushPromises()
    await dialog
      .findAllComponents({ name: 'ElButton' })
      .find((button) => button.text() === '创建')!
      .trigger('click')
    await flushPromises()
    expect(createTag).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      code: 'ip',
      name: 'IP 地址',
      remark: '',
      allowValueSearch: true,
    })
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
})
