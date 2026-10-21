import { createApp } from 'vue'
import { createPinia } from 'pinia'
import 'element-plus/theme-chalk/dark/css-vars.css'
// ElMessage / ElMessageBox / ElNotification 是函数式 API,
// unplugin-vue-components 不会自动注入它们的样式,这里集中显式引入。
import 'element-plus/theme-chalk/el-message.css'
import 'element-plus/theme-chalk/el-message-box.css'
import 'element-plus/theme-chalk/el-notification.css'
import App from './App.vue'
import { router } from './router'
import { useThemeStore } from './stores/theme'
import { useAuthStore } from './stores/auth'
import { installPlatformBridge, isPlatformEmbedded } from './utils/platform'
import { stripAppBase } from './utils/app-base-path'
import { isCompanyAuth, loadAuthConfig } from './config/auth'

import './assets/styles/index.scss'
import './assets/styles/auth-bootstrap.scss'

/** 配置加载失败时停留在重试页，避免错误地回退到另一种认证方式 */
async function bootstrap(): Promise<void> {
  const root = document.querySelector<HTMLElement>('#app')!
  root.classList.add('auth-bootstrap')
  root.setAttribute('role', 'status')
  root.setAttribute('aria-busy', 'true')
  root.textContent = '正在加载认证配置'
  try {
    await loadAuthConfig()
  } catch {
    root.setAttribute('aria-busy', 'false')
    const message = document.createElement('p')
    message.textContent = '认证配置加载失败，请重试或联系管理员'
    const retry = document.createElement('button')
    retry.type = 'button'
    retry.textContent = '重新加载'
    retry.onclick = () => void bootstrap()
    root.replaceChildren(message, retry)
    return
  }
  root.classList.remove('auth-bootstrap')
  root.removeAttribute('role')
  root.removeAttribute('aria-busy')

  const app = createApp(App)
  const pinia = createPinia()

  app.use(pinia)
  app.use(router)
  if (isPlatformEmbedded) {
    void router.replace(`${stripAppBase(location.pathname)}${location.search}${location.hash}`)
  }

  // 启动阶段:先把主题应用到 DOM(避免首屏闪烁)
  const theme = useThemeStore()
  installPlatformBridge(router, theme.setMode)
  theme.applyToDom()

  // 启动阶段:如果本地有 token,后台静默 /me 拉一次用户信息
  const auth = useAuthStore()
  if (!isCompanyAuth && auth.isAuthenticated) {
    void auth.refreshMe()
  }

  app.mount('#app')
}

void bootstrap()
