import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import TagCreateDialog from './TagCreateDialog.vue'
import { createTag, type Tag } from '@/api/tag'

vi.mock('@/api/tag', () => ({ createTag: vi.fn() }))

const createdTag: Tag = {
  id: 'tag-new',
  tenantId: 'tenant-1',
  code: 'database',
  name: '数据库',
  remark: '数据库连接信息',
  allowValueSearch: false,
  createAt: '',
  updateAt: '',
}

function setInputValue(selector: string, value: string): void {
  const input = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)
  expect(input).not.toBeNull()
  input!.value = value
  input!.dispatchEvent(new Event('input', { bubbles: true }))
}

function clickButton(label: string): void {
  const button = [...document.querySelectorAll('button')].find(
    (item) => item.textContent?.trim() === label,
  )
  expect(button).toBeDefined()
  button!.click()
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(createTag).mockResolvedValue(createdTag)
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('TagCreateDialog', () => {
  it('creates a tag in the supplied tenant and returns it to the selector', async () => {
    const wrapper = mount(TagCreateDialog, {
      props: { modelValue: true, tenantId: 'tenant-1' },
      global: { plugins: [ElementPlus] },
      attachTo: document.body,
    })
    await flushPromises()
    setInputValue('input[aria-label="标签 Code"]', 'database')
    setInputValue('input[aria-label="标签名称"]', '数据库')
    setInputValue('textarea[aria-label="标签描述"]', '数据库连接信息')
    document.querySelector<HTMLElement>('[aria-label="允许值检索"]')!.click()
    clickButton('创建')
    await flushPromises()

    expect(createTag).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      code: 'database',
      name: '数据库',
      remark: '数据库连接信息',
      allowValueSearch: false,
    })
    expect(wrapper.emitted('created')?.[0]).toEqual([createdTag])
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([false])
    wrapper.unmount()
  })
})
