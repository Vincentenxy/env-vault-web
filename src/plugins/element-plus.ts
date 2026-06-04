import type { App } from 'vue'
import zhCn from 'element-plus/es/locale/lang/zh-cn'

/**
 * Element Plus 初始化入口。
 *
 * 组件按需自动引入由 `unplugin-vue-components` 完成(见 vite.config.ts),
 * 本函数只做全局级别的设置(语言、暗色初始化等),不引入具体组件。
 */
export function installElementPlus(app: App): void {
  // 这里只保留全局副作用位置,具体 locale / size / theme 由业务初始化时再注入。
  void zhCn
  void app
}
