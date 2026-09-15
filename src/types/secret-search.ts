import type { SecretBatchDetailItem, SecretHistoryResponse, SecretTag } from '@/api/secret'
import type { PageResp } from '@/types/api'

export interface SecretSearchScope {
  tenant: { id: string; name: string }
  organization: { id: string; name: string }
  project: { id: string; name: string }
  // 从根目录到当前目录，id 使用跨环境的 folderGroupId
  folders: { id: string; name: string; code: string }[]
}

export interface SecretSearchEnvironmentValue {
  secretId: string
  envId: string
  envCode: string
  envName: string
  orderNo: number
  value: string
  version: number
  updateAt: string
  // 前端显隐状态，不代表后端授权结果，不作为搜索接口字段
  masked: boolean
}

export interface SecretSearchGroup {
  groupId: string
  key: string
  remark: string
  scope: SecretSearchScope
  tagList: SecretTag[]
  values: SecretSearchEnvironmentValue[]
}

// 搜索接口每项对应一个完整的逻辑密钥组，前端适配时补入 masked
export type SecretSearchResultItem = Omit<SecretSearchGroup, 'values'> & {
  values: Omit<SecretSearchEnvironmentValue, 'masked'>[]
}

// total 统计符合条件的密钥组总数，list 只包含当前页
export type SecretSearchResultPage = Pick<PageResp<SecretSearchResultItem>, 'total' | 'list'>

// 模拟数据仅供独立预览入口注入，不接管正式页面的数据请求
export interface SecretSearchPreviewData {
  groups: SecretSearchGroup[]
  histories: Record<string, SecretHistoryResponse>
  batches: Record<string, SecretBatchDetailItem[]>
}
