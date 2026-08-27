<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowRight, Building2, LockKeyhole, UserRound } from '@lucide/vue'
import { useAuthStore } from '@/stores/auth'
import { useMasterKeyStore } from '@/stores/master-key'
import { ApiError } from '@/types/api'
import { resolveMasterKeyRedirect } from '@/utils/master-key-route'

const auth = useAuthStore()
const masterKey = useMasterKeyStore()
const router = useRouter()
const route = useRoute()

const form = reactive({ username: '', password: '' })
const submitting = ref(false)
const errorMessage = ref('')

const canSubmit = computed(() => form.username.trim().length > 0 && form.password.length > 0)

function loginRedirect(): string {
  const value = route.query.redirect
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
    return '/app/secrets'
  }
  try {
    const target = new URL(value, 'http://env-vault.local')
    if (target.origin !== 'http://env-vault.local' || target.pathname === '/login') {
      return '/app/secrets'
    }
    if (target.pathname === '/masterKey') {
      return resolveMasterKeyRedirect(target.searchParams.get('redirect'))
    }
    return `${target.pathname}${target.search}${target.hash}`
  } catch {
    return '/app/secrets'
  }
}

async function onSubmit(): Promise<void> {
  errorMessage.value = ''
  if (!canSubmit.value) {
    errorMessage.value = '请输入用户名和密码'
    return
  }
  submitting.value = true
  try {
    await auth.login({ username: form.username.trim(), password: form.password })
    form.password = ''
    const redirect = loginRedirect()
    const status = await masterKey.fetchStatus()
    ElMessage.success('登录成功')
    if (status.ready) {
      await auth.refreshMe()
      await router.replace(redirect)
    } else {
      await router.replace({ path: '/masterKey', query: { redirect } })
    }
  } catch (error) {
    if (error instanceof ApiError && error.httpStatus === 401) auth.logout()
    errorMessage.value = error instanceof ApiError ? error.message : '登录失败，请重试'
  } finally {
    submitting.value = false
  }
}

function onOidcLogin(): void {
  ElMessage.info('OIDC 登录暂未配置')
}

onBeforeUnmount(() => {
  form.password = ''
})
</script>

<template>
  <div class="login-page">
    <!-- 左侧:深色品牌区 -->
    <aside class="login-page__brand">
      <div class="login-page__brand-mark">
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M12 2L3 7v10l9 5 9-5V7l-9-5z"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linejoin="round"
          />
          <path
            d="M12 22V12M3 7l9 5 9-5"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linejoin="round"
          />
        </svg>
        <span>EnvVault</span>
      </div>

      <div class="login-page__brand-content">
        <h1 class="login-page__brand-title">EnvVault</h1>
        <p class="login-page__brand-desc">企业密钥管理平台</p>
      </div>

      <p class="login-page__brand-foot">© EnvVault {{ new Date().getFullYear() }}</p>
    </aside>

    <!-- 右侧:表单区 -->
    <main class="login-page__form-wrap">
      <div class="login-page__form-inner">
        <h2 class="login-page__form-title">登录</h2>
        <p class="login-page__form-sub">使用 EnvVault 本地账号进入系统</p>

        <form class="login-page__form" @submit.prevent="onSubmit">
          <label class="login-page__field-label" for="username">
            <UserRound :size="15" :stroke-width="1.8" />
            用户名
          </label>
          <el-input
            id="username"
            v-model="form.username"
            placeholder="请输入用户名"
            spellcheck="false"
            autocomplete="username"
            :disabled="submitting"
            class="login-page__input"
          />

          <label class="login-page__field-label" for="password">
            <LockKeyhole :size="15" :stroke-width="1.8" />
            密码
          </label>
          <el-input
            id="password"
            v-model="form.password"
            type="password"
            show-password
            placeholder="请输入密码"
            autocomplete="current-password"
            :disabled="submitting"
            class="login-page__input"
          />

          <el-alert
            v-if="errorMessage"
            :title="errorMessage"
            type="error"
            show-icon
            :closable="false"
            class="login-page__alert"
          />

          <el-button
            type="primary"
            size="large"
            native-type="submit"
            :loading="submitting"
            :disabled="!canSubmit"
            class="login-page__submit"
          >
            登录
            <ArrowRight :size="16" :stroke-width="2" class="login-page__submit-icon" />
          </el-button>
        </form>

        <div class="login-page__alternative">
          <span class="login-page__alternative-label">其他登录方式</span>
          <button
            type="button"
            class="login-page__oidc"
            aria-label="使用 OIDC 登录"
            @click="onOidcLogin"
          >
            <Building2 :size="18" :stroke-width="1.8" />
            <span>OIDC 登录</span>
          </button>
        </div>
      </div>
    </main>
  </div>
</template>

<style lang="scss" scoped>
.login-page {
  min-height: 100vh;
  display: grid;
  grid-template-columns: minmax(360px, 1fr) minmax(480px, 1.1fr);

  &__brand {
    background: #171717;
    color: #fff;
    padding: 40px 48px;
    display: flex;
    flex-direction: column;
    position: relative;
    overflow: hidden;
  }

  &__brand-mark {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 16px;
    font-weight: 600;
    color: #fff;
    z-index: 1;

    svg {
      width: 28px;
      height: 28px;
      padding: 4px;
      border-radius: 6px;
      background: #176dfb;
    }
  }

  &__brand-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    margin-top: 32px;
    max-width: 440px;
    z-index: 1;
  }

  &__brand-title {
    margin: 0 0 16px;
    font-size: 32px;
    font-weight: 700;
    line-height: 1.25;
    letter-spacing: 0;
  }

  &__brand-desc {
    margin: 0 0 28px;
    font-size: 15px;
    line-height: 1.6;
    color: rgba(255, 255, 255, 0.7);
  }

  &__brand-foot {
    margin: 0;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.4);
    z-index: 1;
  }

  &__form-wrap {
    background: var(--v-surface-bg);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 40px 32px;
  }

  &__form-inner {
    width: 100%;
    max-width: 380px;
  }

  &__form-title {
    margin: 0 0 6px;
    font-size: 24px;
    font-weight: 700;
    color: var(--v-text-primary);
  }

  &__form-sub {
    margin: 0 0 28px;
    font-size: 13px;
    color: var(--v-text-secondary);
    line-height: 1.5;
  }

  &__form {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  &__field-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 500;
    color: var(--v-text-primary);
  }

  &__input {
    --el-input-border-radius: var(--v-radius-md);
  }

  &__alert {
    margin-top: 4px;
  }

  &__submit {
    width: 100%;
    height: 42px;
    font-size: 14px;
    font-weight: 500;
    margin-top: 4px;
  }

  &__submit-icon {
    margin-left: 6px;
  }

  &__alternative {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    margin-top: 24px;
    padding-top: 20px;
    border-top: 1px solid var(--v-divider);
  }

  &__alternative-label {
    color: var(--v-text-tertiary);
    font-size: 12px;
  }

  &__oidc {
    min-width: 92px;
    min-height: 52px;
    padding: 6px 12px;
    border: 0;
    border-radius: var(--v-radius-md);
    background: transparent;
    color: var(--v-text-secondary);
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 5px;
    font: inherit;
    font-size: 12px;
    cursor: pointer;
    transition:
      color 0.18s ease,
      background-color 0.18s ease;

    &:hover,
    &:focus-visible {
      color: var(--el-color-primary);
      background: var(--el-color-primary-light-9);
    }

    &:focus-visible {
      outline: 2px solid var(--el-color-primary-light-5);
      outline-offset: 2px;
    }
  }

  &__hint {
    margin: 12px 0 0;
    text-align: center;
    color: var(--v-text-tertiary);
    font-size: 12px;
  }
}

@media (max-width: 768px) {
  .login-page {
    grid-template-columns: 1fr;

    &__brand {
      padding: 24px;
    }

    &__brand-content {
      margin-top: 16px;
    }

    &__brand-title {
      font-size: 22px;
    }
  }
}
</style>
