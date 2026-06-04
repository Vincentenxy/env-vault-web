import type { ParsedSecretPath } from '@/types/path'

/**
 * 解析 5 段式 Secret 路径 `org.project.env.folder.KEY`。
 *
 * 段风格:
 *  - 资源 code:小写字母数字中横线 `^[a-z0-9]+(-[a-z0-9]+)*$`
 *  - Secret key:大写字母数字下划线,以大写字母开头 `^[A-Z][A-Z0-9_]*$`
 *
 * 失败时返回 `null`,由调用方决定 UI。
 */
export function parseSecretPath(raw: string): ParsedSecretPath | null {
  if (typeof raw !== 'string') return null
  const parts = raw.split('.')
  if (parts.length !== 5) return null

  const [orgCode, projectCode, envCode, folderCode, key] = parts
  if (!orgCode || !projectCode || !envCode || !folderCode || !key) return null
  if (!isLowerHyphen(orgCode)) return null
  if (!isLowerHyphen(projectCode)) return null
  if (!isLowerHyphen(envCode)) return null
  if (!isLowerHyphen(folderCode)) return null
  if (!isSecretKey(key)) return null

  return { orgCode, projectCode, envCode, folderCode, key }
}

/** 把 ParsedSecretPath 拼回 `o.p.e.f.K`。 */
export function buildSecretPath(p: ParsedSecretPath): string {
  return `${p.orgCode}.${p.projectCode}.${p.envCode}.${p.folderCode}.${p.key}`
}

function isLowerHyphen(s: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s)
}

function isSecretKey(s: string): boolean {
  return /^[A-Z][A-Z0-9_]*$/.test(s)
}
