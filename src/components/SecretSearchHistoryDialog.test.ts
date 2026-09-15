import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus, { ElTabs } from 'element-plus'
import SecretSearchHistoryDialog from './SecretSearchHistoryDialog.vue'
import { getSecretHistory, getSecretBatchDetail } from '@/api/secret'
import { createSecretSearchPreview } from '@/views/secret/secret-search.mock'

vi.mock('@/api/secret', () => ({ getSecretHistory: vi.fn(), getSecretBatchDetail: vi.fn() }))
const wrappers: ReturnType<typeof mount>[] = []
beforeEach(() => vi.resetAllMocks())
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  document.body.innerHTML = ''
})

it('真实历史按需加载、追加下一页，批次只在选中批次详情时请求', async () => {
  const sample = createSecretSearchPreview()
  const secret = sample.groups[0]!
  const records = sample.histories[secret.groupId]!.dev!.list
  vi.mocked(getSecretHistory)
    .mockResolvedValueOnce({ dev: { total: 2, list: [records[0]!] } })
    .mockResolvedValueOnce({ dev: { total: 2, list: [records[1]!] } })
  vi.mocked(getSecretBatchDetail).mockResolvedValue(sample.batches[records[0]!.batchId]!)
  const wrapper = mount(SecretSearchHistoryDialog, {
    props: { modelValue: true, secret },
    global: { plugins: [ElementPlus], stubs: { teleport: true } },
  })
  wrappers.push(wrapper)
  await flushPromises()
  expect(getSecretHistory).toHaveBeenCalledWith({
    groupId: secret.groupId,
    envList: ['dev', 'test', 'sim', 'prod'],
    pageNum: 1,
    pageSize: 20,
  })
  expect(getSecretBatchDetail).not.toHaveBeenCalled()
  await wrapper
    .findAll('button')
    .find((button) => button.text() === '加载更多')!
    .trigger('click')
  await flushPromises()
  expect(getSecretHistory).toHaveBeenLastCalledWith(expect.objectContaining({ pageNum: 2 }))
  expect(wrapper.text()).not.toContain('加载更多')
  await wrapper.get('[aria-label="查看开发环境 v3版本详情"]').trigger('click')
  expect(getSecretBatchDetail).not.toHaveBeenCalled()
  wrapper.getComponent(ElTabs).vm.$emit('update:modelValue', 'batch')
  await flushPromises()
  expect(getSecretBatchDetail).toHaveBeenCalledWith({
    batchId: records[0]!.batchId,
    envList: ['dev', 'test', 'sim', 'prod'],
  })
  expect(wrapper.text()).toContain('REQUEST_TIMEOUT')
})

it('Mock 历史保持隔离，不发起后端请求', async () => {
  const sample = createSecretSearchPreview()
  const secret = sample.groups[0]!
  const wrapper = mount(SecretSearchHistoryDialog, {
    props: {
      modelValue: true,
      secret,
      history: sample.histories[secret.groupId],
      batches: sample.batches,
    },
    global: { plugins: [ElementPlus], stubs: { teleport: true } },
  })
  wrappers.push(wrapper)
  await flushPromises()
  expect(getSecretHistory).not.toHaveBeenCalled()
  expect(wrapper.text()).toContain('模拟数据')
})
