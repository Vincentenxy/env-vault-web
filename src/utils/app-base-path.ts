function normalizeBasePath(basePath: string): string {
  const value = basePath.trim().replace(/^\/+|\/+$/g, '')
  return value ? `/${value}` : ''
}

/** Add the Vite deployment base to a router-internal absolute path. */
export function withAppBase(path: string, basePath = import.meta.env.BASE_URL): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${normalizeBasePath(basePath)}${normalizedPath}`
}

/** Convert a browser pathname back to the path understood by Vue Router. */
export function stripAppBase(pathname: string, basePath = import.meta.env.BASE_URL): string {
  const normalizedBase = normalizeBasePath(basePath)
  if (!normalizedBase) return pathname
  if (pathname === normalizedBase) return '/'
  if (pathname.startsWith(`${normalizedBase}/`)) return pathname.slice(normalizedBase.length)
  return pathname
}
