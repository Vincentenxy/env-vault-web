import type { Router } from 'vue-router'
import type { ThemeMode } from '@/stores/theme'
import { buildMasterKeyLocation, isMasterKeyRoute } from '@/utils/master-key-route'

function detectPlatform(): boolean {
  try {
    return (
      window.parent !== window &&
      window.parent.location.origin === window.location.origin &&
      /^\/app-envvault(?:\/|$)/.test(window.parent.location.pathname)
    )
  } catch {
    return false
  }
}

export const isPlatformEmbedded = detectPlatform()
let embeddedRouter: Router | undefined
let redirectingToMasterKey = false

function post(message: object): void {
  if (isPlatformEmbedded) {
    window.parent.postMessage({ source: 'env-vault', ...message }, window.location.origin)
  }
}

export function requestPlatformLogin(): void {
  post({ type: 'auth-required' })
}

/** Keep startup interception on the current in-memory route, without reloading the frame. */
export function redirectPlatformToMasterKey(): boolean {
  if (!embeddedRouter) return false
  const current = embeddedRouter.currentRoute.value
  if (!redirectingToMasterKey && !isMasterKeyRoute(current.path)) {
    redirectingToMasterKey = true
    void embeddedRouter.replace(buildMasterKeyLocation(current.fullPath)).finally(() => {
      redirectingToMasterKey = false
    })
  }
  return true
}

export function installPlatformBridge(router: Router, setMode: (mode: ThemeMode) => void): void {
  if (!isPlatformEmbedded) return
  embeddedRouter = router

  const syncTheme = () => {
    setMode(localStorage.getItem('theme')?.toLowerCase().includes('dark') ? 'dark' : 'light')
  }
  syncTheme()

  window.addEventListener('storage', (event) => {
    if (event.key === 'theme' || event.key === null) syncTheme()
  })
  window.addEventListener('message', (event: MessageEvent) => {
    if (
      event.origin !== window.location.origin ||
      event.source !== window.parent ||
      event.data?.source !== 'publish-platform'
    )
      return

    const message = event.data
    if (message.type === 'theme' && (message.mode === 'light' || message.mode === 'dark')) {
      setMode(message.mode)
    } else if (
      message.type === 'navigate' &&
      typeof message.path === 'string' &&
      /^\/(?!\/)/.test(message.path) &&
      !/[\\\r\n]/.test(message.path) &&
      message.path !== router.currentRoute.value.fullPath
    ) {
      void router.replace(message.path)
    }
  })

  // The platform owns browser history; the frame's router uses in-memory history.
  let ready = false
  router.afterEach((to, _from, failure) => {
    if (ready && !failure) post({ type: 'route', path: to.fullPath })
  })
  void router.isReady().then(() => {
    ready = true
    post({ type: 'ready', path: router.currentRoute.value.fullPath })
  })
}
