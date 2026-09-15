import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import SecretTagDetailDialog from './SecretTagDetailDialog.vue'
import { getSecretTags, type SecretTag } from '@/api/secret'
import { getTag, type Tag } from '@/api/tag'

vi.mock('@/api/secret', () => ({ getSecretTags: vi.fn() }))
vi.mock('@/api/tag', () => ({ getTag: vi.fn() }))

const summary: SecretTag = {
  id: 'tag-1',
  code: 'credential',
  name: '凭据',
  allowValueSearch: false,
}
const detail: Tag = {
  ...summary,
  tenantId: 'tenant-1',
  remark: '个人凭据禁止值检索',
  createAt: '2026-09-15T09:00:00+08:00',
  updateAt: '2026-09-15T10:00:00+08:00',
}
const mounted: ReturnType<typeof mount>[] = []

function dialog() {
  const wrapper = mount(SecretTagDetailDialog, {
    props: {
      modelValue: true,
      groupId: 'group-1',
      secretKey: 'DATABASE_PASSWORD',
      tag: summary,
    },
    global: { plugins: [ElementPlus] },
    attachTo: document.body,
  })
  mounted.push(wrapper)
  return wrapper
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getSecretTags).mockResolvedValue({
    groupId: 'group-1',
    tenantId: 'tenant-1',
    tagList: [summary],
  })
  vi.mocked(getTag).mockResolvedValue(detail)
})

afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount())
  document.body.innerHTML = ''
})

describe('SecretTagDetailDialog', () => {
  it('loads tenant scope first and displays the complete tag detail', async () => {
    dialog()
    await flushPromises()

    expect(getSecretTags).toHaveBeenCalledWith('group-1')
    expect(getTag).toHaveBeenCalledWith({ tenantId: 'tenant-1', id: 'tag-1' })
    expect(document.body.textContent).toContain('DATABASE_PASSWORD')
    expect(document.body.textContent).toContain('个人凭据禁止值检索')
    expect(document.body.textContent).toContain('禁止')
  })

  it('offers an in-dialog retry when loading fails', async () => {
    vi.mocked(getSecretTags).mockRejectedValueOnce(new Error('network'))
    const wrapper = dialog()
    await flushPromises()

    expect(document.body.textContent).toContain('标签详情加载失败')
    await wrapper
      .findAllComponents({ name: 'ElButton' })
      .find((button) => button.text() === '重新加载')!
      .trigger('click')
    await flushPromises()

    expect(getSecretTags).toHaveBeenCalledTimes(2)
    expect(document.body.textContent).toContain('个人凭据禁止值检索')
  })
})
