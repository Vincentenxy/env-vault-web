<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ArrowRight, KeyRound, RefreshCw, ShieldCheck } from '@lucide/vue'
import { useRoute, useRouter } from 'vue-router'
import { useMasterKeyStore } from '@/stores/master-key'
import { ApiError } from '@/types/api'
import { notify } from '@/utils/notify'
import { resolveMasterKeyRedirect } from '@/utils/master-key-route'

defineOptions({ name: 'MasterKeyView' })

const route = useRoute()
const router = useRouter()
const masterKey = useMasterKeyStore()

// 分片属于敏感信息，只在当前页面组件内短暂持有
const shares = ref<[string, string, string]>(['', '', ''])
const errorMessage = ref('')

const requiredShares = computed(() => masterKey.status?.requiredShares ?? 3)
const totalShares = computed(() => masterKey.status?.totalShares ?? 5)
const canSubmit = computed(
  () => masterKey.status?.ready === false && shares.value.every((share) => share.trim().length > 0),
)

/** 主密钥就绪后返回触发启动拦截前的站内页面 */
async function leaveSetupPage(): Promise<void> {
  const target = resolveMasterKeyRedirect(route.query.redirect)
  await router.replace(target)
}

/** 查询系统状态，已经就绪时不再展示分片表单 */
async function loadStatus(): Promise<void> {
  if (masterKey.checking) return

  errorMessage.value = ''
  try {
    const current = await masterKey.fetchStatus()
    if (current.ready) await leaveSetupPage()
  } catch (error) {
    errorMessage.value = error instanceof ApiError ? error.message : '系统状态查询失败，请重试'
  }
}

/** 整批提交三个分片，成功后清理输入并进入业务页面 */
async function submitShares(): Promise<void> {
  if (!canSubmit.value || masterKey.submitting) {
    errorMessage.value = '请填写三份密钥分片'
    return
  }

  errorMessage.value = ''
  const normalizedShares = shares.value.map((share) => share.trim())
  try {
    const current = await masterKey.submitShares(normalizedShares)
    if (!current.ready) {
      errorMessage.value = '主密钥尚未就绪，请重新检查分片'
      return
    }

    clearShares()
    notify.success('系统主密钥已加载')
    await leaveSetupPage()
  } catch (error) {
    errorMessage.value = error instanceof ApiError ? error.message : '密钥分片提交失败，请重试'
  }
}

/** 解除页面对分片字符串的引用 */
function clearShares(): void {
  shares.value = ['', '', '']
}

onMounted(() => {
  void loadStatus()
})

onBeforeUnmount(() => {
  clearShares()
})
</script>

<template>
  <main class="master-key-page">
    <header class="master-key-page__header">
      <span class="master-key-page__brand">
        <span class="master-key-page__brand-icon" aria-hidden="true">
          <ShieldCheck :size="19" :stroke-width="1.8" />
        </span>
        <strong>EnvVault</strong>
      </span>

      <span class="master-key-page__state">
        <span class="master-key-page__state-dot" />
        {{ masterKey.checking ? '正在检查系统状态' : '等待主密钥' }}
      </span>
    </header>

    <section v-loading="masterKey.checking" class="master-key-panel">
      <header class="master-key-panel__header">
        <span class="master-key-panel__icon" aria-hidden="true">
          <KeyRound :size="22" :stroke-width="1.8" />
        </span>
        <span class="master-key-panel__heading">
          <h1>加载系统主密钥</h1>
          <p>需要 {{ requiredShares }} / {{ totalShares }} 份同批次分片</p>
        </span>

        <el-tooltip content="重新检查系统状态" placement="bottom">
          <button
            type="button"
            class="master-key-panel__refresh"
            :disabled="masterKey.checking || masterKey.submitting"
            aria-label="重新检查系统状态"
            @click="loadStatus"
          >
            <RefreshCw :size="17" :stroke-width="1.8" />
          </button>
        </el-tooltip>
      </header>

      <form
        v-if="masterKey.status?.ready === false"
        class="master-key-form"
        @submit.prevent="submitShares"
      >
        <label v-for="(_, index) in shares" :key="index" class="master-key-form__field">
          <span>
            <strong>密钥分片 {{ index + 1 }}</strong>
            <small>EVS1</small>
          </span>
          <el-input
            v-model="shares[index]"
            type="password"
            show-password
            clearable
            spellcheck="false"
            autocomplete="off"
            :placeholder="`输入第 ${index + 1} 份密钥分片`"
            :disabled="masterKey.submitting"
          />
        </label>

        <el-alert
          v-if="errorMessage"
          :title="errorMessage"
          type="error"
          show-icon
          :closable="false"
          class="master-key-form__alert"
        />

        <footer class="master-key-form__footer">
          <span>分片仅用于本次内存恢复</span>
          <el-button
            native-type="submit"
            type="primary"
            :loading="masterKey.submitting"
            :disabled="!canSubmit || masterKey.checking"
          >
            加载主密钥
            <ArrowRight :size="15" :stroke-width="2" />
          </el-button>
        </footer>
      </form>

      <section v-else-if="!masterKey.checking" class="master-key-unavailable">
        <el-alert
          :title="errorMessage || '暂时无法读取系统状态'"
          type="error"
          show-icon
          :closable="false"
        />
        <el-button type="primary" plain :loading="masterKey.checking" @click="loadStatus">
          <RefreshCw :size="15" :stroke-width="1.8" />
          重新检查
        </el-button>
      </section>
    </section>
  </main>
</template>

<style lang="scss" scoped>
.master-key-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--v-app-bg);
  color: var(--v-text-primary);

  &__header {
    min-height: 58px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 0 28px;
    border-bottom: 1px solid var(--v-divider);
    background: var(--v-surface-bg);
  }

  &__brand,
  &__state {
    display: inline-flex;
    align-items: center;
  }

  &__brand {
    gap: 9px;
    font-size: 15px;
  }

  &__brand-icon {
    width: 32px;
    height: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--v-radius-md);
    background: #176dfb;
    color: #fff;
  }

  &__state {
    gap: 8px;
    font-size: var(--v-font-sm);
    color: var(--v-text-secondary);
  }

  &__state-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--v-color-warning);
    box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.14);
  }
}

.master-key-panel {
  width: min(680px, calc(100% - 32px));
  margin: auto;
  border: 1px solid var(--v-surface-border);
  border-radius: var(--v-radius-md);
  background: var(--v-surface-bg);
  box-shadow: var(--v-shadow-md);
  overflow: hidden;

  &__header {
    min-height: 82px;
    display: grid;
    grid-template-columns: 42px minmax(0, 1fr) 34px;
    align-items: center;
    gap: 14px;
    padding: 18px 22px;
    border-bottom: 1px solid var(--v-divider);
  }

  &__icon {
    width: 42px;
    height: 42px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--v-radius-md);
    background: rgba(23, 109, 251, 0.1);
    color: #176dfb;
  }

  &__heading {
    min-width: 0;

    h1 {
      margin: 0;
      font-size: 18px;
      line-height: 1.35;
      letter-spacing: 0;
    }

    p {
      margin: 4px 0 0;
      font-size: var(--v-font-sm);
      color: var(--v-text-secondary);
    }
  }

  &__refresh {
    width: 34px;
    height: 34px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid transparent;
    border-radius: var(--v-radius-sm);
    background: transparent;
    color: var(--v-text-secondary);
    cursor: pointer;

    &:hover:not(:disabled) {
      border-color: var(--v-surface-border);
      background: var(--v-surface-bg-subtle);
      color: var(--v-text-primary);
    }

    &:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
  }
}

.master-key-form {
  padding: 22px;

  &__field {
    display: grid;
    grid-template-columns: 126px minmax(0, 1fr);
    align-items: center;
    gap: 16px;

    & + & {
      margin-top: 16px;
    }

    > span {
      min-width: 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    strong {
      font-size: var(--v-font-sm);
      font-weight: 600;
      white-space: nowrap;
    }

    small {
      padding: 2px 5px;
      border: 1px solid var(--v-surface-border);
      border-radius: 4px;
      color: var(--v-text-tertiary);
      font-size: 10px;
      line-height: 1.2;
    }
  }

  &__alert {
    margin-top: 18px;
  }

  &__footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin: 22px -22px -22px;
    padding: 14px 22px;
    border-top: 1px solid var(--v-divider);
    background: var(--v-surface-bg-subtle);

    > span {
      font-size: var(--v-font-xs);
      color: var(--v-text-tertiary);
    }

    .el-button {
      min-width: 132px;
      height: 36px;
      display: inline-flex;
      gap: 6px;
      border-radius: var(--v-radius-md);
      font-weight: 600;
    }
  }
}

.master-key-unavailable {
  min-height: 180px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
  padding: 24px;

  .el-alert {
    max-width: 480px;
  }

  .el-button {
    display: inline-flex;
    gap: 6px;
  }
}

@media (max-width: 640px) {
  .master-key-page {
    &__header {
      min-height: 54px;
      padding: 0 16px;
    }

    &__state {
      font-size: var(--v-font-xs);
    }
  }

  .master-key-panel {
    margin: 24px auto;

    &__header {
      padding: 16px;
    }
  }

  .master-key-form {
    padding: 18px 16px;

    &__field {
      grid-template-columns: 1fr;
      gap: 7px;
    }

    &__footer {
      align-items: stretch;
      flex-direction: column;
      margin: 20px -16px -18px;
      padding: 14px 16px;

      > span {
        text-align: center;
      }

      .el-button {
        width: 100%;
      }
    }
  }
}
</style>
