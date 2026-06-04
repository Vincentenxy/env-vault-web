import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { applyPrimaryColor, DefaultPrimaryColor } from '@/utils/color'
import { storage } from '@/utils/storage'

export type ThemeMode = 'light' | 'dark'

interface PersistedTheme {
  mode: ThemeMode
  primaryColor: string
}

const STORAGE_KEY = 'envvault.theme'
const DEFAULT: PersistedTheme = { mode: 'light', primaryColor: DefaultPrimaryColor }

/**
 * 主题 store。
 * - mode: light / dark
 * - primaryColor: 主色 hex
 * 两者都持久化到 localStorage,启动时从 storage 读出。
 * 变更时自动 apply 到 DOM(documentElement class + CSS 变量)。
 */
export const useThemeStore = defineStore('theme', () => {
  const persisted = storage.get<PersistedTheme>(STORAGE_KEY, DEFAULT)
  const mode = ref<ThemeMode>(persisted.mode)
  const primaryColor = ref<string>(persisted.primaryColor || DefaultPrimaryColor)

  function setMode(next: ThemeMode): void {
    mode.value = next
  }

  function toggleMode(): void {
    mode.value = mode.value === 'light' ? 'dark' : 'light'
  }

  function setPrimaryColor(color: string): void {
    primaryColor.value = color
  }

  function reset(): void {
    mode.value = DEFAULT.mode
    primaryColor.value = DEFAULT.primaryColor
  }

  function applyToDom(): void {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    root.classList.toggle('dark', mode.value === 'dark')
    applyPrimaryColor(primaryColor.value)
  }

  watch(
    [mode, primaryColor],
    () => {
      storage.set<PersistedTheme>(STORAGE_KEY, { mode: mode.value, primaryColor: primaryColor.value })
      applyToDom()
    },
    { flush: 'post' },
  )

  return { mode, primaryColor, setMode, toggleMode, setPrimaryColor, reset, applyToDom }
})
