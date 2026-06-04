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

import './assets/styles/index.scss'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)

// 启动阶段:先把主题应用到 DOM(避免首屏闪烁)
const theme = useThemeStore()
theme.applyToDom()

// 启动阶段:如果本地有 token,后台静默 /me 拉一次用户信息
const auth = useAuthStore()
if (auth.isAuthenticated) {
  void auth.refreshMe()
}

app.mount('#app')
