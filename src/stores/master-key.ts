import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getMasterKeyStatus, submitMasterKeyShares } from '@/api/master-key'
import type { MasterKeyStatus } from '@/types/master-key'

/** 管理系统启动阶段可公开读取的主密钥状态 */
export const useMasterKeyStore = defineStore('masterKey', () => {
  const status = ref<MasterKeyStatus | null>(null)
  const checking = ref(false)
  const submitting = ref(false)

  /** 查询 Ready 状态并更新页面使用的状态快照 */
  async function fetchStatus(): Promise<MasterKeyStatus> {
    checking.value = true
    try {
      const current = await getMasterKeyStatus({ silent: true })
      status.value = current
      return current
    } finally {
      checking.value = false
    }
  }

  /** 整批提交三个分片并保存激活后的最新状态 */
  async function submitShares(shares: string[]): Promise<MasterKeyStatus> {
    submitting.value = true
    try {
      const current = await submitMasterKeyShares({ shares }, { silent: true })
      status.value = current
      return current
    } finally {
      submitting.value = false
    }
  }

  return { status, checking, submitting, fetchStatus, submitShares }
})
