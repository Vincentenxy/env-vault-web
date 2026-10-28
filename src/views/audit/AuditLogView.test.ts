import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import ElementPlus, { ElDatePicker, ElPagination, ElSelect } from 'element-plus'
import { listGlobalAuditRecords } from '@/api/audit'
import { ApiError } from '@/types/api'
import type { AuditRecord } from '@/types/audit'
import AuditLogView from './AuditLogView.vue'

vi.mock('@/api/audit', () => ({ listGlobalAuditRecords: vi.fn() }))

function record(overrides: Partial<AuditRecord> = {}): AuditRecord {
  return {
    id: 'event-1',
    eventSource: 'server',
    entryType: 'http',
    callerType: 'web',
    callerName: '',
    callerVersion: '',
    operationName: 'POST /api/v1/folder/delete',
    actionCode: 'folder.delete',
    resultCode: 'success',
    actorType: 'user',
    resourceType: 'folder',
    resourceId: 'deleted-id',
    resourceName: '已删除的文件夹',
    scopeType: 'project',
    scopeId: 'project-1',
    batchId: null,
    changeDetail: [],
    eventDetail: {},
    failureCode: '',
    failureReason: '',
    correlationId: 'request-1',
    traceId: 'trace-1',
    protocolStatus: '200',
    createBy: 'operator-1',
    createByName: '张三',
    createAt: '2026-10-28T09:00:00+08:00',
    ...overrides,
  }
}

const wrappers: ReturnType<typeof mount>[] = []
async function setup(initial = '/app/audit') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/app/audit', name: 'AuditLog', component: { render: () => null } }],
  })
  await router.push(initial)
  await router.isReady()
  const wrapper = mount(AuditLogView, {
    attachTo: document.body,
    global: { plugins: [ElementPlus, router] },
  })
  wrappers.push(wrapper)
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(listGlobalAuditRecords).mockResolvedValue({ list: [record()], total: 81 })
})
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  document.body.innerHTML = ''
})

describe('全局审计日志', () => {
  it('默认跨资源查询最近七天，支持没有存活资源入口的日志', async () => {
    const wrapper = await setup()
    expect(listGlobalAuditRecords).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceType: undefined,
        resourceId: undefined,
        startAt: expect.any(String),
        endAt: expect.any(String),
        pageNum: 1,
        pageSize: 20,
      }),
      expect.any(AbortSignal),
    )
    expect(wrapper.text()).toContain('已删除的文件夹')
    expect(wrapper.text()).toContain('张三')
    expect(listGlobalAuditRecords).toHaveBeenCalledTimes(1)
    expect(wrapper.vm.$route.query).toEqual({
      startAt: expect.any(String),
      endAt: expect.any(String),
      pageNum: '1',
      pageSize: '20',
    })
  })

  it('资源快捷链接查询全部历史，不会将目标用户当作操作人', async () => {
    const wrapper = await setup('/app/audit?resourceType=user&resourceId=staff-001&timeRange=all')
    expect(listGlobalAuditRecords).toHaveBeenCalledTimes(1)
    expect(listGlobalAuditRecords).toHaveBeenLastCalledWith(
      expect.objectContaining({
        resourceType: 'user',
        resourceId: 'staff-001',
        createBy: undefined,
        startAt: undefined,
        endAt: undefined,
        pageNum: 1,
        pageSize: 20,
      }),
      expect.any(AbortSignal),
    )
    expect(wrapper.text()).toContain('不限时间')
    expect((wrapper.get('input[aria-label="资源 ID"]').element as HTMLInputElement).value).toBe(
      'staff-001',
    )
    expect(wrapper.getComponent(ElDatePicker).props('modelValue')).toBeNull()
    await wrapper.get('.el-pagination .btn-next').trigger('click')
    await flushPromises()
    expect(wrapper.vm.$route.query).toMatchObject({
      resourceId: 'staff-001',
      timeRange: 'all',
      pageNum: '2',
    })
  })

  it('复制链接或刷新后恢复所有筛选、时间范围和页码', async () => {
    vi.mocked(listGlobalAuditRecords).mockResolvedValue({ list: [record()], total: 501 })
    const query = new URLSearchParams({
      resourceType: 'personalSecret',
      resourceId: 'secret-id',
      actionCode: 'personalSecret.update',
      createBy: 'operator-2',
      resultCode: 'failure',
      batchId: 'd27a0b38-0cbc-4f20-adbd-ea92f8cc6e3e',
      correlationId: 'req/1&2',
      traceId: 'trace-9',
      startAt: '2026-01-01T00:00:00+08:00',
      endAt: '2026-10-28T23:59:59+08:00',
      pageNum: '3',
      pageSize: '50',
    })
    const wrapper = await setup(`/app/audit?${query}`)
    const expected = {
      resourceType: 'personalSecret',
      resourceId: 'secret-id',
      actionCode: 'personalSecret.update',
      createBy: 'operator-2',
      resultCode: 'failure',
      batchId: 'd27a0b38-0cbc-4f20-adbd-ea92f8cc6e3e',
      correlationId: 'req/1&2',
      traceId: 'trace-9',
      startAt: '2025-12-31T16:00:00.000Z',
      endAt: '2026-10-28T15:59:59.000Z',
      pageNum: 3,
      pageSize: 50,
    }
    expect(listGlobalAuditRecords).toHaveBeenCalledTimes(1)
    expect(listGlobalAuditRecords).toHaveBeenLastCalledWith(expected, expect.any(AbortSignal))
    expect(wrapper.find('input[aria-label="请求关联 ID"]').exists()).toBe(true)
    expect(wrapper.getComponent(ElPagination).props()).toMatchObject({
      currentPage: 3,
      pageSize: 50,
    })
    const link = wrapper.vm.$route.fullPath
    wrapper.unmount()
    wrappers.pop()
    vi.mocked(listGlobalAuditRecords).mockClear()
    const refreshed = await setup(link)
    expect(listGlobalAuditRecords).toHaveBeenCalledTimes(1)
    expect(listGlobalAuditRecords).toHaveBeenLastCalledWith(expected, expect.any(AbortSignal))
    expect((refreshed.get('input[aria-label="操作人"]').element as HTMLInputElement).value).toBe(
      'operator-2',
    )
  })

  it('同一页面切换目标、前进和后退会恢复目标及已提交条件', async () => {
    const wrapper = await setup('/app/audit?resourceType=user&resourceId=staff-001&timeRange=all')
    const router = wrapper.vm.$router
    await router.push('/app/audit?resourceType=personalSecret&resourceId=secret-002&timeRange=all')
    await flushPromises()
    expect(listGlobalAuditRecords).toHaveBeenLastCalledWith(
      expect.objectContaining({ resourceType: 'personalSecret', resourceId: 'secret-002' }),
      expect.any(AbortSignal),
    )
    await wrapper.get('input[aria-label="资源 ID"]').setValue('unsubmitted')
    router.back()
    await flushPromises()
    expect(listGlobalAuditRecords).toHaveBeenLastCalledWith(
      expect.objectContaining({ resourceType: 'user', resourceId: 'staff-001' }),
      expect.any(AbortSignal),
    )
    expect((wrapper.get('input[aria-label="资源 ID"]').element as HTMLInputElement).value).toBe(
      'staff-001',
    )
    router.forward()
    await flushPromises()
    expect(listGlobalAuditRecords).toHaveBeenLastCalledWith(
      expect.objectContaining({ resourceType: 'personalSecret', resourceId: 'secret-002' }),
      expect.any(AbortSignal),
    )
  })

  it.each([
    ['resourceId=one&resourceId=two', '重复'],
    ['timeRange=unknown', '时间范围'],
    ['startAt=2026-10-01T00%3A00%3A00Z', '起止时间'],
    ['startAt=2026-02-30T00%3A00%3A00Z&endAt=2026-03-31T00%3A00%3A00Z', '起止时间'],
    ['startAt=2026-10-01T24%3A00%3A00Z&endAt=2026-10-02T23%3A00%3A00Z', '起止时间'],
    ['timeRange=all&startAt=2026-10-01T00%3A00%3A00Z&endAt=2026-10-02T00%3A00%3A00Z', '起止时间'],
    ['batchId=invalid', 'UUID'],
    ['resultCode=unknown', '操作结果'],
  ])('无效链接 %s 会阻止查询，重置后恢复', async (query, message) => {
    const wrapper = await setup(`/app/audit?${query}`)
    expect(listGlobalAuditRecords).not.toHaveBeenCalled()
    expect(wrapper.get('[role="alert"]').text()).toContain(message)
    expect(wrapper.get('[aria-label="刷新当前页面"]').attributes('disabled')).toBeDefined()
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '重置')!
      .trigger('click')
    await flushPromises()
    expect(listGlobalAuditRecords).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('超出总数的页码会回到最后一页，并修正 URL', async () => {
    vi.mocked(listGlobalAuditRecords).mockResolvedValue({ list: [], total: 0 })
    const wrapper = await setup(
      '/app/audit?resourceType=user&resourceId=staff-001&timeRange=all&pageNum=99',
    )
    await flushPromises()
    expect(wrapper.vm.$route.query.pageNum).toBe('1')
    expect(listGlobalAuditRecords).toHaveBeenCalledTimes(2)
    expect(listGlobalAuditRecords).toHaveBeenLastCalledWith(
      expect.objectContaining({ pageNum: 1, resourceId: 'staff-001' }),
      expect.any(AbortSignal),
    )
  })

  it('组合筛选、分页使用已提交的条件，修改未提交条件不会改变查询', async () => {
    const wrapper = await setup()
    wrapper.findAllComponents(ElSelect)[0]!.vm.$emit('update:modelValue', 'folder')
    wrapper.findAllComponents(ElSelect)[1]!.vm.$emit('update:modelValue', 'failure')
    await wrapper.get('input[aria-label="资源 ID"]').setValue(' deleted-id ')
    await wrapper.get('input[aria-label="操作动作"]').setValue(' folder.delete ')
    await wrapper.get('input[aria-label="操作人"]').setValue(' other-user ')
    wrapper.getComponent(ElDatePicker).vm.$emit('update:modelValue', null)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(listGlobalAuditRecords).toHaveBeenLastCalledWith(
      expect.objectContaining({
        resourceType: 'folder',
        resourceId: 'deleted-id',
        actionCode: 'folder.delete',
        createBy: 'other-user',
        resultCode: 'failure',
        startAt: undefined,
        endAt: undefined,
        pageNum: 1,
      }),
      expect.any(AbortSignal),
    )
    await wrapper.get('input[aria-label="资源 ID"]').setValue('unsubmitted-id')
    await wrapper.get('.el-pagination .btn-next').trigger('click')
    await flushPromises()
    expect(listGlobalAuditRecords).toHaveBeenLastCalledWith(
      expect.objectContaining({ resourceId: 'deleted-id', pageNum: 2 }),
      expect.any(AbortSignal),
    )
    wrapper.getComponent(ElPagination).vm.$emit('update:page-size', 50)
    await flushPromises()
    expect(listGlobalAuditRecords).toHaveBeenLastCalledWith(
      expect.objectContaining({ pageNum: 1, pageSize: 50 }),
      expect.any(AbortSignal),
    )
  })

  it('批次 UUID 校验靠近筛选区，重置清除高级筛选和页码', async () => {
    const wrapper = await setup()
    await wrapper.get('[aria-controls="audit-advanced-filters"]').trigger('click')
    await wrapper.get('input[aria-label="批次 ID"]').setValue('invalid')
    const count = vi.mocked(listGlobalAuditRecords).mock.calls.length
    await wrapper.get('form').trigger('submit')
    expect(listGlobalAuditRecords).toHaveBeenCalledTimes(count)
    expect(wrapper.get('[role="alert"]').text()).toContain('UUID')
    await wrapper
      .get('input[aria-label="批次 ID"]')
      .setValue('d27a0b38-0cbc-4f20-adbd-ea92f8cc6e3e')
    await wrapper.get('input[aria-label="请求关联 ID"]').setValue('req-9')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(listGlobalAuditRecords).toHaveBeenLastCalledWith(
      expect.objectContaining({
        batchId: 'd27a0b38-0cbc-4f20-adbd-ea92f8cc6e3e',
        correlationId: 'req-9',
      }),
      expect.any(AbortSignal),
    )
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '重置')!
      .trigger('click')
    await flushPromises()
    expect(listGlobalAuditRecords).toHaveBeenLastCalledWith(
      expect.objectContaining({ batchId: undefined, correlationId: undefined, pageNum: 1 }),
      expect.any(AbortSignal),
    )
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('查看失败原因和安全详情，脱敏字段不渲染原值', async () => {
    vi.mocked(listGlobalAuditRecords).mockResolvedValue({
      list: [
        record({
          resultCode: 'failure',
          failureCode: 'PERMISSION_DENIED',
          failureReason: '无权修改该资源',
          changeDetail: [
            {
              field: 'values.prod',
              redacted: true,
              before: 'never-show-before',
              after: 'never-show-after',
              changed: true,
            },
            { field: 'remark', redacted: false, before: '旧备注', after: '新备注' },
          ],
        }),
      ],
      total: 1,
    })
    const wrapper = await setup()
    await wrapper.get('[aria-label="查看日志详情"]').trigger('click')
    await flushPromises()
    const detail = document.body.querySelector('.audit-detail')!
    expect(detail.textContent).toContain('无权修改该资源')
    expect(detail.textContent).toContain('内容已脱敏')
    expect(detail.textContent).toContain('新备注')
    expect(detail.textContent).toContain('request-1')
    expect(detail.textContent).not.toContain('never-show')
  })

  it('403 显示无权状态，重试成功后恢复列表', async () => {
    vi.mocked(listGlobalAuditRecords).mockRejectedValueOnce(
      new ApiError({ code: 403, httpStatus: 403, msg: 'Forbidden' }),
    )
    const wrapper = await setup()
    expect(wrapper.get('[role="alert"]').text()).toContain('没有查看审计日志的权限')
    expect(wrapper.get('.audit-results__body').attributes('aria-busy')).toBe('false')
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '重新加载')!
      .trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('已删除的文件夹')
  })

  it('迟到的响应不能覆盖新筛选，离开页面会取消在途请求', async () => {
    let resolveOld!: (value: { list: AuditRecord[]; total: number }) => void
    vi.mocked(listGlobalAuditRecords).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve
        }),
    )
    const wrapper = await setup()
    const firstSignal = vi.mocked(listGlobalAuditRecords).mock.calls[0]![1]!
    await wrapper.get('input[aria-label="资源 ID"]').setValue('new-id')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(firstSignal.aborted).toBe(true)
    resolveOld({ list: [record({ resourceName: '过期响应' })], total: 1 })
    await flushPromises()
    expect(wrapper.text()).not.toContain('过期响应')
    expect(wrapper.text()).toContain('已删除的文件夹')
    const lastSignal = vi.mocked(listGlobalAuditRecords).mock.calls.at(-1)![1]!
    wrapper.unmount()
    wrappers.pop()
    expect(lastSignal.aborted).toBe(true)
  })
})
