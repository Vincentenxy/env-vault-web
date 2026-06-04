<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Key, ArrowRight } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'
import { ApiError } from '@/types/api'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const tokenInput = ref('')
const submitting = ref(false)
const errorMessage = ref('')

/** 自动剥 "Bearer " 前缀并 trim;空串返回 undefined。 */
const normalizedToken = computed<string | undefined>(() => {
  const t = tokenInput.value.trim()
  if (!t) return undefined
  return t.replace(/^Bearer\s+/i, '').trim() || undefined
})

async function onSubmit(): Promise<void> {
  errorMessage.value = ''
  const t = normalizedToken.value
  if (!t) {
    errorMessage.value = '请输入 Bearer token'
    return
  }
  submitting.value = true
  try {
    await auth.login(t)
    ElMessage.success('登录成功')
    const redirect = (route.query.redirect as string | undefined) ?? '/app/organizations'
    await router.replace(redirect)
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.code === 1401) {
        errorMessage.value = 'token 无效或已过期,请检查后重试'
      } else {
        errorMessage.value = e.message || '登录失败'
      }
    } else {
      errorMessage.value = '登录失败,请检查网络'
    }
  } finally {
    submitting.value = false
  }
}
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
        <h1 class="login-page__brand-title">统一的密钥管理平台</h1>
        <p class="login-page__brand-desc">
          集中化存储、分发、审计你的项目密钥与环境变量。
        </p>
        <ul class="login-page__brand-features">
          <li>组织 · 项目 · 环境 三级隔离</li>
          <li>RBAC + 审计日志 + 强制删除</li>
          <li>支持密钥引用与目录分组</li>
        </ul>
      </div>

      <p class="login-page__brand-foot">© EnvVault {{ new Date().getFullYear() }}</p>
    </aside>

    <!-- 右侧:表单区 -->
    <main class="login-page__form-wrap">
      <div class="login-page__form-inner">
        <h2 class="login-page__form-title">登录</h2>
        <p class="login-page__form-sub">
          开发自测入口:粘贴后端签发的 JWT 完成身份校验。
        </p>

        <form class="login-page__form" @submit.prevent="onSubmit">
          <label class="login-page__field-label" for="token">
            <el-icon><Key /></el-icon>
            Bearer token
          </label>
          <el-input
            id="token"
            v-model="tokenInput"
            type="textarea"
            :rows="5"
            :autosize="{ minRows: 5, maxRows: 10 }"
            placeholder="粘贴 JWT,带不带 Bearer 前缀都可以"
            spellcheck="false"
            autocomplete="off"
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
            :loading="submitting"
            class="login-page__submit"
            @click="onSubmit"
          >
            登录
            <el-icon class="login-page__submit-icon"><ArrowRight /></el-icon>
          </el-button>

          <p class="login-page__hint">
            本入口仅供本地 / 联调使用,生产环境请接入外部 IdP。
          </p>
        </form>
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
    background:
      radial-gradient(circle at 20% 0%, rgba(124, 58, 237, 0.4) 0%, transparent 50%),
      radial-gradient(circle at 80% 100%, rgba(79, 70, 229, 0.3) 0%, transparent 50%),
      #0b0c0e;
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
      background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%);
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
    letter-spacing: -0.5px;
  }

  &__brand-desc {
    margin: 0 0 28px;
    font-size: 15px;
    line-height: 1.6;
    color: rgba(255, 255, 255, 0.7);
  }

  &__brand-features {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 10px;

    li {
      position: relative;
      padding-left: 22px;
      font-size: 14px;
      color: rgba(255, 255, 255, 0.85);

      &::before {
        content: '';
        position: absolute;
        left: 0;
        top: 7px;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: rgba(124, 58, 237, 0.3);
        border: 1px solid rgba(167, 139, 250, 0.6);
      }
    }
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
