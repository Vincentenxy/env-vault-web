import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getMasterKeyStatus, submitMasterKeyShare } from '@/api/master-key'
import type { MasterKeyStatus } from '@/types/master-key'

/** 管理系统启动阶段经认证读取的主密钥状态 */
export const useMasterKeyStore = defineStore('masterKey', () => {
  const status = ref<MasterKeyStatus | null>(null)
  const checking = ref(false)
  const submitting = ref(false)

  /** 查询 Ready 状态并更新页面使用的状态快照 */
  async function fetchStatus(background = false): Promise<MasterKeyStatus> {
    if (!background) checking.value = true
    try {
      const current = await getMasterKeyStatus({ silent: true })
      status.value = current
      return current
    } finally {
      if (!background) checking.value = false
    }
  }

  /** 提交一份分片并保存累计后的最新状态 */
  async function submitShare(share: string): Promise<MasterKeyStatus> {
    submitting.value = true
    try {
      const current = await submitMasterKeyShare({ share }, { silent: true })
      status.value = current
      return current
    } finally {
      submitting.value = false
    }
  }

  return { status, checking, submitting, fetchStatus, submitShare }
})
