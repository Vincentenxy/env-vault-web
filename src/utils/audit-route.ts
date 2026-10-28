import type { LocationQuery, LocationQueryRaw, RouteLocationRaw } from 'vue-router'
import type { ListGlobalAuditRequest } from '@/api/audit'
import type { AuditResult } from '@/types/audit'

export const auditPageSizes = [20, 50, 100, 200]
const filterKeys = [
  'resourceType',
  'resourceId',
  'actionCode',
  'createBy',
  'resultCode',
  'batchId',
  'correlationId',
  'traceId',
] as const

export interface AuditFilterDraft {
  resourceType: string
  resourceId: string
  actionCode: string
  createBy: string
  resultCode: AuditResult | ''
  batchId: string
  correlationId: string
  traceId: string
}

export function recentAuditWeek(): [Date, Date] {
  const end = new Date()
  end.setHours(23, 59, 59, 999)
  const start = new Date(end)
  start.setDate(start.getDate() - 6)
  start.setHours(0, 0, 0, 0)
  return [start, end]
}

/** Resource links show the complete history, including events older than a week. */
export function auditResourceLocation(resourceType: string, resourceId: string): RouteLocationRaw {
  return { name: 'AuditLog', query: { resourceType, resourceId, timeRange: 'all' } }
}

/** Only navigation fields are written to the URL; resource objects and values never enter it. */
export function auditRouteQuery(request: ListGlobalAuditRequest): LocationQueryRaw {
  const query: Record<string, string> = {}
  for (const key of filterKeys) {
    const value = request[key]?.trim()
    if (value) query[key] = value
  }
  if (request.startAt) query.startAt = request.startAt
  if (request.endAt) query.endAt = request.endAt
  if (!request.startAt && !request.endAt) query.timeRange = 'all'
  query.pageNum = String(request.pageNum || 1)
  query.pageSize = String(request.pageSize || 20)
  return query
}

export function isSameAuditQuery(left: LocationQuery, right: LocationQueryRaw): boolean {
  return (
    Object.keys(left).length === Object.keys(right).length &&
    Object.keys(right).every((key) => left[key] === right[key])
  )
}

function readTimestamp(value: string): Date | undefined {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.exec(value)
  if (!match) return
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ]
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > days[month - 1]! ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  )
    return
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date
}

export function readAuditRoute(query: LocationQuery): {
  filters: AuditFilterDraft
  timeRange: [Date, Date] | null
  pageNum: number
  pageSize: number
  error: string
} {
  let error = ''
  function text(key: string): string {
    const value = query[key]
    if (Array.isArray(value)) {
      error = '链接中存在重复的筛选参数，请调整后重新查询'
      return ''
    }
    const result = typeof value === 'string' ? value.trim() : ''
    if (result.length > 512) error = '链接中的筛选参数过长，请调整后重新查询'
    return result
  }
  const resultCode = text('resultCode')
  if (resultCode && resultCode !== 'success' && resultCode !== 'failure')
    error = '链接中的操作结果无效，请重新选择'
  const filters: AuditFilterDraft = {
    resourceType: text('resourceType'),
    resourceId: text('resourceId'),
    actionCode: text('actionCode'),
    createBy: text('createBy'),
    resultCode: resultCode === 'success' || resultCode === 'failure' ? resultCode : '',
    batchId: text('batchId'),
    correlationId: text('correlationId'),
    traceId: text('traceId'),
  }
  const mode = text('timeRange')
  const startAt = text('startAt')
  const endAt = text('endAt')
  let timeRange: [Date, Date] | null = mode === 'all' ? null : recentAuditWeek()
  if (mode && mode !== 'all') error = '链接中的时间范围无效，请重新选择'
  if (startAt || endAt) {
    const start = readTimestamp(startAt)
    const end = readTimestamp(endAt)
    if (mode === 'all' || !start || !end || start > end) {
      error = '链接中的起止时间无效，请重新选择完整时间范围'
      timeRange = null
    } else {
      timeRange = [start, end]
    }
  }
  function positivePage(key: string, fallback: number): number {
    const value = Number(text(key))
    return Number.isSafeInteger(value) && value > 0 ? value : fallback
  }
  const size = positivePage('pageSize', 20)
  const pageSize = auditPageSizes.includes(size) ? size : 20
  let pageNum = positivePage('pageNum', 1)
  if (!Number.isSafeInteger((pageNum - 1) * pageSize)) pageNum = 1
  return { filters, timeRange, pageNum, pageSize, error }
}
