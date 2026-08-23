import { useAuthStore } from '@/stores/auth'

export function useManagerSelection() {
  const auth = useAuthStore()

  async function resolveManagerId(selectedManagerId: string): Promise<string> {
    const selected = selectedManagerId.trim()
    if (selected) return selected
    if (!auth.currentUser?.userId) await auth.refreshMe()
    return auth.currentUser?.userId?.trim() ?? ''
  }

  return { resolveManagerId }
}
