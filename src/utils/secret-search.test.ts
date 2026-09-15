import { describe, expect, it } from 'vitest'
import { createSecretSearchPreview } from '@/views/secret/secret-search.mock'
import { buildSecretSearchRows, secretSearchSpan } from './secret-search'

describe('检索结果单元格合并', () => {
  it('同范围的多个密钥连续展示，Key 和历史仅跨自己的环境合并', () => {
    const { groups } = createSecretSearchPreview()
    const rows = buildSecretSearchRows([groups[0]!, groups[2]!, groups[1]!, groups[3]!, groups[4]!])
    expect(rows).toHaveLength(14)
    expect(rows.filter((row) => row.scopeSpan).map((row) => row.scopeSpan)).toEqual([7, 4, 3])
    expect(rows.filter((row) => row.secretSpan).map((row) => row.secretSpan)).toEqual([
      4, 3, 2, 2, 3,
    ])
    expect(secretSearchSpan({ row: rows[0]!, columnIndex: 0 })).toEqual([7, 1])
    expect(secretSearchSpan({ row: rows[1]!, columnIndex: 0 })).toEqual([0, 0])
    expect(secretSearchSpan({ row: rows[4]!, columnIndex: 5 })).toEqual([3, 1])
    expect(secretSearchSpan({ row: rows[1]!, columnIndex: 3 })).toEqual([1, 1])
    expect(secretSearchSpan({ row: rows[1]!, columnIndex: 4 })).toEqual([1, 1])
  })

  it('不同项目的同名 Key 和同名目录不合并', () => {
    const rows = buildSecretSearchRows(createSecretSearchPreview().groups)
    const domains = rows.filter((row) => row.secretSpan && row.secret.key === 'SERVICE_DOMAIN')
    expect(domains).toHaveLength(2)
    expect(domains.map((row) => row.secret.scope.project.name)).toEqual(['支付服务', '用户中心'])
    expect(
      rows.filter((row) => row.scopeSpan && row.secret.scope.folders.at(-1)?.code === 'common'),
    ).toHaveLength(2)
    expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length)
  })

  it('环境筛选后重新计算跨度，空值仍占一行', () => {
    const groups = createSecretSearchPreview().groups.map((secret) => ({
      ...secret,
      values: secret.values.filter((env) => env.envCode === 'prod'),
    }))
    const rows = buildSecretSearchRows(groups)
    expect(rows).toHaveLength(5)
    expect(rows.filter((row) => row.scopeSpan).map((row) => row.scopeSpan)).toEqual([2, 2, 1])
    expect(rows.every((row) => row.secretSpan === 1)).toBe(true)
    expect(rows.find((row) => row.secret.key === 'CALLBACK_URL')?.environment.value).toBe('')
    expect(buildSecretSearchRows(groups.map((secret) => ({ ...secret, values: [] })))).toEqual([])
  })
})
