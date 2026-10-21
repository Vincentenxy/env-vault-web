/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BASE_PATH?: string
  readonly VITE_API_BASE: string
  readonly VITE_API_PROXY_TARGET?: string
  readonly VITE_APP_TITLE: string
  readonly VITE_AUTH_MODE?: 'local' | 'company'
  readonly VITE_COMPANY_LOGIN_URL?: string
  readonly VITE_COMPANY_RETURN_URL_PARAM?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>
  export default component
}
