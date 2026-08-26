/** 主密钥当前的加载来源 */
export type MasterKeySource = '' | 'config' | 'shares' | 'peer'

/** 主密钥状态接口返回的不敏感运行信息 */
export interface MasterKeyStatus {
  ready: boolean
  source: MasterKeySource
  totalShares: number
  requiredShares: number
}

/** 管理员一次提交的主密钥分片 */
export interface SubmitMasterKeySharesRequest {
  shares: string[]
}
